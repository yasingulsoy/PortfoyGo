import type { PoolClient } from 'pg';
import pool from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { EQUITY_SQL, generateInviteCode, normalizeInviteCode } from '../utils/competition';
import type { LeagueDuration } from '../utils/validation';
import { NotificationService, NotificationInput } from './notifications';
import { GameService } from './game/service';

/**
 * Ligler (özel: davet kodu; herkese açık: keşfet + tek tıkla katıl).
 *
 * Yaşam döngüsü (durum hesaplanır, saklanmaz):
 *  - upcoming : starts_at gelmedi (started_at NULL). Bu sırada katılanların referansı henüz yok
 *               (baseline_set_at NULL); sıralama/getiri gösterilmez.
 *  - active   : lig başladı. Başlangıç işi (leagues-start, her dakika) lig satırını kilitleyip tüm
 *               üyelerin referansını (baseline_equity) o anki toplam varlıklarına eşitler.
 *               Başladıktan sonra katılanların referansı katılım anındaki varlıklarıdır.
 *  - finished : ends_at geçti → kapanış işi (leagues-finalize, her dakika) değerleri dondurur
 *               (final_equity / final_return_pct / final_rank) ve finalized_at yazar. Bitmiş lige katılınamaz.
 *  ends_at NULL → süresiz lig (hiç kapanmaz).
 *
 * Sıralama: lig getirisi % = (toplam varlık − referans) / referans × 100; eşitlikte önce katılan önde.
 * Bakiyeler sıfırlanmaz. Başlatma/kapanış idempotenttir ve eşzamanlı çalıştırmaya karşı güvenlidir
 * (lig satırı FOR UPDATE + durum kontrolü); bildirimler aynı transaction içinde yazılır (yalnızca
 * geçişi gerçekten yapan çalıştırma bildirim üretir).
 */

export const LEAGUE_MAX_MEMBERS = 50;
/** Bitmemiş liglerdeki üyelik sınırı (biten ligler sayılmaz) */
export const MAX_LEAGUES_PER_USER = 10;
/** Bitmemiş liglerdeki sahiplik sınırı */
export const MAX_OWNED_LEAGUES = 5;
const INVITE_RETRIES = 8;
/** Bir iş turunda işlenecek en fazla lig (geri kalanlar bir sonraki dakikada) */
const JOB_BATCH = 200;

export type LeagueRole = 'owner' | 'member';
export type LeagueVisibility = 'private' | 'public';
export type LeagueStatus = 'upcoming' | 'active' | 'finished';
export type LeagueStatusFilter = LeagueStatus | 'open';

/** Süre → PostgreSQL interval */
export const LEAGUE_DURATION_INTERVALS: Record<LeagueDuration, string> = {
  '1d': '1 day',
  '3d': '3 days',
  '1w': '7 days',
  '2w': '14 days',
  '1m': '1 month',
  '3m': '3 months',
};

export interface LeagueSummary {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  owner_username: string;
  role: LeagueRole;
  member_count: number;
  max_members: number;
  /** upcoming → null; finished → dondurulmuş sıra */
  my_rank: number | null;
  my_return_pct: number | null;
  /** Sadece biten liglerde dolu */
  my_final_rank: number | null;
  visibility: LeagueVisibility;
  status: LeagueStatus;
  starts_at: Date;
  started_at: Date | null;
  ends_at: Date | null;
  finalized_at: Date | null;
  created_at: Date;
}

export interface LeagueMemberStanding {
  /** upcoming → null; referansı olmayan üye → null; finished → final_rank */
  rank: number | null;
  user_id: string;
  username: string;
  role: LeagueRole;
  /** Referans henüz yoksa (lig başlamadı) null */
  baseline_equity: number | null;
  baseline_set: boolean;
  /** finished → dondurulmuş varlık; aksi halde canlı */
  equity: number;
  return_pct: number | null;
  profit_tl: number | null;
  final_rank: number | null;
  final_return_pct: number | null;
  joined_at: Date;
  is_me: boolean;
}

export interface LeaguePreview {
  name: string;
  description: string | null;
  owner_username: string;
  member_count: number;
  max_members: number;
  visibility: LeagueVisibility;
  status: LeagueStatus;
  starts_at: Date;
  ends_at: Date | null;
  already_member: boolean;
}

export interface PublicLeagueItem {
  id: string;
  name: string;
  description: string | null;
  owner_username: string;
  member_count: number;
  max_members: number;
  status: LeagueStatus;
  starts_at: Date;
  ends_at: Date | null;
  is_member: boolean;
}

export interface LeagueFeedItem {
  id: string;
  user_id: string;
  username: string;
  type: 'buy' | 'sell';
  symbol: string;
  asset_type: string;
  created_at: Date;
}

export interface CreateLeagueInput {
  name: string;
  description?: string | null;
  visibility?: LeagueVisibility;
  /** Yoksa hemen başlar */
  starts_at?: Date | null;
  /** ends_at'ten önceliklidir */
  duration?: LeagueDuration | null;
  ends_at?: Date | null;
}

