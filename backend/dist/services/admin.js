"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const database_1 = __importDefault(require("../config/database"));
class AdminService {
    // Admin istatistiklerini getir
    static async getStats() {
        try {
            // Toplam kullanıcı sayısı
            const totalUsersResult = await database_1.default.query('SELECT COUNT(*) as count FROM users');
            const totalUsers = parseInt(totalUsersResult.rows[0].count);
            // Aktif kullanıcı sayısı (email doğrulanmış)
            const activeUsersResult = await database_1.default.query('SELECT COUNT(*) as count FROM users WHERE email_verified = true');
            const activeUsers = parseInt(activeUsersResult.rows[0].count);
            // Toplam işlem sayısı
            const transactionsResult = await database_1.default.query('SELECT COUNT(*) as count FROM transactions');
            const totalTransactions = parseInt(transactionsResult.rows[0].count);
            // Toplam portföy değeri
            const portfolioValueResult = await database_1.default.query('SELECT SUM(portfolio_value) as total FROM users WHERE email_verified = true');
            const totalPortfolioValue = parseFloat(portfolioValueResult.rows[0].total || 0);
            // En iyi 10 kullanıcı
            const topUsersResult = await database_1.default.query(`SELECT id, username, email, balance, portfolio_value, total_profit_loss, rank, created_at
         FROM users
         WHERE email_verified = true
         ORDER BY (balance + portfolio_value) DESC
         LIMIT 10`);
            const topUsers = topUsersResult.rows.map((row) => ({
                id: row.id,
                username: row.username,
                email: row.email,
                email_verified: row.email_verified,
                balance: parseFloat(row.balance),
                portfolio_value: parseFloat(row.portfolio_value || 0),
                total_profit_loss: parseFloat(row.total_profit_loss || 0),
                rank: row.rank,
                created_at: row.created_at
            }));
            return {
                success: true,
                stats: {
                    totalUsers,
                    activeUsers,
                    totalTransactions,
                    totalPortfolioValue,
                    topUsers
                }
            };
        }
        catch (error) {
            console.error('Get admin stats error:', error);
            return { success: false };
        }
    }
    // Tüm kullanıcıları getir
    static async getAllUsers(limit = 50, offset = 0) {
        try {
            const usersResult = await database_1.default.query(`SELECT id, username, email, email_verified, balance, portfolio_value, total_profit_loss, rank, created_at, last_login, is_banned, is_admin
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`, [limit, offset]);
            const totalResult = await database_1.default.query('SELECT COUNT(*) as count FROM users');
            const total = parseInt(totalResult.rows[0].count);
            const users = usersResult.rows.map((row) => ({
                id: row.id,
                username: row.username,
                email: row.email,
                email_verified: row.email_verified,
                balance: parseFloat(row.balance),
                portfolio_value: parseFloat(row.portfolio_value || 0),
                total_profit_loss: parseFloat(row.total_profit_loss || 0),
                rank: row.rank,
                created_at: row.created_at,
                is_banned: row.is_banned || false,
                is_admin: row.is_admin || false
            }));
            return {
                success: true,
                users,
                total
            };
        }
        catch (error) {
            console.error('Get all users error:', error);
            return { success: false };
        }
    }
    // Kullanıcıyı banla/unban yap
    static async toggleUserBan(userId, ban) {
        try {
            await database_1.default.query('UPDATE users SET is_banned = $1 WHERE id = $2', [ban, userId]);
            return {
                success: true,
                message: ban ? 'Kullanıcı yasaklandı' : 'Kullanıcı yasağı kaldırıldı'
            };
        }
        catch (error) {
            console.error('Toggle user ban error:', error);
            return {
                success: false,
                message: 'İşlem başarısız'
            };
        }
    }
}
exports.AdminService = AdminService;
//# sourceMappingURL=admin.js.map