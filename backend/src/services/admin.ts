import pool from '../config/database';
import { User } from '../types';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalPortfolioValue: number;
  topUsers: User[];
}

export class AdminService {
  // Admin istatistiklerini getir
  static async getStats(): Promise<{ success: boolean; stats?: AdminStats }> {
    try {
      // Toplam kullanıcı sayısı
      const totalUsersResult = await pool.query(
        'SELECT COUNT(*) as count FROM users'
      );
      const totalUsers = parseInt(totalUsersResult.rows[0].count);

      // Aktif kullanıcı sayısı (email doğrulanmış)
      const activeUsersResult = await pool.query(
        'SELECT COUNT(*) as count FROM users WHERE email_verified = true'
      );
      const activeUsers = parseInt(activeUsersResult.rows[0].count);

      // Toplam işlem sayısı
      const transactionsResult = await pool.query(
        'SELECT COUNT(*) as count FROM transactions'
      );
      const totalTransactions = parseInt(transactionsResult.rows[0].count);

      // Toplam portföy değeri
      const portfolioValueResult = await pool.query(
        'SELECT SUM(portfolio_value) as total FROM users WHERE email_verified = true'
      );
      const totalPortfolioValue = parseFloat(portfolioValueResult.rows[0].total || 0);

      // En iyi 10 kullanıcı
      const topUsersResult = await pool.query(
        `SELECT id, username, email, balance, portfolio_value, total_profit_loss, rank, created_at
         FROM users
         WHERE email_verified = true
         ORDER BY (balance + portfolio_value) DESC
         LIMIT 10`
      );

      const topUsers: User[] = topUsersResult.rows.map((row: any) => ({
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
    } catch (error) {
      console.error('Get admin stats error:', error);
      return { success: false };
    }
  }

  // Tüm kullanıcıları getir
  static async getAllUsers(limit: number = 50, offset: number = 0): Promise<{ success: boolean; users?: User[]; total?: number }> {
    try {
      const usersResult = await pool.query(
        `SELECT id, username, email, email_verified, balance, portfolio_value, total_profit_loss, rank, created_at, last_login, is_banned, is_admin
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const totalResult = await pool.query('SELECT COUNT(*) as count FROM users');
      const total = parseInt(totalResult.rows[0].count);

      const users: User[] = usersResult.rows.map((row: any) => ({
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
    } catch (error) {
      console.error('Get all users error:', error);
      return { success: false };
    }
  }

  // Kullanıcıyı banla/unban yap
  static async toggleUserBan(userId: string, ban: boolean): Promise<{ success: boolean; message?: string }> {
    try {
      await pool.query(
        'UPDATE users SET is_banned = $1 WHERE id = $2',
        [ban, userId]
      );

      return {
        success: true,
        message: ban ? 'Kullanıcı yasaklandı' : 'Kullanıcı yasağı kaldırıldı'
      };
    } catch (error) {
      console.error('Toggle user ban error:', error);
      return {
        success: false,
        message: 'İşlem başarısız'
      };
    }
  }
}

