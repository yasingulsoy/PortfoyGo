import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { NotificationService } from '../notifications';
import type { Queryable } from '../game/common';
import { MAX_GRANT_DAYS, PlanId, REMINDER_DAYS_BEFORE_END, TRIAL_DAYS, UPGRADE_PATH } from './config';
import { EntitlementState, PlanRow, SubscriptionRow, isCurrent, resolveEntitlements } from './entitlements';

/**
 * Abonelikler (migration 025). Yetki her istekte veritabanından çözülür (önbellek yok → yönetici tanımı / iptal
 * anında etkili olur). Ödeme sağlayıcısı yok; bkz. config.ts.
 *
 * Bildirimler 'account' kategorisindedir (kullanıcı kapatamaz) ve /abonelik sayfasına bağlanır:
 *   subscription.trial_started, subscription.granted, subscription.revoked,
 *   subscription.ending_soon (bitişten 3 gün önce, bir kez), subscription.expired
 */

const SUB_COLUMNS = `id, user_id, plan_id, status, source, starts_at, ends_at, canceled_at, created_at`;

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toSubRow(r: any): SubscriptionRow {
  return {
    id: r.id,
    user_id: r.user_id,
    plan_id: r.plan_id,
    status: r.status,
    source: r.source,
    starts_at: toDate(r.starts_at) ?? new Date(0),
    ends_at: toDate(r.ends_at),
    canceled_at: toDate(r.canceled_at),
    created_at: toDate(r.created_at) ?? new Date(0),
  };
}

function toPlan(r: any): PlanRow {
  const raw = typeof r.features === 'string' ? JSON.parse(r.features) : r.features;
  const features = Array.isArray(raw)
    ? raw
        .filter((f: any) => f && typeof f.key === 'string')
        .map((f: any) => ({ key: String(f.key), label: String(f.label ?? f.key) }))
    : [];
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    features,
    price_display: r.price_display,
    sort_order: Number(r.sort_order) || 0,
  };
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

