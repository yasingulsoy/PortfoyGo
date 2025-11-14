"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BadgeService = void 0;
const database_1 = __importDefault(require("../config/database"));
class BadgeService {
    // Kullanıcının tüm rozetlerini getir
    static async getUserBadges(userId) {
        try {
            const result = await database_1.default.query(`SELECT ub.id, ub.user_id, ub.badge_id, ub.earned_at,
                b.name, b.description, b.icon, b.category, b.condition_type, b.condition_value
         FROM user_badges ub
         JOIN badges b ON ub.badge_id = b.id
         WHERE ub.user_id = $1
         ORDER BY ub.earned_at DESC`, [userId]);
            const badges = result.rows.map((row) => ({
                id: row.id,
                user_id: row.user_id,
                badge_id: row.badge_id,
                badge: {
                    id: row.badge_id,
                    name: row.name,
                    description: row.description,
                    icon: row.icon,
                    category: row.category,
                    condition_type: row.condition_type,
                    condition_value: parseFloat(row.condition_value || 0)
                },
                earned_at: row.earned_at
            }));
            return { success: true, badges };
        }
        catch (error) {
            console.error('Get user badges error:', error);
            return { success: false };
        }
    }
    // Tüm rozetleri getir
    static async getAllBadges() {
        try {
            const result = await database_1.default.query('SELECT * FROM badges ORDER BY category, condition_value');
            const badges = result.rows.map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description,
                icon: row.icon,
                category: row.category,
                condition_type: row.condition_type,
                condition_value: parseFloat(row.condition_value || 0)
            }));
            return { success: true, badges };
        }
        catch (error) {
            console.error('Get all badges error:', error);
            return { success: false };
        }
    }
    // Rozet kazanma kontrolü ve ekleme
    static async checkAndAwardBadges(userId) {
        try {
            // Tüm rozetleri al
            const badgesResult = await database_1.default.query('SELECT * FROM badges');
            const allBadges = badgesResult.rows;
            // Kullanıcının mevcut rozetlerini al
            const userBadgesResult = await database_1.default.query('SELECT badge_id FROM user_badges WHERE user_id = $1', [userId]);
            const userBadgeIds = new Set(userBadgesResult.rows.map((r) => r.badge_id));
            for (const badge of allBadges) {
                // Zaten kazanılmış mı kontrol et
                if (userBadgeIds.has(badge.id)) {
                    continue;
                }
                let shouldAward = false;
                switch (badge.condition_type) {
                    case 'transaction_count':
                        const transactionCount = await this.getTransactionCount(userId);
                        shouldAward = transactionCount >= parseFloat(badge.condition_value);
                        break;
                    case 'profit_count':
                        const profitCount = await this.getProfitTransactionCount(userId);
                        shouldAward = profitCount >= parseFloat(badge.condition_value);
                        break;
                    case 'profit_amount':
                        const totalProfit = await this.getTotalProfit(userId);
                        shouldAward = totalProfit >= parseFloat(badge.condition_value);
                        break;
                    case 'portfolio_value':
                        const portfolioValue = await this.getPortfolioValue(userId);
                        shouldAward = portfolioValue >= parseFloat(badge.condition_value);
                        break;
                    case 'daily_transaction_count':
                        const dailyCount = await this.getDailyTransactionCount(userId);
                        shouldAward = dailyCount >= parseFloat(badge.condition_value);
                        break;
                    case 'single_transaction_amount':
                        const maxTransaction = await this.getMaxTransactionAmount(userId);
                        shouldAward = maxTransaction >= parseFloat(badge.condition_value);
                        break;
                    case 'unique_assets':
                        const uniqueAssets = await this.getUniqueAssetCount(userId);
                        shouldAward = uniqueAssets >= parseFloat(badge.condition_value);
                        break;
                }
                if (shouldAward) {
                    await this.awardBadge(userId, badge.id);
                }
            }
        }
        catch (error) {
            console.error('Check and award badges error:', error);
        }
    }
    // Rozet ver
    static async awardBadge(userId, badgeId) {
        try {
            await database_1.default.query(`INSERT INTO user_badges (user_id, badge_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, badge_id) DO NOTHING`, [userId, badgeId]);
            console.log(`✅ Rozet verildi: User ${userId}, Badge ${badgeId}`);
        }
        catch (error) {
            console.error('Award badge error:', error);
        }
    }
    // İşlem sayısı
    static async getTransactionCount(userId) {
        const result = await database_1.default.query('SELECT COUNT(*) as count FROM transactions WHERE user_id = $1', [userId]);
        return parseInt(result.rows[0].count || 0);
    }
    // Kârlı işlem sayısı
    static async getProfitTransactionCount(userId) {
        // Bu basitleştirilmiş bir versiyon - gerçekte portföy öğelerinden hesaplanmalı
        const result = await database_1.default.query(`SELECT COUNT(DISTINCT symbol) as count 
       FROM portfolio_items 
       WHERE user_id = $1 AND profit_loss > 0`, [userId]);
        return parseInt(result.rows[0].count || 0);
    }
    // Toplam kâr
    static async getTotalProfit(userId) {
        const result = await database_1.default.query('SELECT total_profit_loss FROM users WHERE id = $1', [userId]);
        return parseFloat(result.rows[0]?.total_profit_loss || 0);
    }
    // Portföy değeri
    static async getPortfolioValue(userId) {
        const result = await database_1.default.query('SELECT portfolio_value FROM users WHERE id = $1', [userId]);
        return parseFloat(result.rows[0]?.portfolio_value || 0);
    }
    // Günlük işlem sayısı
    static async getDailyTransactionCount(userId) {
        const result = await database_1.default.query(`SELECT COUNT(*) as count 
       FROM transactions 
       WHERE user_id = $1 
       AND DATE(created_at) = CURRENT_DATE`, [userId]);
        return parseInt(result.rows[0].count || 0);
    }
    // Maksimum işlem tutarı
    static async getMaxTransactionAmount(userId) {
        const result = await database_1.default.query('SELECT MAX(total_amount) as max_amount FROM transactions WHERE user_id = $1', [userId]);
        return parseFloat(result.rows[0]?.max_amount || 0);
    }
    // Benzersiz varlık sayısı
    static async getUniqueAssetCount(userId) {
        const result = await database_1.default.query('SELECT COUNT(DISTINCT symbol) as count FROM portfolio_items WHERE user_id = $1', [userId]);
        return parseInt(result.rows[0].count || 0);
    }
}
exports.BadgeService = BadgeService;
//# sourceMappingURL=badges.js.map