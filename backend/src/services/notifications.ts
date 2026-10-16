import type { PoolClient } from 'pg';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { notificationBus, NotificationCategory, NotificationItem } from './notificationBus';

/**
 * Uygulama içi bildirimler (migration 009: notifications, announcements, users.notification_prefs).
 *
 * `NotificationService.notify(userIds, n, client?)` ASLA hata fırlatmaz (hatalar loglanır, 0 döner):
 *  - 'orders' ve 'competition' kategorileri kullanıcı tercihine uyar (prefs[category] === false → atlanır);
 *    'account' ve 'system' her zaman teslim edilir.
 *  - Toplu INSERT … SELECT (tek sorgu; tercih filtresi SQL içinde), ardından kullanıcı başına en yeni
 *    MAX_PER_USER bildirim tutulur (eskiler aynı çağrıda silinir).
 *  - Canlı yayın (SSE, notificationBus):
 *      • client verilmezse: INSERT (autocommit) sonrası hemen yayınlanır.
 *      • client verilirse (çağıranın transaction'ı): INSERT o client ile bir SAVEPOINT içinde yapılır
 *        (bildirim hatası çağıranın transaction'ını bozmaz) ve yayın, o client üzerinde çalıştırılan
 *        bir sonraki `COMMIT` başarıyla bitince (setImmediate ile) yapılır. `ROLLBACK` (ya da yeni bir
 *        `BEGIN`) bekleyen yayınları atar — geri alınan bildirimler hiç yayınlanmaz.
 *        Bu, client.query'ye bir kez takılan hafif bir kancayla yapılır (bkz. hookClient); çağıranın
 *        ek bir şey yapması gerekmez, yeter ki transaction'ı aynı client üzerinde `COMMIT` ile bitirsin.
 *        client transaction içinde değilse (SAVEPOINT reddedilirse) autocommit gibi davranılır.
 */

export const NOTIFICATION_CATEGORIES = ['orders', 'competition', 'account', 'system'] as const;
export type { NotificationCategory, NotificationItem };

/** Kullanıcının kapatabildiği kategoriler */
export const OPTIONAL_CATEGORIES = ['orders', 'competition'] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export const MAX_PER_USER = 200;

export interface NotificationInput {
  /** ör. 'order.filled', 'badge.earned', 'league.joined' (en fazla 48 karakter) */
  type: string;
  category: NotificationCategory;
  /** en fazla 160 karakter (fazlası kesilir) */
  title: string;
  /** en fazla 500 karakter (fazlası kesilir) */
  body: string;
  /** Sitede göreli yol ('/portfolio') ya da https URL; en fazla 255 karakter */
  link?: string | null;
  data?: Record<string, unknown> | null;
}

export interface NotificationPrefs {
  orders: boolean;
  competition: boolean;
  account: true;
  system: true;
  /** Haftalık e-posta özeti (019; bildirim kategorisi değildir). Varsayılan açık; e-postadaki bağlantıyla da kapatılır. */
  email_digest: boolean;
}

/** Bildirim kategorisi olmayan, kullanıcının açıp kapatabildiği e-posta tercihleri */
export const EMAIL_PREF_KEYS = ['email_digest'] as const;
export type EmailPrefKey = (typeof EMAIL_PREF_KEYS)[number];

export interface ListOptions {
  limit: number;
  /** Bu zamandan (hariç) daha eski bildirimler — önceki sayfanın next_before değeri */
  before?: string;
  unread?: boolean;
  category?: NotificationCategory;
}