export interface UpdateLeagueInput {
  name?: string;
  description?: string | null;
  visibility?: LeagueVisibility;
  starts_at?: Date;
  duration?: LeagueDuration;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const intOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : parseInt(String(v), 10));
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

const NOT_FOUND = () => new AppError(404, 'Lig bulunamadı', 'LEAGUE_NOT_FOUND');
const INVALID_CODE = () => new AppError(404, 'Davet kodu geçersiz', 'INVALID_INVITE_CODE');
const OWNER_ONLY = () => new AppError(403, 'Bu işlemi sadece lig sahibi yapabilir', 'LEAGUE_OWNER_ONLY');
const LEAGUE_ENDED = () => new AppError(400, 'Bu lig sona erdi; artık katılınamaz', 'LEAGUE_ENDED');

/** Lig durumu (l = leagues takma adı). Kapanış işi henüz çalışmamış olsa da ends_at geçtiyse 'finished'. */
const STATUS_SQL = `(CASE
    WHEN l.finalized_at IS NOT NULL OR (l.ends_at IS NOT NULL AND l.ends_at <= now()) THEN 'finished'
    WHEN l.started_at IS NULL AND l.starts_at > now() THEN 'upcoming'
    ELSE 'active'
  END)`;

const LEAGUE_COLUMNS = `l.id, l.name, l.description, l.invite_code, l.owner_id, l.max_members, l.visibility,
  l.starts_at, l.started_at, l.ends_at, l.finalized_at, l.created_at, ${STATUS_SQL} AS status`;

/** Lig getirisi (lm = league_members, u = users) */
const RETURN_SQL = `((${EQUITY_SQL} - lm.baseline_equity) / lm.baseline_equity)`;

/**
 * Kullanıcının ligleri + kendi sırası. $1 = user_id.
 * Canlı sıra yalnızca referansı olan (baseline_set_at dolu) üyeler arasındadır.
 */
const MY_LEAGUES_SQL = `
  WITH mine AS (
    SELECT league_id, role, final_rank, final_return_pct FROM league_members WHERE user_id = $1
  ),
  ranked AS (
    SELECT lm.league_id, lm.user_id,
           ${RETURN_SQL} * 100 AS ret,
           ROW_NUMBER() OVER (
             PARTITION BY lm.league_id
             ORDER BY ${RETURN_SQL} DESC, lm.joined_at ASC, lm.user_id ASC
           ) AS rn
      FROM league_members lm
      JOIN users u ON u.id = lm.user_id
     WHERE lm.league_id IN (SELECT league_id FROM mine) AND lm.baseline_set_at IS NOT NULL
  ),
  counts AS (
    SELECT league_id, COUNT(*)::int AS member_count
      FROM league_members
     WHERE league_id IN (SELECT league_id FROM mine)
     GROUP BY league_id
  )
  SELECT ${LEAGUE_COLUMNS},
         ow.username AS owner_username, mine.role, mine.final_rank AS my_final_rank, mine.final_return_pct AS my_final_return_pct,
         c.member_count, r.rn AS my_rank, r.ret AS my_return_pct
    FROM leagues l
    JOIN mine ON mine.league_id = l.id
    JOIN users ow ON ow.id = l.owner_id
    LEFT JOIN counts c ON c.league_id = l.id
    LEFT JOIN ranked r ON r.league_id = l.id AND r.user_id = $1`;

function mapSummary(row: any): LeagueSummary {
  const finished = row.finalized_at !== null && row.finalized_at !== undefined;
  const upcoming = !finished && (row.started_at === null || row.started_at === undefined);
  let myRank: number | null;
  let myReturn: number | null;
  if (finished) {
    myRank = intOrNull(row.my_final_rank);
    myReturn = numOrNull(row.my_final_return_pct);
  } else if (upcoming) {
    myRank = null;
    myReturn = null;
  } else {
    myRank = intOrNull(row.my_rank);
    myReturn = row.my_return_pct === null || row.my_return_pct === undefined ? null : round4(num(row.my_return_pct));
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    invite_code: row.invite_code,
    owner_username: row.owner_username,
    role: row.role,
    member_count: parseInt(row.member_count ?? 0, 10),
    max_members: parseInt(row.max_members, 10),
    my_rank: myRank,
    my_return_pct: myReturn,
    my_final_rank: finished ? intOrNull(row.my_final_rank) : null,
    visibility: row.visibility,
    status: row.status,
    starts_at: row.starts_at,
    started_at: row.started_at ?? null,
    ends_at: row.ends_at ?? null,
    finalized_at: row.finalized_at ?? null,
    created_at: row.created_at,
  };
}

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Kullanıcı satırını kilitler (aynı kullanıcının eşzamanlı oluştur/katıl isteklerini sıraya sokar),
 * doğrulama durumunu, kullanıcı adını ve güncel toplam varlığını döndürür.
 */
async function lockUser(client: PoolClient, userId: string): Promise<{ verified: boolean; equity: number; username: string }> {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const r = await client.query(
    `SELECT u.email_verified, u.username, ROUND(${EQUITY_SQL}, 2) AS equity FROM users u WHERE u.id = $1`,
    [userId]
  );
  if (!r.rows[0]) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
  return { verified: r.rows[0].email_verified === true, equity: num(r.rows[0].equity), username: r.rows[0].username };
}

