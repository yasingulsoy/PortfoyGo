import pool from '../config/database';

/** Yeni hesaplara verilen başlangıç sanal bakiyesi (kümülatif getiri buna göre) */
export const INITIAL_ACCOUNT_BALANCE = 100_000;

export type LeaderboardBoard = 'alltime' | 'week';

export interface LeaderboardEntry {
  rank: number;
  username: string;
  portfolio_value: number;
  /** Açık pozisyonlardan toplam K/Z (her iki tabloda bilgi; hafta modunda % ile birlikte anlam verir) */
  total_profit_loss: number;
  /** alltime: başlangıç 100.000 TL’den hesap büyüme %; week: bu ISO haftasındaki getiri % */
  profit_loss_percent: number;
  balance: number;
  board: LeaderboardBoard;
  /** week: toplam varlık − hafta başı referans (o haftanın TL getirisi) */
  week_profit_loss_tl?: number;
}

export class LeaderboardService {
  private static currentIsoWeekKeyQuery = `
    SELECT
      to_char(
        (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
        'IYYY'
      ) || '-' || to_char(
        (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
        'IW'
      ) AS k
  `;

  static async getCurrentIsoWeekKey(): Promise<string> {
    const r = await pool.query(LeaderboardService.currentIsoWeekKeyQuery);
    return r.rows[0].k as string;
  }

