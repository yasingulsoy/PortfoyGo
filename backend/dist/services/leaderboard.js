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
            // Tüm kullanıcıları al ve portföy öğelerinden kar/zarar bilgilerini hesapla
            const usersResult = await database_1.default.query(`SELECT 
          id,
          username,
          balance,
          portfolio_value,
          total_profit_loss
         FROM users
         WHERE email_verified = true AND (is_banned IS NULL OR is_banned = false)`);
            // Her kullanıcı için portföy öğelerinden gerçek kar/zarar bilgilerini hesapla
            const leaderboardData = await Promise.all(usersResult.rows.map(async (user) => {
                const portfolioResult = await database_1.default.query(`SELECT quantity, current_price, average_price 
             FROM portfolio_items 
             WHERE user_id = $1`, [user.id]);
                let totalPortfolioValue = 0;
                let totalProfitLoss = 0;
                let totalInvestment = 0;
                for (const item of portfolioResult.rows) {
                    const quantity = parseFloat(item.quantity || 0);
                    const currentPrice = parseFloat(item.current_price || 0);
                    const averagePrice = parseFloat(item.average_price || 0);
                    const value = quantity * currentPrice;
                    const profitLoss = (currentPrice - averagePrice) * quantity;
                    const investment = quantity * averagePrice;
                    totalPortfolioValue += value;
                    totalProfitLoss += profitLoss;
                    totalInvestment += investment;
                }
                // Kar/zarar yüzdesini hesapla
                const profitLossPercent = totalInvestment > 0
                    ? (totalProfitLoss / totalInvestment) * 100
                    : 0;
                return {
                    id: user.id,
                    username: user.username,
                    balance: parseFloat(user.balance || 0),
                    portfolio_value: totalPortfolioValue,
                    total_profit_loss: totalProfitLoss,
                    profit_loss_percent: profitLossPercent
                };
            }));
            // Kar/zarar yüzdesine göre sırala
            leaderboardData.sort((a, b) => {
                if (b.profit_loss_percent !== a.profit_loss_percent) {
                    return b.profit_loss_percent - a.profit_loss_percent;
                }
                return b.total_profit_loss - a.total_profit_loss;
            });
            // Limit'e göre al
            const limitedData = leaderboardData.slice(0, limit);
            const leaderboard = limitedData.map((data, index) => ({
                rank: index + 1,
                username: data.username,
                portfolio_value: data.portfolio_value,
                total_profit_loss: data.total_profit_loss,
                profit_loss_percent: data.profit_loss_percent,
                balance: data.balance
            }));
            console.log(`Leaderboard query returned ${leaderboard.length} users`);
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
            // Önce tüm kullanıcıların rank'ini NULL yap (banlı ve doğrulanmamış kullanıcılar için)
            await database_1.default.query(`UPDATE users 
         SET rank = NULL 
         WHERE email_verified = false OR (is_banned IS NOT NULL AND is_banned = true)`);
            // Tüm kullanıcıları al
            const usersResult = await database_1.default.query(`SELECT id FROM users
         WHERE email_verified = true AND (is_banned IS NULL OR is_banned = false)`);
            // Her kullanıcı için portföy öğelerinden kar/zarar bilgilerini hesapla
            const userRankData = await Promise.all(usersResult.rows.map(async (user) => {
                const portfolioResult = await database_1.default.query(`SELECT quantity, current_price, average_price 
             FROM portfolio_items 
             WHERE user_id = $1`, [user.id]);
                let totalProfitLoss = 0;
                let totalInvestment = 0;
                for (const item of portfolioResult.rows) {
                    const quantity = parseFloat(item.quantity || 0);
                    const currentPrice = parseFloat(item.current_price || 0);
                    const averagePrice = parseFloat(item.average_price || 0);
                    const profitLoss = (currentPrice - averagePrice) * quantity;
                    const investment = quantity * averagePrice;
                    totalProfitLoss += profitLoss;
                    totalInvestment += investment;
                }
                // Kar/zarar yüzdesini hesapla
                const profitLossPercent = totalInvestment > 0
                    ? (totalProfitLoss / totalInvestment) * 100
                    : 0;
                return {
                    id: user.id,
                    profit_loss_percent: profitLossPercent,
                    total_profit_loss: totalProfitLoss
                };
            }));
            // Kar/zarar yüzdesine göre sırala
            userRankData.sort((a, b) => {
                if (b.profit_loss_percent !== a.profit_loss_percent) {
                    return b.profit_loss_percent - a.profit_loss_percent;
                }
                return b.total_profit_loss - a.total_profit_loss;
            });
            console.log(`Updating ranks for ${userRankData.length} users`);
            // Rank'leri güncelle
            for (let i = 0; i < userRankData.length; i++) {
                await database_1.default.query('UPDATE users SET rank = $1 WHERE id = $2', [i + 1, userRankData[i].id]);
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