function assertPositiveEquity(equity: number): void {
  if (!(equity > 0)) {
    throw new AppError(400, 'Toplam varlığın sıfır olduğu için lige katılamazsın', 'NO_EQUITY');
  }
}

/** Bitmemiş liglerdeki üyelik / sahiplik sayıları */
async function activeMembershipCounts(client: PoolClient, userId: string): Promise<{ total: number; owned: number }> {
  const r = await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE m.role = 'owner')::int AS owned
       FROM league_members m
       JOIN leagues l ON l.id = m.league_id
      WHERE m.user_id = $1 AND l.finalized_at IS NULL`,
    [userId]
  );
  return { total: r.rows[0].total, owned: r.rows[0].owned };
}

/** Bildirim (asla hata fırlatmaz; client verilirse çağıranın transaction'ına dahil olur) */
async function notify(userIds: string | string[], n: NotificationInput, client?: PoolClient): Promise<void> {
  try {
    await NotificationService.notify(userIds, n, client);
  } catch (err: any) {
    logger.error({ err, type: n.type }, `[leagues] Bildirim gönderilemedi: ${err?.message || err}`);
  }
}

/** 4.2153 → "+%4,22" */
function formatPct(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}%${Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const leagueLink = (id: string) => `/leagues/${id}`;

interface LockedLeague {
  id: string;
  name: string;
  owner_id: string;
  max_members: number;
  started: boolean;
  ended: boolean;
}

const LOCK_LEAGUE_COLUMNS = `id, name, owner_id, max_members, (started_at IS NOT NULL) AS started,
  (finalized_at IS NOT NULL OR (ends_at IS NOT NULL AND ends_at <= now())) AS ended`;

function mapLocked(row: any): LockedLeague {
  return {
    id: row.id,
    name: row.name,
    owner_id: row.owner_id,
    max_members: parseInt(row.max_members, 10),
    started: row.started === true,
    ended: row.ended === true,
  };
}

export class LeagueService {
  // -------------------------------------------------------------------------
  // Yaşam döngüsü (cron + istek anında tembel geçiş)
  // -------------------------------------------------------------------------

  /**
   * Ligi başlatır: tüm üyelerin referansını şu anki toplam varlığa eşitler (referansı zaten olanlar
   * hariç), started_at yazar ve üyelere 'league.started' bildirimi gönderir.
   * Zaten başlamışsa / henüz zamanı gelmediyse hiçbir şey yapmaz.
   * @returns bu çağrı ligi başlattıysa true
   */
  static async startLeague(leagueId: string): Promise<boolean> {
    return withTx(async (client) => {
      const r = await client.query(
        `SELECT id, name, started_at, (starts_at <= now()) AS due FROM leagues WHERE id = $1 FOR UPDATE`,
        [leagueId]
      );
      const league = r.rows[0];
      if (!league || league.started_at !== null || league.due !== true) return false;

      // Toplam varlığı 0 olan üyenin referansı yazılamaz (baseline > 0 kısıtı) → sıralamaya girmez
      await client.query(
        `UPDATE league_members lm
            SET baseline_equity = ROUND(${EQUITY_SQL}, 2), baseline_set_at = now()
           FROM users u
          WHERE lm.league_id = $1 AND u.id = lm.user_id AND lm.baseline_set_at IS NULL
            AND ROUND(${EQUITY_SQL}, 2) > 0`,
        [leagueId]
      );
      await client.query(`UPDATE leagues SET started_at = now() WHERE id = $1`, [leagueId]);

      const members = await client.query(`SELECT user_id FROM league_members WHERE league_id = $1`, [leagueId]);
      await notify(
        members.rows.map((m: any) => m.user_id),
        {
          type: 'league.started',
          category: 'competition',
          title: `${league.name} başladı!`,
          body: 'Başlangıç varlığın kaydedildi. Bol şans!',
          link: leagueLink(leagueId),
          data: { league_id: leagueId },
        },
        client
      );
      return true;
    });
  }

  /**
   * Ligi kapatır: referansı olan üyelerin son değerlerini ve sıralarını dondurur, finalized_at yazar,
   * her üyeye sırasıyla 'league.finished' bildirimi gönderir. Zaten kapanmışsa, henüz bitmediyse
   * veya hiç başlamadıysa hiçbir şey yapmaz.
   * @returns bu çağrı ligi kapattıysa true
   */
  static async finalizeLeague(leagueId: string): Promise<boolean> {
    return withTx(async (client) => {
      const r = await client.query(
        `SELECT id, name, started_at, finalized_at, (ends_at IS NOT NULL AND ends_at <= now()) AS due
           FROM leagues WHERE id = $1 FOR UPDATE`,
        [leagueId]
      );
      const league = r.rows[0];
      if (!league || league.finalized_at !== null || league.started_at === null || league.due !== true) return false;

      await client.query(
        `UPDATE league_members lm
            SET final_equity = ROUND(${EQUITY_SQL}, 2),
                final_return_pct = ROUND(${RETURN_SQL} * 100, 4)
           FROM users u
          WHERE lm.league_id = $1 AND u.id = lm.user_id AND lm.baseline_set_at IS NOT NULL`,
        [leagueId]
      );
      await client.query(`UPDATE league_members SET final_rank = NULL WHERE league_id = $1`, [leagueId]);
      await client.query(
        `UPDATE league_members lm
            SET final_rank = x.rn
           FROM (
             SELECT user_id,
                    ROW_NUMBER() OVER (
                      ORDER BY (final_equity - baseline_equity) / baseline_equity DESC, joined_at ASC, user_id ASC
                    ) AS rn
               FROM league_members
              WHERE league_id = $1 AND baseline_set_at IS NOT NULL AND final_equity IS NOT NULL
           ) x
          WHERE lm.league_id = $1 AND lm.user_id = x.user_id`,
        [leagueId]
      );
      await client.query(`UPDATE leagues SET finalized_at = now() WHERE id = $1`, [leagueId]);

      const members = await client.query(
        `SELECT user_id, final_rank, final_return_pct FROM league_members WHERE league_id = $1`,
        [leagueId]
      );
      for (const m of members.rows) {
        const rank = intOrNull(m.final_rank);
        const ret = numOrNull(m.final_return_pct);
        const title =
          rank === 1
            ? `🏆 ${league.name} şampiyonu oldun!`
            : rank !== null
              ? `${league.name} sona erdi — ${rank}. oldun`
              : `${league.name} sona erdi`;
        const body =
          rank !== null && ret !== null
            ? `Lig getirin: ${formatPct(ret)}. Sonuçlar donduruldu.`
            : 'Lig başladığında varlığın kaydedilmediği için sıralamaya girmedin.';
        await notify(
          m.user_id,
          {
            type: 'league.finished',
            category: 'competition',
            title,
            body,
            link: leagueLink(leagueId),
            data: { league_id: leagueId, rank, return_pct: ret },
          },
          client
        );
      }
      return true;
    });
  }

  /** Zamanı gelmiş ligleri başlatır (cron: leagues-start). @returns başlatılan lig sayısı */
  static async startDue(): Promise<number> {
    const r = await pool.query(
      `SELECT id FROM leagues WHERE started_at IS NULL AND starts_at <= now() ORDER BY starts_at ASC LIMIT ${JOB_BATCH}`
    );
    let n = 0;
    for (const row of r.rows) {
      if (await this.startLeague(row.id)) n += 1;
    }
    return n;
  }

  /**
   * Süresi dolmuş ligleri kapatır (cron: leagues-finalize). Henüz başlatılmamış (başlatma işi
   * kaçırılmış) ligler önce başlatılır. @returns kapatılan lig sayısı
   */
  static async finalizeDue(): Promise<number> {
    const r = await pool.query(
      `SELECT id, started_at FROM leagues
        WHERE finalized_at IS NULL AND ends_at IS NOT NULL AND ends_at <= now()
        ORDER BY ends_at ASC LIMIT ${JOB_BATCH}`
    );
    let n = 0;
    for (const row of r.rows) {
      if (row.started_at === null) await this.startLeague(row.id);
      if (await this.finalizeLeague(row.id)) n += 1;
    }
    return n;
  }

  /**
   * Cron'u beklemeden: verilen liglerden (veya kullanıcının liglerinden) zamanı gelmiş başlatma /
   * kapanışları uygular. Normal durumda tek ucuz sorgu.
   */
  private static async refreshDue(filter: { leagueId?: string; userId?: string }): Promise<void> {
    const params: unknown[] = [];
    let where: string;
    if (filter.leagueId) {
      params.push(filter.leagueId);
      where = `l.id = $1`;
    } else if (filter.userId) {
      params.push(filter.userId);
      where = `l.id IN (SELECT league_id FROM league_members WHERE user_id = $1)`;
    } else {
      return;
    }
    const r = await pool.query(
      `SELECT l.id,
              (l.started_at IS NULL AND l.starts_at <= now()) AS need_start,
              (l.finalized_at IS NULL AND l.ends_at IS NOT NULL AND l.ends_at <= now()) AS need_finalize
         FROM leagues l
        WHERE ${where}
          AND ((l.started_at IS NULL AND l.starts_at <= now())
               OR (l.finalized_at IS NULL AND l.ends_at IS NOT NULL AND l.ends_at <= now()))`,
      params
    );
    for (const row of r.rows) {
      if (row.need_start) await this.startLeague(row.id);
      if (row.need_finalize) await this.finalizeLeague(row.id);
    }
  }

  // -------------------------------------------------------------------------
  // Okuma
  // -------------------------------------------------------------------------

  static async listMine(userId: string): Promise<LeagueSummary[]> {
    await this.refreshDue({ userId });
    const r = await pool.query(`${MY_LEAGUES_SQL} ORDER BY l.created_at DESC`, [userId]);
    return r.rows.map(mapSummary);
  }

  private static async getSummary(leagueId: string, userId: string): Promise<LeagueSummary & { owner_id: string }> {
    await this.refreshDue({ leagueId });
    const r = await pool.query(`${MY_LEAGUES_SQL} WHERE l.id = $2`, [userId, leagueId]);
    if (!r.rows[0]) throw NOT_FOUND();
    return { ...mapSummary(r.rows[0]), owner_id: r.rows[0].owner_id };
  }

  static async preview(userId: string, rawCode: string): Promise<LeaguePreview> {
    const code = normalizeInviteCode(rawCode);
    if (!code) throw INVALID_CODE();
    const r = await pool.query(
      `SELECT l.name, l.description, l.max_members, l.visibility, l.starts_at, l.ends_at, ${STATUS_SQL} AS status,
              ow.username AS owner_username,
              (SELECT COUNT(*)::int FROM league_members m WHERE m.league_id = l.id) AS member_count,
              EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = l.id AND m.user_id = $2) AS already_member
         FROM leagues l
         JOIN users ow ON ow.id = l.owner_id
        WHERE l.invite_code = $1`,
      [code, userId]
    );
    const row = r.rows[0];
    if (!row) throw INVALID_CODE();
    return {
      name: row.name,
      description: row.description ?? null,
      owner_username: row.owner_username,
      member_count: parseInt(row.member_count, 10),
      max_members: parseInt(row.max_members, 10),
      visibility: row.visibility,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at ?? null,
      already_member: row.already_member === true,
    };
  }

  /**
   * Herkese açık ligler. status: upcoming | active | finished | open (= upcoming + active).
   * Sıralama: aktifler, sonra yaklaşanlar (en erken başlayan önce), bitenler (en yeni önce).
   */
  static async listPublic(opts: {
    userId?: string;
    search?: string;
    status: LeagueStatusFilter;
    limit: number;
    offset: number;
  }): Promise<{ items: PublicLeagueItem[]; total: number; limit: number; offset: number }> {
    const statuses: LeagueStatus[] = opts.status === 'open' ? ['upcoming', 'active'] : [opts.status];
    const pattern = opts.search ? `%${opts.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const base = `
      SELECT l.id, l.name, l.description, l.max_members, l.starts_at, l.ends_at, l.finalized_at, l.created_at,
             ${STATUS_SQL} AS status, ow.username AS owner_username,
             (SELECT COUNT(*)::int FROM league_members m WHERE m.league_id = l.id) AS member_count,
             ($2::uuid IS NOT NULL AND EXISTS (
               SELECT 1 FROM league_members m WHERE m.league_id = l.id AND m.user_id = $2::uuid
             )) AS is_member
        FROM leagues l
        JOIN users ow ON ow.id = l.owner_id
       WHERE l.visibility = 'public' AND ($1::text IS NULL OR l.name ILIKE $1::text ESCAPE '\\')`;
    const params = [pattern, opts.userId ?? null, statuses];
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM (${base}) x WHERE x.status = ANY($3::text[])`, params);
    const r = await pool.query(
      `SELECT * FROM (${base}) x
        WHERE x.status = ANY($3::text[])
        ORDER BY CASE x.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
                 CASE WHEN x.status = 'upcoming' THEN x.starts_at END ASC,
                 CASE WHEN x.status = 'finished' THEN COALESCE(x.finalized_at, x.ends_at) END DESC,
                 x.member_count DESC, x.ends_at ASC NULLS LAST, x.created_at DESC, x.id ASC
        LIMIT $4 OFFSET $5`,
      [...params, opts.limit, opts.offset]
    );
    return {
      items: r.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        owner_username: row.owner_username,
        member_count: parseInt(row.member_count, 10),
        max_members: parseInt(row.max_members, 10),
        status: row.status,
        starts_at: row.starts_at,
        ends_at: row.ends_at ?? null,
        is_member: row.is_member === true,
      })),
      total: parseInt(total.rows[0].n, 10),
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  /** Lig detayı + sıralama. Üye değilse 404 (ligin varlığı sızdırılmaz). */
  static async getDetail(
    leagueId: string,
    userId: string
  ): Promise<{ league: LeagueSummary & { owner_id: string }; members: LeagueMemberStanding[] }> {
    const league = await this.getSummary(leagueId, userId);
    const finished = league.finalized_at !== null;
    const upcoming = !finished && league.started_at === null;
    const r = await pool.query(
      `SELECT lm.user_id, u.username, lm.role, lm.baseline_equity, lm.baseline_set_at, lm.joined_at,
              lm.final_rank, lm.final_equity, lm.final_return_pct, ${EQUITY_SQL} AS equity
         FROM league_members lm
         JOIN users u ON u.id = lm.user_id
        WHERE lm.league_id = $1
        ORDER BY CASE WHEN $2::boolean THEN lm.final_rank END ASC NULLS LAST,
                 (lm.baseline_set_at IS NULL) ASC,
                 CASE WHEN lm.baseline_set_at IS NOT NULL THEN ${RETURN_SQL} END DESC,
                 lm.joined_at ASC, lm.user_id ASC`,
      [leagueId, finished]
    );
    let live = 0;
    const members = r.rows.map((row: any): LeagueMemberStanding => {
      const baselineSet = row.baseline_set_at !== null && row.baseline_set_at !== undefined;
      const base = num(row.baseline_equity);
      const liveEquity = round2(num(row.equity));
      const finalRank = intOrNull(row.final_rank);
      const finalReturn = numOrNull(row.final_return_pct);
      const common = {
        user_id: row.user_id,
        username: row.username,
        role: row.role as LeagueRole,
        baseline_equity: baselineSet ? base : null,
        baseline_set: baselineSet,
        final_rank: finished ? finalRank : null,
        final_return_pct: finished ? finalReturn : null,
        joined_at: row.joined_at,
        is_me: row.user_id === userId,
      };
      if (finished) {
        const frozen = row.final_equity === null || row.final_equity === undefined ? null : num(row.final_equity);
        return {
          ...common,
          rank: finalRank,
          equity: frozen ?? liveEquity,
          return_pct: finalReturn,
          profit_tl: frozen !== null && baselineSet ? round2(frozen - base) : null,
        };
      }
      if (upcoming || !baselineSet) {
        return { ...common, rank: null, equity: liveEquity, return_pct: null, profit_tl: null };
      }
      live += 1;
      const equity = num(row.equity);
      return {
        ...common,
        rank: live,
        equity: liveEquity,
        return_pct: round4(((equity - base) / base) * 100),
        profit_tl: round2(equity - base),
      };
    });
    return { league, members };
  }

  /**
   * Lig akışı: üyelerin lig başlangıcından (veya sonradan katılanlar için katılımdan) bu yana yaptığı
   * alım/satımlar, yeniden eskiye. Tutar/fiyat/miktar İÇERMEZ. Üye değilse 404.
   */
  static async getFeed(leagueId: string, userId: string, limit: number): Promise<{ items: LeagueFeedItem[] }> {
    await this.roleOf(leagueId, userId);
    await this.refreshDue({ leagueId });
    const r = await pool.query(
      `SELECT t.id, t.user_id, u.username, t.type, t.symbol, t.asset_type, t.created_at
         FROM league_members lm
         JOIN leagues l ON l.id = lm.league_id
         JOIN users u ON u.id = lm.user_id
         JOIN transactions t ON t.user_id = lm.user_id
        WHERE lm.league_id = $1
          AND lm.baseline_set_at IS NOT NULL
          AND t.created_at >= lm.baseline_set_at
          AND (l.finalized_at IS NULL OR t.created_at <= l.finalized_at)
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $2`,
      [leagueId, limit]
    );
    return {
      items: r.rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        username: row.username,
        type: row.type,
        symbol: row.symbol,
        asset_type: row.asset_type,
        created_at: row.created_at,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Yazma
  // -------------------------------------------------------------------------

  static async create(userId: string, input: CreateLeagueInput): Promise<LeagueSummary> {
    const leagueId = await withTx(async (client) => {
      const me = await lockUser(client, userId);
      if (!me.verified) {
        throw new AppError(403, 'Lig oluşturmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      assertPositiveEquity(me.equity);
      const counts = await activeMembershipCounts(client, userId);
      if (counts.owned >= MAX_OWNED_LEAGUES) {
        throw new AppError(409, `En fazla ${MAX_OWNED_LEAGUES} lig oluşturabilirsin`, 'OWNED_LEAGUE_LIMIT');
      }
      if (counts.total >= MAX_LEAGUES_PER_USER) {
        throw new AppError(409, `En fazla ${MAX_LEAGUES_PER_USER} ligde yer alabilirsin`, 'LEAGUE_LIMIT');
      }

      const interval = input.duration ? LEAGUE_DURATION_INTERVALS[input.duration] : null;
      const endsAt = !interval && input.ends_at ? input.ends_at.toISOString() : null;
      let row: any;
      for (let i = 0; i < INVITE_RETRIES && !row; i++) {
        const ins = await client.query(
          `INSERT INTO leagues (name, description, owner_id, invite_code, max_members, visibility, starts_at, started_at, ends_at)
           SELECT $1, $2, $3, $4, $5, $6, s.starts_at,
                  CASE WHEN s.starts_at <= now() THEN now() END,
                  COALESCE(s.starts_at + $8::interval, $9::timestamptz)
             FROM (SELECT COALESCE($7::timestamptz, now()) AS starts_at) s
           ON CONFLICT (invite_code) DO NOTHING
           RETURNING id, started_at, (ends_at IS NOT NULL AND ends_at <= starts_at) AS bad_range`,
          [
            input.name,
            input.description ?? null,
            userId,
            generateInviteCode(),
            LEAGUE_MAX_MEMBERS,
            input.visibility ?? 'private',
            input.starts_at ? input.starts_at.toISOString() : null,
            interval,
            endsAt,
          ]
        );
        row = ins.rows[0];
      }
      if (!row) throw new AppError(503, 'Davet kodu üretilemedi, lütfen tekrar dene', 'INVITE_CODE_EXHAUSTED');
      if (row.bad_range === true) {
        throw new AppError(400, 'Bitiş tarihi başlangıç tarihinden sonra olmalı', 'VALIDATION_ERROR');
      }

      await client.query(
        `INSERT INTO league_members (league_id, user_id, role, baseline_equity, baseline_set_at)
         VALUES ($1, $2, 'owner', $3, $4::timestamptz)`,
        [row.id, userId, me.equity, row.started_at ?? null]
      );
      return row.id as string;
    });
    return this.getSummary(leagueId, userId);
  }

  /** Sahip: ad / açıklama / görünürlük her zaman; başlangıç ve süre sadece lig başlamadan. */
  static async update(leagueId: string, userId: string, input: UpdateLeagueInput): Promise<LeagueSummary> {
    await withTx(async (client) => {
      const r = await client.query(
        `SELECT l.owner_id, (l.started_at IS NULL AND l.starts_at > now() AND l.finalized_at IS NULL) AS upcoming,
                EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = l.id AND m.user_id = $2) AS is_member
           FROM leagues l WHERE l.id = $1 FOR UPDATE`,
        [leagueId, userId]
      );
      const league = r.rows[0];
      if (!league || league.is_member !== true) throw NOT_FOUND();
      if (league.owner_id !== userId) throw OWNER_ONLY();
      const datesChanged = input.starts_at !== undefined || input.duration !== undefined;
      if (datesChanged && league.upcoming !== true) {
        throw new AppError(400, 'Lig başladıktan sonra başlangıç ve süre değiştirilemez', 'LEAGUE_ALREADY_STARTED');
      }
      const interval = input.duration ? LEAGUE_DURATION_INTERVALS[input.duration] : null;
      await client.query(
        `UPDATE leagues
            SET name = COALESCE($2, name),
                description = CASE WHEN $3::boolean THEN $4 ELSE description END,
                visibility = COALESCE($5, visibility),
                starts_at = COALESCE($6::timestamptz, starts_at),
                ends_at = CASE
                  WHEN $7::interval IS NOT NULL THEN COALESCE($6::timestamptz, starts_at) + $7::interval
                  WHEN $6::timestamptz IS NOT NULL AND ends_at IS NOT NULL THEN $6::timestamptz + (ends_at - starts_at)
                  ELSE ends_at
                END
          WHERE id = $1`,
        [
          leagueId,
          input.name ?? null,
          input.description !== undefined,
          input.description ?? null,
          input.visibility ?? null,
          input.starts_at ? input.starts_at.toISOString() : null,
          interval,
        ]
      );
    });
    return this.getSummary(leagueId, userId);
  }

  /** Kilitli lig satırına katılım (davet kodu ve herkese açık katılım ortak kuralları). */
  private static async joinLocked(client: PoolClient, userId: string, league: LockedLeague, me: { equity: number; username: string }): Promise<void> {
    if (league.ended) throw LEAGUE_ENDED();
    const existing = await client.query('SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2', [league.id, userId]);
    if (existing.rows.length > 0) {
      throw new AppError(409, 'Bu ligin zaten üyesisin', 'ALREADY_MEMBER');
    }
    const cnt = await client.query('SELECT COUNT(*)::int AS n FROM league_members WHERE league_id = $1', [league.id]);
    if (cnt.rows[0].n >= league.max_members) {
      throw new AppError(409, 'Lig dolu', 'LEAGUE_FULL');
    }
    const mine = await activeMembershipCounts(client, userId);
    if (mine.total >= MAX_LEAGUES_PER_USER) {
      throw new AppError(409, `En fazla ${MAX_LEAGUES_PER_USER} ligde yer alabilirsin`, 'LEAGUE_LIMIT');
    }
    assertPositiveEquity(me.equity);
    // Başlamış lig: referans = katılım anındaki varlık. Başlamamış: lig başlayınca yazılır.
    await client.query(
      `INSERT INTO league_members (league_id, user_id, role, baseline_equity, baseline_set_at)
       VALUES ($1, $2, 'member', $3, CASE WHEN $4::boolean THEN now() END)`,
      [league.id, userId, me.equity, league.started]
    );
    // Oyun ekonomisi: lige katılım XP'si (lig başına bir kez; SAVEPOINT içinde, hata fırlatmaz)
    await GameService.onLeagueJoin(userId, league.id, client);
    await notify(
      league.owner_id,
      {
        type: 'league.member_joined',
        category: 'competition',
        title: `${me.username} ${league.name} ligine katıldı`,
        body: league.started ? 'Lig sıralamasında yerini aldı.' : 'Lig başladığında yarışa dahil olacak.',
        link: leagueLink(league.id),
        data: { league_id: league.id, user_id: userId, username: me.username },
      },
      client
    );
  }

  static async join(userId: string, rawCode: string): Promise<LeagueSummary> {
    const code = normalizeInviteCode(rawCode);
    if (!code) throw INVALID_CODE();
    const leagueId = await withTx(async (client) => {
      const me = await lockUser(client, userId);
      if (!me.verified) {
        throw new AppError(403, 'Lige katılmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      // Lig satırını kilitle: üye sayısı sınırı ve başlatma/kapanış ile yarış olmasın
      const lr = await client.query(`SELECT ${LOCK_LEAGUE_COLUMNS} FROM leagues WHERE invite_code = $1 FOR UPDATE`, [code]);
      if (!lr.rows[0]) throw INVALID_CODE();
      const league = mapLocked(lr.rows[0]);
      await this.joinLocked(client, userId, league, me);
      return league.id;
    });
    return this.getSummary(leagueId, userId);
  }

  /** Herkese açık lige davet kodu olmadan katılım. Lig yoksa veya özelse 404. */
  static async joinPublic(userId: string, leagueId: string): Promise<LeagueSummary> {
    await withTx(async (client) => {
      const me = await lockUser(client, userId);
      if (!me.verified) {
        throw new AppError(403, 'Lige katılmak için e-postanı doğrulamalısın', 'EMAIL_NOT_VERIFIED');
      }
      const lr = await client.query(
        `SELECT ${LOCK_LEAGUE_COLUMNS} FROM leagues WHERE id = $1 AND visibility = 'public' FOR UPDATE`,
        [leagueId]
      );
      if (!lr.rows[0]) throw NOT_FOUND();
      await this.joinLocked(client, userId, mapLocked(lr.rows[0]), me);
    });
    return this.getSummary(leagueId, userId);
  }

  private static async roleOf(leagueId: string, userId: string): Promise<LeagueRole> {
    const r = await pool.query('SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2', [leagueId, userId]);
    if (!r.rows[0]) throw NOT_FOUND();
    return r.rows[0].role;
  }

  static async leave(leagueId: string, userId: string): Promise<void> {
    const role = await this.roleOf(leagueId, userId);
    if (role === 'owner') {
      throw new AppError(400, 'Lig sahibi ayrılamaz; ligi silebilirsin', 'OWNER_CANNOT_LEAVE');
    }
    await pool.query(`DELETE FROM league_members WHERE league_id = $1 AND user_id = $2 AND role = 'member'`, [leagueId, userId]);
  }

  static async regenerateInviteCode(leagueId: string, userId: string): Promise<string> {
    if ((await this.roleOf(leagueId, userId)) !== 'owner') throw OWNER_ONLY();
    for (let i = 0; i < INVITE_RETRIES; i++) {
      const code = generateInviteCode();
      try {
        const r = await pool.query(
          `UPDATE leagues SET invite_code = $2 WHERE id = $1 AND owner_id = $3 RETURNING invite_code`,
          [leagueId, code, userId]
        );
        if (!r.rows[0]) throw NOT_FOUND();
        return r.rows[0].invite_code;
      } catch (err: any) {
        if (err?.code !== '23505') throw err; // benzersizlik çakışması → yeni kodla tekrar dene
      }
    }
    throw new AppError(503, 'Davet kodu üretilemedi, lütfen tekrar dene', 'INVITE_CODE_EXHAUSTED');
  }

  /** Sahip üye çıkarır (biten ligde sonuçlar donuk kalsın diye çıkarılamaz). */
  static async removeMember(leagueId: string, ownerId: string, targetUserId: string): Promise<void> {
    if ((await this.roleOf(leagueId, ownerId)) !== 'owner') throw OWNER_ONLY();
    if (targetUserId === ownerId) {
      throw new AppError(400, 'Kendini ligden çıkaramazsın', 'CANNOT_REMOVE_SELF');
    }
    await withTx(async (client) => {
      const lr = await client.query(`SELECT name, finalized_at FROM leagues WHERE id = $1 FOR UPDATE`, [leagueId]);
      const league = lr.rows[0];
      if (!league) throw NOT_FOUND();
      if (league.finalized_at !== null) {
        throw new AppError(400, 'Biten ligden üye çıkarılamaz; sonuçlar dondu', 'LEAGUE_ENDED');
      }
      const r = await client.query(
        `DELETE FROM league_members WHERE league_id = $1 AND user_id = $2 AND role = 'member' RETURNING user_id`,
        [leagueId, targetUserId]
      );
      if (r.rows.length === 0) {
        throw new AppError(404, 'Üye bulunamadı', 'MEMBER_NOT_FOUND');
      }
      await notify(
        targetUserId,
        {
          type: 'league.removed',
          category: 'competition',
          title: `${league.name} liginden çıkarıldın`,
          body: 'Lig sahibi seni ligden çıkardı.',
          link: '/leagues',
          data: { league_id: leagueId },
        },
        client
      );
    });
  }

  static async remove(leagueId: string, userId: string): Promise<void> {
    if ((await this.roleOf(leagueId, userId)) !== 'owner') throw OWNER_ONLY();
    await withTx(async (client) => {
      const members = await client.query(
        `SELECT lm.user_id FROM league_members lm WHERE lm.league_id = $1 AND lm.user_id <> $2`,
        [leagueId, userId]
      );
      const del = await client.query('DELETE FROM leagues WHERE id = $1 AND owner_id = $2 RETURNING name', [leagueId, userId]);
      if (!del.rows[0]) throw NOT_FOUND();
      const ids = members.rows.map((m: any) => m.user_id as string);
      if (ids.length > 0) {
        await notify(
          ids,
          {
            type: 'league.deleted',
            category: 'competition',
            title: `${del.rows[0].name} ligi silindi`,
            body: 'Lig sahibi ligi sildi.',
            link: '/leagues',
            data: { league_id: leagueId },
          },
          client
        );
      }
    });
  }
}
