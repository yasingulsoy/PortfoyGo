import pool from '../config/database';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  condition_type: string;
  condition_value: number;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  badge: Badge;
  earned_at: Date;
}

export class BadgeService {
  // Kullanıcının tüm rozetlerini getir
  static async getUserBadges(userId: string): Promise<{ success: boolean; badges?: UserBadge[] }> {
    try {
      const result = await pool.query(
        `SELECT ub.id, ub.user_id, ub.badge_id, ub.earned_at,
                b.name, b.description, b.icon, b.category, b.condition_type, b.condition_value
         FROM user_badges ub
         JOIN badges b ON ub.badge_id = b.id
         WHERE ub.user_id = $1
         ORDER BY ub.earned_at DESC`,
        [userId]
      );

      const badges: UserBadge[] = result.rows.map((row: any) => ({
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
    } catch (error) {
      console.error('Get user badges error:', error);
      return { success: false };
    }
  }

  // Tüm rozetleri getir
  static async getAllBadges(): Promise<{ success: boolean; badges?: Badge[] }> {
    try {
      const result = await pool.query(
        'SELECT * FROM badges ORDER BY category, condition_value'
      );

      const badges: Badge[] = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        category: row.category,
        condition_type: row.condition_type,
        condition_value: parseFloat(row.condition_value || 0)
      }));

      return { success: true, badges };
    } catch (error) {
      console.error('Get all badges error:', error);
      return { success: false };
    }
  }

  // Rozet kazanma kontrolü ve ekleme
  static async checkAndAwardBadges(userId: string): Promise<void> {
    try {
      // Tüm rozetleri al
      const badgesResult = await pool.query('SELECT * FROM badges');
      const allBadges = badgesResult.rows;

      // Kullanıcının mevcut rozetlerini al
      const userBadgesResult = await pool.query(
        'SELECT badge_id FROM user_badges WHERE user_id = $1',
        [userId]
      );
      const userBadgeIds = new Set(userBadgesResult.rows.map((r: any) => r.badge_id));

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
    } catch (error) {
      console.error('Check and award badges error:', error);
    }
  }

  // Rozet ver
  private static async awardBadge(userId: string, badgeId: string): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO user_badges (user_id, badge_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, badge_id) DO NOTHING`,
        [userId, badgeId]
      );
      console.log(`✅ Rozet verildi: User ${userId}, Badge ${badgeId}`);
    } catch (error) {
      console.error('Award badge error:', error);
    }
  }

  // İşlem sayısı
  private static async getTransactionCount(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM transactions WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count || 0);
  }

  // Kârlı işlem sayısı
  private static async getProfitTransactionCount(userId: string): Promise<number> {
    // Bu basitleştirilmiş bir versiyon - gerçekte portföy öğelerinden hesaplanmalı
    const result = await pool.query(
      `SELECT COUNT(DISTINCT symbol) as count 
       FROM portfolio_items 
       WHERE user_id = $1 AND profit_loss > 0`,
      [userId]
    );
    return parseInt(result.rows[0].count || 0);
  }

  // Toplam kâr
  private static async getTotalProfit(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT total_profit_loss FROM users WHERE id = $1',
      [userId]
    );
    return parseFloat(result.rows[0]?.total_profit_loss || 0);
  }

  // Portföy değeri
  private static async getPortfolioValue(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT portfolio_value FROM users WHERE id = $1',
      [userId]
    );
    return parseFloat(result.rows[0]?.portfolio_value || 0);
  }

  // Günlük işlem sayısı
  private static async getDailyTransactionCount(userId: string): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM transactions 
       WHERE user_id = $1 
       AND DATE(created_at) = CURRENT_DATE`,
      [userId]
    );
    return parseInt(result.rows[0].count || 0);
  }

  // Maksimum işlem tutarı
  private static async getMaxTransactionAmount(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT MAX(total_amount) as max_amount FROM transactions WHERE user_id = $1',
      [userId]
    );
    return parseFloat(result.rows[0]?.max_amount || 0);
  }

  // Benzersiz varlık sayısı
  private static async getUniqueAssetCount(userId: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(DISTINCT symbol) as count FROM portfolio_items WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count || 0);
  }
}

