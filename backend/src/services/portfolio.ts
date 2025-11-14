import pool from '../config/database';
import { PortfolioItem, Transaction } from '../types';

export class PortfolioService {
  // Kullanıcının portföyünü getir
  static async getPortfolio(userId: string): Promise<{ success: boolean; portfolio?: PortfolioItem[]; balance?: number; portfolioValue?: number; totalProfitLoss?: number }> {
    try {
      // Portföy öğelerini al
      const portfolioResult = await pool.query(
        `SELECT * FROM portfolio_items WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );

      // Kullanıcı bilgilerini al
      const userResult = await pool.query(
        'SELECT balance, portfolio_value, total_profit_loss FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return { success: false };
      }

      const user = userResult.rows[0];

      const portfolio: PortfolioItem[] = portfolioResult.rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        symbol: row.symbol,
        name: row.name,
        asset_type: row.asset_type,
        quantity: parseFloat(row.quantity),
        average_price: parseFloat(row.average_price),
        current_price: parseFloat(row.current_price),
        total_value: parseFloat(row.total_value || 0),
        profit_loss: parseFloat(row.profit_loss || 0),
        profit_loss_percent: parseFloat(row.profit_loss_percent || 0),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      return {
        success: true,
        portfolio,
        balance: parseFloat(user.balance),
        portfolioValue: parseFloat(user.portfolio_value || 0),
        totalProfitLoss: parseFloat(user.total_profit_loss || 0)
      };
    } catch (error) {
      console.error('Get portfolio error:', error);
      return { success: false };
    }
  }

  // İşlem geçmişini getir
  static async getTransactions(userId: string, limit: number = 50): Promise<{ success: boolean; transactions?: Transaction[] }> {
    try {
      const result = await pool.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
      );

      const transactions: Transaction[] = result.rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        symbol: row.symbol,
        name: row.name,
        asset_type: row.asset_type,
        quantity: parseFloat(row.quantity),
        price: parseFloat(row.price),
        total_amount: parseFloat(row.total_amount),
        commission: parseFloat(row.commission),
        net_amount: parseFloat(row.net_amount),
        created_at: row.created_at
      }));

      return {
        success: true,
        transactions
      };
    } catch (error) {
      console.error('Get transactions error:', error);
      return { success: false };
    }
  }

  // Portföy değerlerini güncelle (fiyat güncellemeleri için)
  static async updatePortfolioPrices(userId: string, priceUpdates: { symbol: string; asset_type: string; price: number }[]): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      for (const update of priceUpdates) {
        await client.query(
          `UPDATE portfolio_items 
           SET current_price = $1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2 AND symbol = $3 AND asset_type = $4`,
          [update.price, userId, update.symbol, update.asset_type]
        );
      }

      // Portföy değerlerini yeniden hesapla
      const portfolioResult = await client.query(
        `SELECT quantity, current_price, average_price 
         FROM portfolio_items 
         WHERE user_id = $1`,
        [userId]
      );

      let totalPortfolioValue = 0;
      let totalProfitLoss = 0;

      for (const item of portfolioResult.rows) {
        const quantity = parseFloat(item.quantity);
        const currentPrice = parseFloat(item.current_price);
        const averagePrice = parseFloat(item.average_price);
        const symbol = item.symbol;
        const assetType = item.asset_type;
        
        const value = quantity * currentPrice;
        const profitLoss = (currentPrice - averagePrice) * quantity;

        totalPortfolioValue += value;
        totalProfitLoss += profitLoss;

        await client.query(
          `UPDATE portfolio_items 
           SET total_value = $1, profit_loss = $2, profit_loss_percent = $3, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4 AND symbol = $5 AND asset_type = $6`,
          [
            value,
            profitLoss,
            averagePrice > 0 ? ((currentPrice - averagePrice) / averagePrice) * 100 : 0,
            userId,
            symbol,
            assetType
          ]
        );
      }

      await client.query(
        `UPDATE users 
         SET portfolio_value = $1, total_profit_loss = $2 
         WHERE id = $3`,
        [totalPortfolioValue, totalProfitLoss, userId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update portfolio prices error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

