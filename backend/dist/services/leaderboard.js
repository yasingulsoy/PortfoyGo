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
            // Önce tüm kullanıcıların rank'lerini güncelle
            await this.updateRanks();
            // Liderlik tablosunu getir
            const result = await database_1.default.query(`SELECT 
          username,
          balance,
          portfolio_value,
          total_profit_loss,
          rank,
          CASE 
            WHEN portfolio_value > 0 THEN (total_profit_loss / (portfolio_value - total_profit_loss)) * 100
            ELSE 0
          END as profit_loss_percent
         FROM users
         WHERE email_verified = true
         ORDER BY (balance + portfolio_value) DESC
         LIMIT $1`, [limit]);
            const leaderboard = result.rows.map((row, index) => ({
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
        }
        catch (error) {
            console.error('Get leaderboard error:', error);
            return { success: false };
        }
    }
    // Tüm kullanıcıların rank'lerini güncelle
    static async updateRanks() {
        try {
            // Toplam değere göre sırala (bakiye + portföy değeri)
            const result = await database_1.default.query(`SELECT id, (balance + portfolio_value) as total_value
         FROM users
         WHERE email_verified = true
         ORDER BY (balance + portfolio_value) DESC`);
            // Rank'leri güncelle
            for (let i = 0; i < result.rows.length; i++) {
                await database_1.default.query('UPDATE users SET rank = $1 WHERE id = $2', [i + 1, result.rows[i].id]);
            }
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