export interface ListResult {
  items: NotificationItem[];
  next_before: string | null;
  unread_count: number;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  created_by_username: string | null;
  recipients: number;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cut = (v: string, max: number) => (v.length > max ? v.slice(0, max - 1) + '…' : v);

const toIso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function parseData(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v as Record<string, unknown>;
}

function toItem(r: any): NotificationItem {
  return {
    id: r.id,
    type: r.type,
    category: r.category,
    title: r.title,
    body: r.body,
    link: r.link ?? null,
    data: parseData(r.data),
    read_at: toIso(r.read_at),
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
  };
}

const ITEM_COLUMNS = 'id, user_id, type, category, title, body, link, data, read_at, created_at';
/** Mikro saniye hassasiyetli imleç (JS Date ms'ye keser; aynı ms'deki satırlar sayfa sınırında kaybolmasın) */
const CURSOR_EXPR = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor`;

// ---------------------------------------------------------------------------
// Commit sonrası yayın (client verilen notify çağrıları için)
// ---------------------------------------------------------------------------

const pendingByClient = new WeakMap<PoolClient, Array<() => void>>();
const HOOKED = Symbol.for('portfoygo.notifications.hooked');

function statementOf(arg: unknown): string {
  const text = typeof arg === 'string' ? arg : (arg as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text.trim().replace(/;+\s*$/, '').toUpperCase() : '';
}

function hookClient(client: PoolClient): void {
  const anyClient = client as any;
  if (anyClient[HOOKED]) return;
  anyClient[HOOKED] = true;
  const original = client.query;
  anyClient.query = function hookedQuery(this: unknown, ...args: unknown[]) {
    const stmt = statementOf(args[0]);
    const result = (original as (...a: unknown[]) => unknown).apply(client, args);
    if (stmt === 'BEGIN' || stmt.startsWith('BEGIN ') || stmt.startsWith('START TRANSACTION')) {
      pendingByClient.delete(client);
    } else if (stmt === 'COMMIT' || stmt === 'END' || stmt === 'COMMIT TRANSACTION') {
      const pending = pendingByClient.get(client);
      pendingByClient.delete(client);
      if (pending?.length) {
        const run = () => setImmediate(() => pending.forEach((fn) => fn()));
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(run, () => undefined);
        } else {
          run();
        }
      }
    } else if (stmt.startsWith('ROLLBACK') && !/\bTO\b/.test(stmt)) {
      pendingByClient.delete(client);
    }
    return result;
  };
}

function publishItems(rows: any[]): void {
  for (const r of rows) {
    const userId = String(r.user_id);
    if (notificationBus.subscriberCount(userId) === 0) continue;
    notificationBus.publish(userId, { kind: 'notification', item: toItem(r) });
  }
}

type Queryable = { query: PoolClient['query'] };

async function pruneUsers(db: Queryable, userIds: string[] | null): Promise<void> {
  // Yalnızca sınırı aşan kullanıcılar etkilenir; (user_id, created_at DESC) indeksi kullanılır
  const filter = userIds ? 'WHERE user_id = ANY($1::uuid[])' : '';
  await db.query(
    `DELETE FROM notifications n
      USING (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
            FROM notifications ${filter}
        ) ranked
        WHERE ranked.rn > ${MAX_PER_USER}
      ) old
      WHERE n.id = old.id`,
    userIds ? [userIds] : []
  );
}

function normalizeInput(n: NotificationInput) {
  return {
    type: cut(String(n.type || 'system.generic'), 48),
    category: n.category,
    title: cut(String(n.title || ''), 160),
    body: cut(String(n.body || ''), 500),
    link: n.link ? String(n.link).slice(0, 255) : null,
    data: n.data ? JSON.stringify(n.data) : null,
  };
}

export class NotificationService {
  /**
   * Bir veya birden fazla kullanıcıya bildirim gönderir. Hata fırlatmaz.
   * @returns gerçekten oluşturulan bildirim sayısı (tercih nedeniyle atlananlar hariç)
   */
  static async notify(userIds: string | string[], n: NotificationInput, client?: PoolClient): Promise<number> {
    try {
      const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : [userIds]).filter((id) => typeof id === 'string' && UUID_RE.test(id))));
      if (ids.length === 0) return 0;
      if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(n.category)) {
        logger.warn({ type: n.type, category: n.category }, '[notifications] Geçersiz kategori; bildirim atlandı');
        return 0;
      }
      const v = normalizeInput(n);

      const insertSql = `
        INSERT INTO notifications (user_id, type, category, title, body, link, data, created_at)
        SELECT u.id, $2::text, $3::text, $4::text, $5::text, $6::text, $7::jsonb, clock_timestamp()
          FROM users u
         WHERE u.id = ANY($1::uuid[])
           AND ($3::text IN ('account', 'system') OR (u.notification_prefs -> $3::text) IS DISTINCT FROM 'false'::jsonb)
        RETURNING ${ITEM_COLUMNS}`;
      const params = [ids, v.type, v.category, v.title, v.body, v.link, v.data];

      if (client) {
        let inTx = true;
        try {
          await client.query('SAVEPOINT notifications_sp');
        } catch {
          inTx = false; // transaction dışında: autocommit gibi davran
        }
        if (inTx) {
          try {
            const res = await client.query(insertSql, params);
            if (res.rows.length > 0) await pruneUsers(client, ids);
            await client.query('RELEASE SAVEPOINT notifications_sp');
            if (res.rows.length > 0) {
              hookClient(client);
              const list = pendingByClient.get(client) ?? [];
              list.push(() => publishItems(res.rows));
              pendingByClient.set(client, list);
            }
            return res.rows.length;
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT notifications_sp').catch(() => undefined);
            throw err;
          }
        }
        const res = await client.query(insertSql, params);
        if (res.rows.length > 0) {
          await pruneUsers(client, ids);
          publishItems(res.rows);
        }
        return res.rows.length;
      }

      const res = await pool.query(insertSql, params);
      if (res.rows.length > 0) {
        await pruneUsers(pool, ids);
        publishItems(res.rows);
      }
      return res.rows.length;
    } catch (error: any) {
      logger.error({ err: error, type: n?.type }, `[notifications] Bildirim oluşturulamadı: ${error?.message || error}`);
      return 0;
    }
  }

  /**
   * Yasaklı olmayan TÜM kullanıcılara bildirim gönderir (duyurular). Kategori 'system'/'account' değilse
   * tercihlere uyulur. Hata FIRLATIR (yönetici uç noktası hatayı görmeli). Alıcı sayısını döndürür.
   */
  static async broadcast(n: NotificationInput, db: Queryable = pool): Promise<{ recipients: number; rows: any[] }> {
    const v = normalizeInput(n);
    const res = await db.query(
      `INSERT INTO notifications (user_id, type, category, title, body, link, data, created_at)
       SELECT u.id, $1::text, $2::text, $3::text, $4::text, $5::text, $6::jsonb, clock_timestamp()
         FROM users u
        WHERE COALESCE(u.is_banned, FALSE) = FALSE
          AND COALESCE(u.is_deleted, FALSE) = FALSE
          AND ($2::text IN ('account', 'system') OR (u.notification_prefs -> $2::text) IS DISTINCT FROM 'false'::jsonb)
       RETURNING ${ITEM_COLUMNS}`,
      [v.type, v.category, v.title, v.body, v.link, v.data]
    );
    if (res.rows.length > 0) await pruneUsers(db, null);
    return { recipients: res.rows.length, rows: res.rows };
  }

  static async list(userId: string, opts: ListOptions): Promise<ListResult> {
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];
    if (opts.before) {
      params.push(opts.before);
      where.push(`created_at < $${params.length}::timestamptz`);
    }
    if (opts.unread) where.push('read_at IS NULL');
    if (opts.category) {
      params.push(opts.category);
      where.push(`category = $${params.length}`);
    }
    params.push(opts.limit + 1);
    const res = await pool.query(
      `SELECT ${ITEM_COLUMNS}, ${CURSOR_EXPR}
         FROM notifications
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length}`,
      params
    );
    const hasMore = res.rows.length > opts.limit;
    const rows = hasMore ? res.rows.slice(0, opts.limit) : res.rows;
    return {
      items: rows.map(toItem),
      next_before: hasMore && rows.length > 0 ? String(rows[rows.length - 1].cursor) : null,
      unread_count: await NotificationService.unreadCount(userId),
    };
  }

  static async unreadCount(userId: string): Promise<number> {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return Number(r.rows[0]?.n ?? 0);
  }

  /** Sahibine ait değilse / yoksa null. Zaten okunmuşsa mevcut read_at döner. */
  static async markRead(userId: string, id: string): Promise<{ id: string; read_at: string } | null> {
    if (!UUID_RE.test(id)) return null;
    const r = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = $1 AND user_id = $2
        RETURNING id, read_at`,
      [id, userId]
    );
    if (r.rows.length === 0) return null;
    notificationBus.publish(userId, { kind: 'unread_changed' });
    return { id: r.rows[0].id, read_at: toIso(r.rows[0].read_at)! };
  }

  static async markAllRead(userId: string, category?: NotificationCategory): Promise<number> {
    const params: unknown[] = [userId];
    let sql = 'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL';
    if (category) {
      params.push(category);
      sql += ' AND category = $2';
    }
    const r = await pool.query(sql, params);
    const updated = r.rowCount ?? 0;
    if (updated > 0) notificationBus.publish(userId, { kind: 'unread_changed' });
    return updated;
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    const r = await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING read_at', [id, userId]);
    if (r.rows.length === 0) return false;
    if (r.rows[0].read_at === null) notificationBus.publish(userId, { kind: 'unread_changed' });
    return true;
  }

  static async getPrefs(userId: string): Promise<NotificationPrefs> {
    const r = await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [userId]);
    return NotificationService.toPrefs(r.rows[0]?.notification_prefs);
  }

  static async setPrefs(userId: string, patch: Partial<Record<OptionalCategory | EmailPrefKey, boolean>>): Promise<NotificationPrefs> {
    const clean: Record<string, boolean> = {};
    for (const key of [...OPTIONAL_CATEGORIES, ...EMAIL_PREF_KEYS]) {
      if (typeof patch[key] === 'boolean') clean[key] = patch[key] as boolean;
    }
    const r = await pool.query(
      `UPDATE users SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || $2::jsonb
        WHERE id = $1 RETURNING notification_prefs`,
      [userId, JSON.stringify(clean)]
    );
    return NotificationService.toPrefs(r.rows[0]?.notification_prefs);
  }

  static toPrefs(raw: unknown): NotificationPrefs {
    const p = (parseData(raw) ?? {}) as Record<string, unknown>;
    return {
      orders: p.orders !== false,
      competition: p.competition !== false,
      account: true,
      system: true,
      email_digest: p.email_digest !== false,
    };
  }

  // -------------------------------------------------------------------------
  // Duyurular (yönetici)
  // -------------------------------------------------------------------------

  /** Duyuru kaydı + yasaklı olmayan herkese 'system.announcement' bildirimi (tek transaction). */
  static async createAnnouncement(
    adminId: string | null,
    input: { title: string; body: string; link?: string | null }
  ): Promise<{ id: string; recipients: number }> {
    const client = await pool.connect();
    let rows: any[] = [];
    let result: { id: string; recipients: number };
    try {
      await client.query('BEGIN');
      const a = await client.query(
        `INSERT INTO announcements (title, body, link, created_by, recipients)
         VALUES ($1, $2, $3, $4, 0) RETURNING id`,
        [input.title, input.body, input.link ?? null, adminId]
      );
      const id = a.rows[0].id as string;
      const b = await NotificationService.broadcast(
        {
          type: 'system.announcement',
          category: 'system',
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          data: { announcement_id: id },
        },
        client
      );
      rows = b.rows;
      await client.query('UPDATE announcements SET recipients = $2 WHERE id = $1', [id, b.recipients]);
      await client.query('COMMIT');
      result = { id, recipients: b.recipients };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    setImmediate(() => publishItems(rows));
    return result;
  }

  static async listAnnouncements(limit: number, offset: number): Promise<{ items: AnnouncementRow[]; total: number; limit: number; offset: number }> {
    const total = await pool.query('SELECT COUNT(*)::int AS n FROM announcements');
    const r = await pool.query(
      `SELECT a.id, a.title, a.body, a.link, u.username AS created_by_username, a.recipients, a.created_at
         FROM announcements a
         LEFT JOIN users u ON u.id = a.created_by
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      items: r.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        link: row.link ?? null,
        created_by_username: row.created_by_username ?? null,
        recipients: Number(row.recipients ?? 0),
        created_at: toIso(row.created_at)!,
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }
}

// ---------------------------------------------------------------------------
// Ortak metin yardımcıları (tetikleyiciler için)
// ---------------------------------------------------------------------------

const tryFormatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

/** 1234.5 → "₺1.234,50" */
export function formatTry(value: number): string {
  return Number.isFinite(value) ? tryFormatter.format(value) : '-';
}
