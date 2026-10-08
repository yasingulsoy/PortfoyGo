import pool from '../config/database';
import { AppError } from '../utils/errors';
import {
  AWARD_TITLE_SQL,
  EQUITY_SQL,
  INSERT_SEASON_SQL,
  seasonNameFor,
  seasonSlugFor,
} from '../utils/competition';

/**
 * Aylık sezonlar (getiri bazlı; bakiyeler SIFIRLANMAZ).
 *
 *  - Her ay (Europe/Istanbul) bir sezon: slug 'YYYY-MM', ayın 1'i 00:00 → sonraki ayın 1'i 00:00.
 *  - Katılımcının referansı (baseline_equity) sezona katıldığı andaki toplam varlığıdır.
 *    Getiri % = (toplam varlık − referans) / referans × 100 (4 ondalık).
 *  - Sezon bitince (ends_at <= şimdi) değerler dondurulur, sıralar yazılır ve ödüller verilir.
 *    Ödül: sezon içinde ≥1 işlem yapmış, email'i doğrulanmış ve yasaklı olmayan katılımcılar
 *    arasındaki sıra (1: Sezon Şampiyonu, 2–3: Sezon Podyumu, 4–10: Sezonun İlk 10'u).
 *  - Aktif sezon sıralaması sorgu anında hesaplanır; biten sezonlar dondurulmuş değerlerden okunur.
 *
 * Toplam varlık tanımı liderlik tablosuyla aynıdır: balance + reserved_cash + portföy değeri.
 */

export type SeasonStatus = 'active' | 'finished';

export interface Season {
  id: string;
  slug: string;
  name: string;
  starts_at: Date;
  ends_at: Date;
  status: SeasonStatus;
}

export interface SeasonStanding {
  rank: number;
  user_id: string;
  username: string;
  baseline_equity: number;
  equity: number;
  return_pct: number;
  profit_tl: number;
  is_me: boolean;
}

export interface SeasonMe {
  rank: number | null;
  return_pct: number;
  baseline_equity: number;
  equity: number;
  profit_tl: number;
  joined_at: Date;
}

export interface SeasonWinner {
  rank: number;
  username: string;
  return_pct: number;
  title: string;
}

export interface SeasonAward {
  season_slug: string;
  season_name: string;
  rank: number;
  title: string;
  return_pct: number;
  awarded_at: Date;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

const ELIGIBLE_USER_SQL = `u.email_verified = true AND (u.is_banned IS NULL OR u.is_banned = false)`;

function mapSeason(row: any): Season {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
  };
}

/**
 * Aktif sezonun canlı sıralaması (CTE). $1 = season_id.
 * Sadece doğrulanmış ve yasaklı olmayan katılımcılar sıralanır.
 */
const LIVE_RANKED_CTE = `
  WITH p AS (
    SELECT sp.user_id, u.username, u.balance, sp.baseline_equity, sp.joined_at,
           ${EQUITY_SQL} AS equity,
           COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u.id), 0) AS portfolio_value,
           COALESCE((SELECT SUM(pi.profit_loss) FROM portfolio_items pi WHERE pi.user_id = u.id), 0) AS total_profit_loss
      FROM season_participants sp
      JOIN users u ON u.id = sp.user_id
     WHERE sp.season_id = $1 AND ${ELIGIBLE_USER_SQL}
  ),
  r AS (
    SELECT p.*,
           ROW_NUMBER() OVER (ORDER BY (p.equity - p.baseline_equity) / p.baseline_equity DESC, p.joined_at ASC, p.user_id ASC) AS rn
      FROM p
  )`;

function mapLive(row: any, userId?: string): SeasonStanding {
  const equity = num(row.equity);
  const base = num(row.baseline_equity);
  return {
    rank: parseInt(row.rn, 10),
    user_id: row.user_id,
    username: row.username,
    baseline_equity: base,
    equity: round2(equity),
    return_pct: Math.round(((equity - base) / base) * 100 * 10_000) / 10_000,
    profit_tl: round2(equity - base),
    is_me: !!userId && row.user_id === userId,
  };
}