export interface AdminSubscriptionItem {
  id: string;
  user_id: string;
  username: string | null;
  email: string | null;
  plan_id: PlanId;
  status: string;
  source: string;
  starts_at: string;
  ends_at: string | null;
  canceled_at: string | null;
  granted_by: string | null;
  granted_by_username: string | null;
  note: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export type AdminStatusFilter = 'current' | 'trial' | 'active' | 'canceled' | 'expired' | 'all';

export interface AdminListFilters {
  status: AdminStatusFilter;
  search?: string;
  limit: number;
  offset: number;
}

const iso = (v: unknown): string | null => toDate(v)?.toISOString() ?? null;

function toAdminItem(r: any): AdminSubscriptionItem {
  const row = toSubRow(r);
  return {
    id: r.id,
    user_id: r.user_id,
    username: r.username ?? null,
    email: r.email ?? null,
    plan_id: r.plan_id,
    status: r.status,
    source: r.source,
    starts_at: iso(r.starts_at)!,
    ends_at: iso(r.ends_at),
    canceled_at: iso(r.canceled_at),
    granted_by: r.granted_by ?? null,
    granted_by_username: r.granted_by_username ?? null,
    note: r.note ?? null,
    is_current: isCurrent(row, new Date()),
    created_at: iso(r.created_at)!,
    updated_at: iso(r.updated_at)!,
  };
}

/** Süresi geçmiş ama hâlâ trial/active görünen satırları kapatır (benzersiz "geçerli" indeksine takılmasın). */
async function closeStale(db: Queryable, userId: string): Promise<void> {
  await db.query(
    `UPDATE user_subscriptions SET status = 'expired', updated_at = now()
      WHERE user_id = $1 AND status IN ('trial', 'active') AND ends_at IS NOT NULL AND ends_at <= now()`,
    [userId]
  );
}

async function lockUser(client: PoolClient, userId: string): Promise<{ username: string }> {
  const r = await client.query(
    `SELECT username, COALESCE(is_deleted, false) AS is_deleted FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  if (!r.rows[0] || r.rows[0].is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
  return { username: r.rows[0].username };
}

async function inTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export class SubscriptionService {
  static async plans(db: Queryable = pool): Promise<PlanRow[]> {
    const r = await db.query(
      `SELECT id, name, description, features, price_display, sort_order FROM subscription_plans WHERE active ORDER BY sort_order, id`
    );
    return r.rows.map(toPlan);
  }

  static async rows(userId: string, db: Queryable = pool): Promise<SubscriptionRow[]> {
    const r = await db.query(
      `SELECT ${SUB_COLUMNS} FROM user_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return r.rows.map(toSubRow);
  }

  /** Kullanıcının güncel yetkileri (GET /api/me/entitlements, requireEntitlement). */
  static async state(userId: string, db: Queryable = pool): Promise<EntitlementState> {
    const [plans, rows] = await Promise.all([this.plans(db), this.rows(userId, db)]);
    return resolveEntitlements(rows, plans, new Date());
  }

  static async hasEntitlement(userId: string, feature: string): Promise<boolean> {
    return (await this.state(userId)).entitlements.includes(feature);
  }

  /** Tek seferlik 14 günlük Premium deneme. 409 TRIAL_ALREADY_USED | ALREADY_PREMIUM. */
  static async startTrial(userId: string): Promise<EntitlementState> {
    const endsAt = await inTx(async (client) => {
      await lockUser(client, userId);
      await closeStale(client, userId);
      const rows = await this.rows(userId, client);
      if (rows.some((r) => r.source === 'trial')) {
        throw new AppError(409, 'Ücretsiz deneme hakkını daha önce kullandın.', 'TRIAL_ALREADY_USED');
      }
      if (rows.some((r) => isCurrent(r, new Date()))) {
        throw new AppError(409, 'Zaten Premium erişimin var.', 'ALREADY_PREMIUM');
      }
      const ins = await client.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, source, starts_at, ends_at, note)
         VALUES ($1, 'premium', 'trial', 'trial', now(), now() + ($2::int * INTERVAL '1 day'), 'Ücretsiz deneme')
         RETURNING ends_at`,
        [userId, TRIAL_DAYS]
      );
      return toDate(ins.rows[0].ends_at)!;
    });
    await NotificationService.notify(userId, {
      type: 'subscription.trial_started',
      category: 'account',
      title: 'Premium denemen başladı',
      body: `${TRIAL_DAYS} gün boyunca Global Portföy Lab senaryolarını ve tüm araştırma notlarını kullanabilirsin. Deneme ${fmtDate(endsAt)} tarihinde kendiliğinden biter; ücret alınmaz.`,
      link: UPGRADE_PATH,
      data: { ends_at: endsAt.toISOString() },
    });
    return this.state(userId);
  }

  // -------------------------------------------------------------------------
  // Zamanlanmış iş: 'subscriptions-expire'
  // -------------------------------------------------------------------------

  /**
   * (1) Süresi dolan trial/active satırları 'expired' yapar ve kullanıcıya bildirir;
   * (2) bitişine ≤ 3 gün kalan satırlar için bir kez "süren bitiyor" bildirimi gönderir (ending_notified_at).
   * İdempotenttir (tek ifadeli UPDATE … RETURNING; aynı satır iki kez işlenmez).
   */
  static async expireJob(): Promise<{ expired: number; reminded: number }> {
    const expired = await pool.query(
      `UPDATE user_subscriptions SET status = 'expired', updated_at = now()
        WHERE status IN ('trial', 'active') AND ends_at IS NOT NULL AND ends_at <= now()
        RETURNING user_id, source`
    );
    for (const row of expired.rows) {
      const trial = row.source === 'trial';
      await NotificationService.notify(row.user_id, {
        type: 'subscription.expired',
        category: 'account',
        title: trial ? 'Premium deneme süren sona erdi' : 'Premium erişimin sona erdi',
        body: trial
          ? 'Deneme bitti; kayıtlı senaryoların silinmedi. Katalog ve sınıflandırma ücretsiz olarak açık kalır.'
          : 'Premium erişim süren doldu. Kayıtlı senaryoların silinmedi; katalog ve sınıflandırma ücretsiz olarak açık kalır.',
        link: UPGRADE_PATH,
        data: { source: row.source },
      });
    }

    const due = await pool.query(
      `UPDATE user_subscriptions SET ending_notified_at = now(), updated_at = now()
        WHERE status IN ('trial', 'active') AND ending_notified_at IS NULL AND ends_at IS NOT NULL
          AND ends_at > now() AND ends_at <= now() + ($1::int * INTERVAL '1 day')
        RETURNING user_id, source, ends_at`,
      [REMINDER_DAYS_BEFORE_END]
    );
    for (const row of due.rows) {
      const endsAt = toDate(row.ends_at)!;
      const trial = row.source === 'trial';
      await NotificationService.notify(row.user_id, {
        type: 'subscription.ending_soon',
        category: 'account',
        title: trial ? 'Premium denemen bitmek üzere' : 'Premium erişimin bitmek üzere',
        body: `${trial ? 'Deneme süren' : 'Premium erişimin'} ${fmtDate(endsAt)} tarihinde bitiyor. Ödeme alınmaz; süre dolunca hesabın ücretsiz plana döner.`,
        link: UPGRADE_PATH,
        data: { ends_at: endsAt.toISOString(), source: row.source },
      });
    }
    if (expired.rows.length > 0 || due.rows.length > 0) {
      logger.info({ expired: expired.rows.length, reminded: due.rows.length }, '[subscriptions] süre dolumu / hatırlatma');
    }
    return { expired: expired.rows.length, reminded: due.rows.length };
  }

  // -------------------------------------------------------------------------
  // Yönetici
  // -------------------------------------------------------------------------

  static async adminList(f: AdminListFilters): Promise<{
    items: AdminSubscriptionItem[];
    total: number;
    limit: number;
    offset: number;
    summary: { current_premium: number; current_trials: number; expiring_7d: number; trials_used: number };
  }> {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (f.status === 'current') {
      where.push(`s.status IN ('trial', 'active') AND (s.ends_at IS NULL OR s.ends_at > now())`);
    } else if (f.status !== 'all') {
      if (f.status === 'expired') {
        where.push(`(s.status = 'expired' OR (s.status IN ('trial', 'active') AND s.ends_at IS NOT NULL AND s.ends_at <= now()))`);
      } else if (f.status === 'trial' || f.status === 'active') {
        add('s.status = ?', f.status);
        where.push('(s.ends_at IS NULL OR s.ends_at > now())');
      } else {
        add('s.status = ?', f.status);
      }
    }
    if (f.search) {
      params.push(`%${f.search.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
      where.push(`(LOWER(u.username) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await pool.query(
      `SELECT COUNT(*)::int AS n FROM user_subscriptions s JOIN users u ON u.id = s.user_id ${whereSql}`,
      params
    );
    const rows = await pool.query(
      `SELECT s.*, u.username, u.email, g.username AS granted_by_username
         FROM user_subscriptions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN users g ON g.id = s.granted_by
         ${whereSql}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.limit, f.offset]
    );
    const sum = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active' AND (ends_at IS NULL OR ends_at > now()))::int AS current_premium,
         COUNT(*) FILTER (WHERE status = 'trial' AND ends_at > now())::int AS current_trials,
         COUNT(*) FILTER (WHERE status IN ('trial', 'active') AND ends_at > now() AND ends_at <= now() + INTERVAL '7 days')::int AS expiring_7d,
         COUNT(*) FILTER (WHERE source = 'trial')::int AS trials_used
       FROM user_subscriptions`
    );
    return {
      items: rows.rows.map(toAdminItem),
      total: Number(total.rows[0]?.n ?? 0),
      limit: f.limit,
      offset: f.offset,
      summary: {
        current_premium: Number(sum.rows[0]?.current_premium ?? 0),
        current_trials: Number(sum.rows[0]?.current_trials ?? 0),
        expiring_7d: Number(sum.rows[0]?.expiring_7d ?? 0),
        trials_used: Number(sum.rows[0]?.trials_used ?? 0),
      },
    };
  }

  /** Kullanıcı detayı (yönetim paneli rozeti + geçmiş) */
  static async adminUser(userId: string): Promise<{ user: { id: string; username: string }; state: EntitlementState; history: AdminSubscriptionItem[] }> {
    const u = await pool.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (!u.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    const history = await pool.query(
      `SELECT s.*, u.username, u.email, g.username AS granted_by_username
         FROM user_subscriptions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN users g ON g.id = s.granted_by
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC LIMIT 50`,
      [userId]
    );
    return { user: { id: u.rows[0].id, username: u.rows[0].username }, state: await this.state(userId), history: history.rows.map(toAdminItem) };
  }

  /**
   * Yönetici: Premium tanımla veya uzat.
   *  - mode 'grant' : geçerli abonelik (deneme dahil) varsa 'canceled' yapılır, yeni 'active' / 'admin' satırı açılır
   *                   (days null → süresiz).
   *  - mode 'extend': geçerli aboneliğin bitişi max(bitiş, şimdi) + days olur (süresizse 409).
   */
  static async adminGrant(
    adminId: string,
    userId: string,
    input: { days: number | null; note: string; mode: 'grant' | 'extend' }
  ): Promise<{ username: string; previous: { status: string; ends_at: string | null } | null; ends_at: string | null; subscription_id: string }> {
    if (input.days !== null && (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_GRANT_DAYS)) {
      throw new AppError(400, `Süre 1–${MAX_GRANT_DAYS} gün olmalı`, 'VALIDATION_ERROR');
    }
    if (input.mode === 'extend' && input.days === null) {
      throw new AppError(400, 'Uzatma için gün sayısı girin', 'VALIDATION_ERROR');
    }
    const result = await inTx(async (client) => {
      const { username } = await lockUser(client, userId);
      await closeStale(client, userId);
      const cur = await client.query(
        `SELECT id, status, ends_at FROM user_subscriptions
          WHERE user_id = $1 AND status IN ('trial', 'active') AND (ends_at IS NULL OR ends_at > now())
          ORDER BY starts_at DESC LIMIT 1 FOR UPDATE`,
        [userId]
      );
      const current = cur.rows[0] ?? null;
      const previous = current ? { status: current.status as string, ends_at: iso(current.ends_at) } : null;

      if (input.mode === 'extend') {
        if (!current) throw new AppError(409, 'Uzatılacak geçerli bir abonelik yok; önce Premium tanımlayın.', 'NO_ACTIVE_SUBSCRIPTION');
        if (current.ends_at === null) throw new AppError(409, 'Bu abonelik zaten süresiz.', 'ALREADY_UNLIMITED');
        const upd = await client.query(
          `UPDATE user_subscriptions
              SET ends_at = GREATEST(ends_at, now()) + ($2::int * INTERVAL '1 day'),
                  note = LEFT(CONCAT_WS(' · ', note, $3::text), 500),
                  ending_notified_at = NULL,
                  updated_at = now()
            WHERE id = $1 RETURNING id, ends_at`,
          [current.id, input.days, input.note]
        );
        return { username, previous, ends_at: iso(upd.rows[0].ends_at), subscription_id: upd.rows[0].id as string };
      }

      if (current) {
        await client.query(
          `UPDATE user_subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now(),
                  note = LEFT(CONCAT_WS(' · ', note, 'Yönetici tanımıyla değiştirildi'), 500)
            WHERE id = $1`,
          [current.id]
        );
      }
      const ins = await client.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, source, starts_at, ends_at, granted_by, note)
         VALUES ($1, 'premium', 'active', 'admin', now(),
                 CASE WHEN $2::int IS NULL THEN NULL ELSE now() + ($2::int * INTERVAL '1 day') END, $3, $4)
         RETURNING id, ends_at`,
        [userId, input.days, adminId, input.note]
      );
      return { username, previous, ends_at: iso(ins.rows[0].ends_at), subscription_id: ins.rows[0].id as string };
    });

