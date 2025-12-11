import pool from '../config/database';

export interface LeaderboardEntry {
  rank: number;
  username: string;
  portfolio_value: number;
  total_profit_loss: number;
  profit_loss_percent: number;
  balance: number;
}

export class LeaderboardService {
  // Liderlik tablosunu getir
  static async getLeaderboard(limit: number = 10): Promise<{ success: boolean; leaderboard?: LeaderboardEntry[] }> {
    try {
      // Önce tüm kullanıcıların rank'lerini güncelle
      await this.updateRanks();

      // Liderlik tablosunu getir - kar/zarar yüzdesine göre sırala
      const result = await pool.query(
        `SELECT 
          username,
          balance,
          portfolio_value,
          total_profit_loss,
          rank,
          CASE 
            WHEN (portfolio_value - total_profit_loss) > 0 THEN (total_profit_loss / (portfolio_value - total_profit_loss)) * 100
            WHEN portfolio_value = 0 AND total_profit_loss = 0 THEN 0
            ELSE 0
          END as profit_loss_percent
         FROM users
         WHERE email_verified = true AND (is_banned IS NULL OR is_banned = false)
         ORDER BY 
           CASE 
             WHEN (portfolio_value - total_profit_loss) > 0 THEN (total_profit_loss / (portfolio_value - total_profit_loss)) * 100
             WHEN portfolio_value = 0 AND total_profit_loss = 0 THEN 0
             ELSE 0
           END DESC,
           total_profit_loss DESC
         LIMIT $1`,
        [limit]
      );

      console.log(`Leaderboard query returned ${result.rows.length} users`);

      const leaderboard: LeaderboardEntry[] = result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        username: row.username,
        portfolio_value: parseFloat(row.portfolio_value || 0),
        total_profit_loss: parseFloat(row.total_profit_loss || 0),
        profit_loss_percent: parseFloat(row.profit_loss_percent || 0),
        balance: parseFloat(row.balance || 0)
      }));

      return {
        success: true,
        leaderboard
      };
    } catch (error) {
      console.error('Get leaderboard error:', error);
      return { success: false };
    }
  }

  // Tüm kullanıcıların rank'lerini güncelle
  static async updateRanks(): Promise<void> {
    try {
      // Önce tüm kullanıcıların rank'ini NULL yap (banlı ve doğrulanmamış kullanıcılar için)
      await pool.query(
        `UPDATE users 
         SET rank = NULL 
         WHERE email_verified = false OR (is_banned IS NOT NULL AND is_banned = true)`
      );

      // Kar/zarar yüzdesine göre sırala
      const result = await pool.query(
        `SELECT id, 
          CASE 
            WHEN (portfolio_value - total_profit_loss) > 0 THEN (total_profit_loss / (portfolio_value - total_profit_loss)) * 100
            WHEN portfolio_value = 0 AND total_profit_loss = 0 THEN 0
            ELSE 0
          END as profit_loss_percent,
          total_profit_loss
         FROM users
         WHERE email_verified = true AND (is_banned IS NULL OR is_banned = false)
         ORDER BY 
           CASE 
             WHEN (portfolio_value - total_profit_loss) > 0 THEN (total_profit_loss / (portfolio_value - total_profit_loss)) * 100
             WHEN portfolio_value = 0 AND total_profit_loss = 0 THEN 0
             ELSE 0
           END DESC,
           total_profit_loss DESC`
      );

      console.log(`Updating ranks for ${result.rows.length} users`);

      // Rank'leri güncelle
      for (let i = 0; i < result.rows.length; i++) {
        await pool.query(
          'UPDATE users SET rank = $1 WHERE id = $2',
          [i + 1, result.rows[i].id]
        );
      }
    } catch (error) {
      console.error('Update ranks error:', error);
    }
  }

  // Belirli bir kullanıcının rank'ini getir
  static async getUserRank(userId: string): Promise<{ success: boolean; rank?: number }> {
    try {
      await this.updateRanks();

      const result = await pool.query(
        'SELECT rank FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return { success: false };
      }

      return {
        success: true,
        rank: result.rows[0].rank
      };
    } catch (error) {
      console.error('Get user rank error:', error);
      return { success: false };
    }
  }
}