function mapFrozen(row: any, userId?: string): SeasonStanding {
  const equity = num(row.final_equity);
  const base = num(row.baseline_equity);
  return {
    rank: parseInt(row.final_rank, 10),
    user_id: row.user_id,
    username: row.username,
    baseline_equity: base,
    equity,
    return_pct: num(row.final_return_pct),
    profit_tl: round2(equity - base),
    is_me: !!userId && row.user_id === userId,
  };
}

export class SeasonService {
  // -------------------------------------------------------------------------
  // Yaşam döngüsü (cron)
  // -------------------------------------------------------------------------

  /**
   * Süresi dolmuş aktif sezonları sonlandırır ve `now`'ın ait olduğu ayın sezonunu (yoksa) oluşturur.
   * İdempotent ve eşzamanlı çalıştırmaya karşı güvenlidir.
   */
  static async ensureCurrentSeason(now: Date = new Date()): Promise<Season> {
    const expired = await pool.query(
      `SELECT id FROM seasons WHERE status = 'active' AND ends_at <= $1::timestamptz ORDER BY starts_at ASC`,
      [now.toISOString()]
    );
    for (const row of expired.rows) {
      await this.finalizeSeason(row.id, now);
    }

    const slug = seasonSlugFor(now);
    await pool.query(INSERT_SEASON_SQL, [slug, seasonNameFor(slug), 'active']);
    const r = await pool.query('SELECT * FROM seasons WHERE slug = $1', [slug]);
    return mapSeason(r.rows[0]);
  }