    const endsText = result.ends_at ? `${fmtDate(new Date(result.ends_at))} tarihine kadar` : 'süresiz olarak';
    await NotificationService.notify(userId, {
      type: 'subscription.granted',
      category: 'account',
      title: input.mode === 'extend' ? 'Premium erişimin uzatıldı' : 'Premium erişim tanımlandı',
      body: `Global Portföy Lab Premium özellikleri ${endsText} açık. Ücret alınmaz.`,
      link: UPGRADE_PATH,
      data: { ends_at: result.ends_at, mode: input.mode },
    });
    return result;
  }

  /** Yönetici: geçerli aboneliği (deneme dahil) hemen sonlandırır. Geçerli abonelik yoksa 404. */
  static async adminRevoke(userId: string, note: string): Promise<{ username: string; subscription_id: string; previous: { status: string; source: string; ends_at: string | null } }> {
    const result = await inTx(async (client) => {
      const { username } = await lockUser(client, userId);
      await closeStale(client, userId);
      const cur = await client.query(
        `SELECT id, status, source, ends_at FROM user_subscriptions
          WHERE user_id = $1 AND status IN ('trial', 'active') AND (ends_at IS NULL OR ends_at > now())
          ORDER BY starts_at DESC LIMIT 1 FOR UPDATE`,
        [userId]
      );
      const current = cur.rows[0];
      if (!current) throw new AppError(404, 'Bu kullanıcının geçerli bir aboneliği yok.', 'NO_ACTIVE_SUBSCRIPTION');
      await client.query(
        `UPDATE user_subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now(),
                note = LEFT(CONCAT_WS(' · ', note, $2::text), 500)
          WHERE id = $1`,
        [current.id, note]
      );
      return {
        username,
        subscription_id: current.id as string,
        previous: { status: current.status as string, source: current.source as string, ends_at: iso(current.ends_at) },
      };
    });
    await NotificationService.notify(userId, {
      type: 'subscription.revoked',
      category: 'account',
      title: 'Premium erişimin sonlandırıldı',
      body: 'Hesabın ücretsiz plana döndü. Kayıtlı senaryoların silinmedi; katalog ve sınıflandırma açık kalır.',
      link: UPGRADE_PATH,
      data: { subscription_id: result.subscription_id },
    });
    return result;
  }
}
