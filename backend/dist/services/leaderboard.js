"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardService = void 0;
const database_1 = __importDefault(require("../config/database"));
class LeaderboardService {
    // Liderlik tablosunu getir
    static async getLeaderboard(limit = 10) {
        try {
            await this.updateRanks();
            // portfolio_items zaten güncel (cron job her 2 dk günceller)
            // Tek bir sorgu ile tüm leaderboard verisini çek
            const result = await database_1.default.query(`
        SELECT 
          u.username,
          u.balance,
          COALESCE(SUM(pi.total_value), 0) AS portfolio_value,
          COALESCE(SUM(pi.profit_loss), 0) AS total_profit_loss,
          CASE 
            WHEN COALESCE(SUM(pi.quantity * pi.average_price), 0) > 0 
            THEN (SUM(pi.profit_loss) / SUM(pi.quantity * pi.average_price)) * 100
            ELSE 0 
          END AS profit_loss_percent
        FROM users u
        LEFT JOIN portfolio_items pi ON u.id = pi.user_id
        WHERE u.email_verified = true 
          AND (u.is_banned IS NULL OR u.is_banned = false)
        GROUP BY u.id, u.username, u.balance
        ORDER BY profit_loss_percent DESC, total_profit_loss DESC
        LIMIT $1
      `, [limit]);
            const leaderboard = result.rows.map((row, index) => ({
                rank: index + 1,
                username: row.username,
                portfolio_value: parseFloat(row.portfolio_value),
                total_profit_loss: parseFloat(row.total_profit_loss),
                profit_loss_percent: parseFloat(row.profit_loss_percent),
                balance: parseFloat(row.balance)
            }));
            console.log(`Leaderboard query returned ${leaderboard.length} users`);
            return { success: true, leaderboard };
        }
        catch (error) {
            console.error('Get leaderboard error:', error);
            return { success: false };
        }
    }
    // Tüm kullanıcıların rank'lerini güncelle (tek sorgu ile)
    static async updateRanks() {
        try {
            // Banlı/doğrulanmamış kullanıcıları NULL yap
            await database_1.default.query(`
        UPDATE users 
        SET rank = NULL 
        WHERE email_verified = false OR (is_banned IS NOT NULL AND is_banned = true)
      `);
            // Tüm aktif kullanıcıları tek sorguda sırala ve rank ata
            await database_1.default.query(`
        UPDATE users u
        SET rank = ranked.rn
        FROM (
          SELECT 
            u2.id,
            ROW_NUMBER() OVER (
              ORDER BY 
                CASE 
                  WHEN COALESCE(inv.total_investment, 0) > 0 
                  THEN (COALESCE(inv.total_profit_loss, 0) / inv.total_investment) * 100
                  ELSE 0 
                END DESC,
                COALESCE(inv.total_profit_loss, 0) DESC
            ) AS rn
          FROM users u2
          LEFT JOIN (
            SELECT 
              user_id,
              SUM(profit_loss) AS total_profit_loss,
              SUM(quantity * average_price) AS total_investment
            FROM portfolio_items
            GROUP BY user_id
          ) inv ON u2.id = inv.user_id
          WHERE u2.email_verified = true 
            AND (u2.is_banned IS NULL OR u2.is_banned = false)
        ) ranked
        WHERE u.id = ranked.id
      `);
        }
        catch (error) {
            console.error('Update ranks error:', error);
        }
    }
    // Belirli bir kullanıcının rank'ini getir
    static async getUserRank(userId) {
        try {
            await this.updateRanks();
            const result = await database_1.default.query('SELECT rank FROM users WHERE id = $1', [userId]);
            if (result.rows.length === 0) {
                return { success: false };
            }
            return {
                success: true,
                rank: result.rows[0].rank
            };
        }
        catch (error) {
            console.error('Get user rank error:', error);
            return { success: false };
        }
    }
}
exports.LeaderboardService = LeaderboardService;
//# sourceMappingURL=leaderboard.js.map