  /**
   * Bir sezonu sonlandırır: değerleri dondurur, sıraları ve ödülleri yazar, status='finished'.
   * Sezon satırı FOR UPDATE ile kilitlenir; zaten bitmişse (veya henüz bitmemişse) hiçbir şey yapmaz.
   * @returns bu çağrı sezonu sonlandırdıysa true
   */
  static async finalizeSeason(seasonId: string, now: Date = new Date()): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT id, status, ends_at FROM seasons WHERE id = $1 FOR UPDATE`,
        [seasonId]
      );
      const season = locked.rows[0];
      if (!season || season.status !== 'active' || new Date(season.ends_at).getTime() > now.getTime()) {
        await client.query('ROLLBACK');
        return false;
      }

      // 1) Son değerleri dondur + sezon içi işlem sayısı
      await client.query(
        `UPDATE season_participants sp
            SET final_equity = ROUND(e.equity, 2),
                final_return_pct = ROUND((e.equity - sp.baseline_equity) / sp.baseline_equity * 100, 4),
                trades_count = (
                  SELECT COUNT(*)::int FROM transactions t, seasons s
                   WHERE s.id = sp.season_id
                     AND t.user_id = sp.user_id
                     AND t.created_at >= s.starts_at
                     AND t.created_at < s.ends_at
                )
           FROM (SELECT u.id AS user_id, ${EQUITY_SQL} AS equity FROM users u) e
          WHERE sp.season_id = $1 AND e.user_id = sp.user_id`,
        [seasonId]
      );

      // 2) Sıralar (doğrulanmış + yasaklı olmayanlar arasında; diğerleri NULL)
      await client.query(`UPDATE season_participants SET final_rank = NULL WHERE season_id = $1`, [seasonId]);
      await client.query(
        `UPDATE season_participants sp
            SET final_rank = r.rn
           FROM (
             SELECT sp2.user_id,
                    ROW_NUMBER() OVER (
                      ORDER BY (sp2.final_equity - sp2.baseline_equity) / sp2.baseline_equity DESC,
                               sp2.joined_at ASC, sp2.user_id ASC
                    ) AS rn
               FROM season_participants sp2
               JOIN users u ON u.id = sp2.user_id
              WHERE sp2.season_id = $1 AND ${ELIGIBLE_USER_SQL}
           ) r
          WHERE sp.season_id = $1 AND sp.user_id = r.user_id`,
        [seasonId]
      );

      // 3) Ödüller: ≥1 işlem yapmış uygun katılımcılar arasında ilk 10
      await client.query(
        `INSERT INTO season_awards (season_id, user_id, rank, title, return_pct, awarded_at)
         SELECT $1::uuid, x.user_id, x.rn, ${AWARD_TITLE_SQL}, x.final_return_pct, $2::timestamptz
           FROM (
             SELECT sp.user_id, sp.final_return_pct,
                    ROW_NUMBER() OVER (
                      ORDER BY (sp.final_equity - sp.baseline_equity) / sp.baseline_equity DESC,
                               sp.joined_at ASC, sp.user_id ASC
                    ) AS rn
               FROM season_participants sp
               JOIN users u ON u.id = sp.user_id
              WHERE sp.season_id = $1 AND sp.trades_count >= 1 AND ${ELIGIBLE_USER_SQL}
           ) x
          WHERE x.rn <= 10
         ON CONFLICT (season_id, user_id) DO NOTHING`,
        [seasonId, now.toISOString()]
      );

      await client.query(
        `UPDATE seasons SET status = 'finished', finalized_at = $2::timestamptz WHERE id = $1`,
        [seasonId, now.toISOString()]
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Güncel sezona henüz katılmamış tüm uygun kullanıcıları (doğrulanmış, yasaklı değil,
   * toplam varlığı > 0) şu anki toplam varlıklarıyla ekler.
   * @returns eklenen katılımcı sayısı
   */
  static async enrollEligible(now: Date = new Date()): Promise<number> {
    const season = await this.currentSeasonRow(now);
    if (!season || season.status !== 'active') return 0;
    const r = await pool.query(
      `INSERT INTO season_participants (season_id, user_id, baseline_equity, joined_at)
       SELECT $1::uuid, e.id, ROUND(e.equity, 2), $2::timestamptz
         FROM (
           SELECT u.id, ${EQUITY_SQL} AS equity
             FROM users u
            WHERE ${ELIGIBLE_USER_SQL}
              AND NOT EXISTS (SELECT 1 FROM season_participants sp WHERE sp.season_id = $1 AND sp.user_id = u.id)
         ) e
        WHERE ROUND(e.equity, 2) > 0
       ON CONFLICT (season_id, user_id) DO NOTHING`,
      [season.id, now.toISOString()]
    );
    return r.rowCount ?? 0;
  }

  /** Tek kullanıcıyı (uygunsa) güncel sezona ekler; zaten katılımcıysa dokunmaz. */
  static async enrollUser(seasonId: string, userId: string, now: Date = new Date()): Promise<void> {
    await pool.query(
      `INSERT INTO season_participants (season_id, user_id, baseline_equity, joined_at)
       SELECT $1::uuid, e.id, ROUND(e.equity, 2), $3::timestamptz
         FROM (SELECT u.id, ${EQUITY_SQL} AS equity FROM users u WHERE u.id = $2::uuid AND ${ELIGIBLE_USER_SQL}) e
        WHERE ROUND(e.equity, 2) > 0
       ON CONFLICT (season_id, user_id) DO NOTHING`,
      [seasonId, userId, now.toISOString()]
    );
  }

  // -------------------------------------------------------------------------
  // Okuma
  // -------------------------------------------------------------------------

  private static async currentSeasonRow(now: Date): Promise<Season | null> {
    const r = await pool.query('SELECT * FROM seasons WHERE slug = $1', [seasonSlugFor(now)]);
    return r.rows[0] ? mapSeason(r.rows[0]) : null;
  }

  /**
   * Güncel sezon yoksa veya süresi dolmuş bir aktif sezon varsa ensureCurrentSeason çalıştırır
   * (cron'u beklemeden doğru veri dönsün). Normal durumda tek ucuz sorgu.
   */
  private static async ensureFresh(now: Date): Promise<Season> {
    const r = await pool.query(
      `SELECT s.*,
              EXISTS (SELECT 1 FROM seasons x WHERE x.status = 'active' AND x.ends_at <= $2::timestamptz) AS has_expired
         FROM (SELECT 1) one
         LEFT JOIN seasons s ON s.slug = $1`,
      [seasonSlugFor(now), now.toISOString()]
    );
    const row = r.rows[0];
    if (!row?.id || row.has_expired) {
      return this.ensureCurrentSeason(now);
    }
    return mapSeason(row);
  }

  private static async countRanked(season: Season): Promise<number> {
    const r =
      season.status === 'active'
        ? await pool.query(
            `SELECT COUNT(*)::int AS n FROM season_participants sp JOIN users u ON u.id = sp.user_id
              WHERE sp.season_id = $1 AND ${ELIGIBLE_USER_SQL}`,
            [season.id]
          )
        : await pool.query(
            `SELECT COUNT(*)::int AS n FROM season_participants WHERE season_id = $1 AND final_rank IS NOT NULL`,
            [season.id]
          );
    return parseInt(r.rows[0].n, 10);
  }

  private static async getMe(season: Season, userId: string): Promise<SeasonMe | null> {
    if (season.status === 'active') {
      const r = await pool.query(`${LIVE_RANKED_CTE} SELECT * FROM r WHERE user_id = $2`, [season.id, userId]);
      if (!r.rows[0]) return null;
      const s = mapLive(r.rows[0], userId);
      return {
        rank: s.rank,
        return_pct: s.return_pct,
        baseline_equity: s.baseline_equity,
        equity: s.equity,
        profit_tl: s.profit_tl,
        joined_at: r.rows[0].joined_at,
      };
    }
    const r = await pool.query(
      `SELECT sp.*, u.username FROM season_participants sp JOIN users u ON u.id = sp.user_id
        WHERE sp.season_id = $1 AND sp.user_id = $2`,
      [season.id, userId]
    );
    const row = r.rows[0];
    if (!row || row.final_equity === null) return null;
    const equity = num(row.final_equity);
    const base = num(row.baseline_equity);
    return {
      rank: row.final_rank === null ? null : parseInt(row.final_rank, 10),
      return_pct: num(row.final_return_pct),
      baseline_equity: base,
      equity,
      profit_tl: round2(equity - base),
      joined_at: row.joined_at,
    };
  }

  /** Güncel sezon + katılımcı sayısı + (oturum varsa) kullanıcının durumu. */
  static async getCurrent(
    userId?: string,
    now: Date = new Date()
  ): Promise<{ season: Season; participants: number; me: SeasonMe | null }> {
    const season = await this.ensureFresh(now);
    if (userId && season.status === 'active') {
      // Cron'u beklemeden: yeni doğrulanmış kullanıcı ilk ziyaretinde sezona katılır
      await this.enrollUser(season.id, userId, now);
    }
    const participants = await this.countRanked(season);
    const me = userId ? await this.getMe(season, userId) : null;
    return { season, participants, me };
  }

  /** Sezon sıralaması: aktif sezonda canlı, biten sezonda dondurulmuş değerler. */
  static async getLeaderboard(
    slug: string,
    limit: number,
    offset: number,
    userId?: string,
    now: Date = new Date()
  ): Promise<{ season: Season; entries: SeasonStanding[]; total: number }> {
    await this.ensureFresh(now);
    const sr = await pool.query('SELECT * FROM seasons WHERE slug = $1', [slug]);
    if (!sr.rows[0]) {
      throw new AppError(404, 'Sezon bulunamadı', 'SEASON_NOT_FOUND');
    }
    const season = mapSeason(sr.rows[0]);
    const total = await this.countRanked(season);

    if (season.status === 'active') {
      const r = await pool.query(`${LIVE_RANKED_CTE} SELECT * FROM r ORDER BY rn LIMIT $2 OFFSET $3`, [season.id, limit, offset]);
      return { season, entries: r.rows.map((row: any) => mapLive(row, userId)), total };
    }
    const r = await pool.query(
      `SELECT sp.*, u.username FROM season_participants sp JOIN users u ON u.id = sp.user_id
        WHERE sp.season_id = $1 AND sp.final_rank IS NOT NULL
        ORDER BY sp.final_rank ASC LIMIT $2 OFFSET $3`,
      [season.id, limit, offset]
    );
    return { season, entries: r.rows.map((row: any) => mapFrozen(row, userId)), total };
  }

  /**
   * GET /api/leaderboard?board=season için: güncel sezon sıralaması, mevcut liderlik
   * girdisi biçiminde (rank, username, portfolio_value, total_profit_loss, profit_loss_percent, balance).
   */
  static async getCurrentLeaderboardLegacy(limit: number, now: Date = new Date()) {
    const season = await this.ensureFresh(now);
    const r = await pool.query(`${LIVE_RANKED_CTE} SELECT * FROM r ORDER BY rn LIMIT $2`, [season.id, limit]);
    return {
      season,
      leaderboard: r.rows.map((row: any) => {
        const s = mapLive(row);
        return {
          rank: s.rank,
          username: s.username,
          portfolio_value: num(row.portfolio_value),
          total_profit_loss: num(row.total_profit_loss),
          profit_loss_percent: s.return_pct,
          balance: num(row.balance),
          board: 'season' as const,
          season_profit_loss_tl: s.profit_tl,
        };
      }),
    };
  }

  /** Sezon listesi (yeniden eskiye) + katılımcı sayısı + biten sezonların ilk 3'ü. */
  static async listSeasons(
    limit: number,
    now: Date = new Date()
  ): Promise<{ season: Season; participants: number; winners: SeasonWinner[] }[]> {
    await this.ensureFresh(now);
    const sr = await pool.query(
      `SELECT s.*,
              CASE WHEN s.status = 'finished'
                   THEN (SELECT COUNT(*)::int FROM season_participants sp WHERE sp.season_id = s.id AND sp.final_rank IS NOT NULL)
                   ELSE (SELECT COUNT(*)::int FROM season_participants sp JOIN users u ON u.id = sp.user_id
                          WHERE sp.season_id = s.id AND ${ELIGIBLE_USER_SQL})
              END AS participants
         FROM seasons s
        ORDER BY s.starts_at DESC
        LIMIT $1`,
      [limit]
    );
    const wr = await pool.query(
      `SELECT sa.season_id, sa.rank, u.username, sa.return_pct, sa.title
         FROM season_awards sa
         JOIN users u ON u.id = sa.user_id
         JOIN (SELECT id FROM seasons ORDER BY starts_at DESC LIMIT $1) s ON s.id = sa.season_id
        WHERE sa.rank <= 3
        ORDER BY sa.rank ASC`,
      [limit]
    );
    const winners = new Map<string, SeasonWinner[]>();
    for (const w of wr.rows) {
      const list = winners.get(w.season_id) ?? [];
      list.push({ rank: parseInt(w.rank, 10), username: w.username, return_pct: num(w.return_pct), title: w.title });
      winners.set(w.season_id, list);
    }
    return sr.rows.map((row: any) => ({
      season: mapSeason(row),
      participants: parseInt(row.participants, 10),
      winners: row.status === 'finished' ? winners.get(row.id) ?? [] : [],
    }));
  }

  /** Kullanıcının sezon ödülleri (yeniden eskiye). */
  static async getAwards(userId: string): Promise<SeasonAward[]> {
    const r = await pool.query(
      `SELECT s.slug AS season_slug, s.name AS season_name, sa.rank, sa.title, sa.return_pct, sa.awarded_at
         FROM season_awards sa
         JOIN seasons s ON s.id = sa.season_id
        WHERE sa.user_id = $1
        ORDER BY s.starts_at DESC`,
      [userId]
    );
    return r.rows.map((row: any) => ({
      season_slug: row.season_slug,
      season_name: row.season_name,
      rank: parseInt(row.rank, 10),
      title: row.title,
      return_pct: num(row.return_pct),
      awarded_at: row.awarded_at,
    }));
  }
}