  /**
   * Yeni hafta başladıysa (veya ilk kurulum) tüm kullanıcılar için
   * haftalık referans varlık ve ISO hafta anahtarını günceller.
   */
  static async tryResetWeekBaselinesIfNeeded(): Promise<void> {
    try {
      const key = await this.getCurrentIsoWeekKey();
      const need = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM users
          WHERE week_baseline_iso_key IS NULL
             OR week_baseline_iso_key <> $1
        ) AS need`,
        [key]
      );
      if (!need.rows[0]?.need) {
        return;
      }

      await pool.query(
        `UPDATE users u
         SET
           week_baseline_equity = e.total_eq,
           week_baseline_iso_key = $1
         FROM (
           SELECT
             u2.id,
             u2.balance + COALESCE((
               SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u2.id
             ), 0) AS total_eq
           FROM users u2
         ) e
         WHERE u.id = e.id`,
        [key]
      );
    } catch (error) {
      console.error('tryResetWeekBaselinesIfNeeded error:', error);
    }
  }

  static async getLeaderboard(
    limit: number = 10,
    board: LeaderboardBoard = 'alltime'
  ): Promise<{
    success: boolean;
    board?: LeaderboardBoard;
    leaderboard?: LeaderboardEntry[];
  }> {
    try {
      await this.tryResetWeekBaselinesIfNeeded();
      await this.updateRanks();

      if (board === 'week') {
        return this.getWeeklyLeaderboardInner(limit);
      }
      return this.getAllTimeLeaderboardInner(limit);
    } catch (error) {
      console.error('Get leaderboard error:', error);
      return { success: false };
    }
  }

  private static async getAllTimeLeaderboardInner(
    limit: number
  ): Promise<{ success: true; board: 'alltime'; leaderboard: LeaderboardEntry[] }> {
    const result = await pool.query(
      `
      WITH inv AS (
        SELECT
          user_id,
          SUM(profit_loss) AS total_profit_loss,
          COALESCE(SUM(total_value), 0) AS portfolio_value
        FROM portfolio_items
        GROUP BY user_id
      )
      SELECT
        u.username,
        u.balance,
        COALESCE(inv.portfolio_value, 0) AS portfolio_value,
        COALESCE(inv.total_profit_loss, 0) AS total_profit_loss,
        (u.balance + COALESCE(inv.portfolio_value, 0) - $1) / $1 * 100 AS profit_loss_percent
      FROM users u
      LEFT JOIN inv ON u.id = inv.user_id
      WHERE u.email_verified = true
        AND (u.is_banned IS NULL OR u.is_banned = false)
      ORDER BY
        (u.balance + COALESCE(inv.portfolio_value, 0) - $1) / $1 * 100 DESC,
        COALESCE(inv.total_profit_loss, 0) DESC
      LIMIT $2
    `,
      [INITIAL_ACCOUNT_BALANCE, limit]
    );

    const leaderboard: LeaderboardEntry[] = result.rows.map((row: any, index: number) => ({
      rank: index + 1,
      username: row.username,
      portfolio_value: parseFloat(row.portfolio_value),
      total_profit_loss: parseFloat(row.total_profit_loss),
      profit_loss_percent: parseFloat(row.profit_loss_percent),
      balance: parseFloat(row.balance),
      board: 'alltime' as const,
      week_profit_loss_tl: undefined
    }));

    return { success: true, board: 'alltime', leaderboard };
  }

  private static async getWeeklyLeaderboardInner(
    limit: number
  ): Promise<{ success: true; board: 'week'; leaderboard: LeaderboardEntry[] }> {
    const result = await pool.query(
      `
      WITH inv AS (
        SELECT
          user_id,
          SUM(profit_loss) AS total_profit_loss,
          COALESCE(SUM(total_value), 0) AS portfolio_value
        FROM portfolio_items
        GROUP BY user_id
      )
      SELECT
        u.username,
        u.balance,
        u.week_baseline_equity,
        COALESCE(inv.portfolio_value, 0) AS portfolio_value,
        COALESCE(inv.total_profit_loss, 0) AS total_profit_loss,
        (u.balance + COALESCE(inv.portfolio_value, 0)) AS total_equity,
        CASE
          WHEN COALESCE(u.week_baseline_equity, 0) > 0
          THEN
            (u.balance + COALESCE(inv.portfolio_value, 0) - u.week_baseline_equity)
            / u.week_baseline_equity
            * 100
          ELSE 0
        END AS profit_loss_percent
      FROM users u
      LEFT JOIN inv ON u.id = inv.user_id
      WHERE u.email_verified = true
        AND (u.is_banned IS NULL OR u.is_banned = false)
      ORDER BY
        CASE
          WHEN COALESCE(u.week_baseline_equity, 0) > 0
          THEN
            (u.balance + COALESCE(inv.portfolio_value, 0) - u.week_baseline_equity)
            / u.week_baseline_equity
        END DESC,
        (u.balance + COALESCE(inv.portfolio_value, 0) - u.week_baseline_equity) DESC
      LIMIT $1
    `,
      [limit]
    );

    const leaderboard: LeaderboardEntry[] = result.rows.map((row: any, index: number) => {
      const totalEq = parseFloat(row.total_equity);
      const base = parseFloat(row.week_baseline_equity) || 0;
      return {
        rank: index + 1,
        username: row.username,
        portfolio_value: parseFloat(row.portfolio_value),
        total_profit_loss: parseFloat(row.total_profit_loss),
        profit_loss_percent: parseFloat(row.profit_loss_percent),
        balance: parseFloat(row.balance),
        board: 'week' as const,
        week_profit_loss_tl: base > 0 ? totalEq - base : 0
      };
    });

    return { success: true, board: 'week', leaderboard };
  }

  // Tüm kullanıcıların rank'lerini güncelle (kümülatif: başlangıç bakiyesine göre büyüme)
  static async updateRanks(): Promise<void> {
    try {
      await pool.query(`
        UPDATE users
        SET rank = NULL
        WHERE email_verified = false OR (is_banned IS NOT NULL AND is_banned = true)
      `);

      await pool.query(
        `UPDATE users u
         SET rank = ranked.rn
         FROM (
           SELECT
             u2.id,
             ROW_NUMBER() OVER (
               ORDER BY
                 (u2.balance + COALESCE(inv.portfolio_value, 0) - $1) / $1 * 100 DESC,
                 COALESCE(inv.total_profit_loss, 0) DESC
             ) AS rn
           FROM users u2
           LEFT JOIN (
             SELECT
               user_id,
               SUM(profit_loss) AS total_profit_loss,
               COALESCE(SUM(total_value), 0) AS portfolio_value
             FROM portfolio_items
             GROUP BY user_id
           ) inv ON u2.id = inv.user_id
           WHERE u2.email_verified = true
             AND (u2.is_banned IS NULL OR u2.is_banned = false)
         ) ranked
         WHERE u.id = ranked.id`,
        [INITIAL_ACCOUNT_BALANCE]
      );
    } catch (error) {
      console.error('Update ranks error:', error);
    }
  }

  static async getUserRank(
    userId: string
  ): Promise<{
    success: boolean;
    rank?: number | null;
    rankWeek?: number | null;
  }> {
    try {
      await this.tryResetWeekBaselinesIfNeeded();
      await this.updateRanks();

      const rAll = await pool.query('SELECT rank FROM users WHERE id = $1', [userId]);
      if (rAll.rows.length === 0) {
        return { success: false };
      }

      const rWeek = await pool.query(
        `
        WITH ueq AS (
          SELECT
            u2.id,
            (u2.balance + COALESCE((
              SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u2.id
            ), 0) - u2.week_baseline_equity)
            / NULLIF(u2.week_baseline_equity, 0)
            * 100 AS wret
          FROM users u2
          WHERE u2.email_verified = true
            AND (u2.is_banned IS NULL OR u2.is_banned = false)
        ),
        w AS (
          SELECT id, RANK() OVER (ORDER BY wret DESC) AS wk
          FROM ueq
        )
        SELECT w.wk
        FROM w
        WHERE w.id = $1
      `,
        [userId]
      );

      return {
        success: true,
        rank: rAll.rows[0].rank,
        rankWeek: rWeek.rows[0] ? parseInt(rWeek.rows[0].wk, 10) : null
      };
    } catch (error) {
      console.error('Get user rank error:', error);
      return { success: false };
    }
  }
}
