import pool from '../config/database';
import { PortfolioItem, Transaction } from '../types';

const COMMISSION_RATE = 0.0025; // %0.25 komisyon

export interface BuyRequest {
  symbol: string;
  name: string;
  asset_type: 'crypto' | 'stock';
  quantity: number;
  price: number;
}

export interface SellRequest {
  symbol: string;
  quantity: number;
}

export class TransactionService {
  // Alış işlemi
  static async buy(userId: string, data: BuyRequest): Promise<{ success: boolean; message?: string; transaction?: Transaction; portfolioItem?: PortfolioItem }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Kullanıcı bilgilerini al
      const userResult = await client.query(
        'SELECT balance FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Kullanıcı bulunamadı' };
      }

      const user = userResult.rows[0];
      const totalAmount = data.quantity * data.price;
      const commission = totalAmount * COMMISSION_RATE;
      const netAmount = totalAmount + commission;

      // Bakiye kontrolü
      if (parseFloat(user.balance) < netAmount) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Yetersiz bakiye' };
      }

      // İşlemi kaydet
      const transactionResult = await client.query(
        `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          userId,
          'buy',
          data.symbol,
          data.name,
          data.asset_type,
          data.quantity,
          data.price,
          totalAmount,
          commission,
          netAmount
        ]
      );

      const transaction = transactionResult.rows[0];

      // Bakiyeyi güncelle
      await client.query(
        'UPDATE users SET balance = balance - $1 WHERE id = $2',
        [netAmount, userId]
      );

      // Portföy öğesini güncelle veya oluştur
      const portfolioResult = await client.query(
        `SELECT * FROM portfolio_items WHERE user_id = $1 AND symbol = $2 AND asset_type = $3`,
        [userId, data.symbol, data.asset_type]
      );

      if (portfolioResult.rows.length > 0) {
        // Mevcut portföy öğesini güncelle
        const existingItem = portfolioResult.rows[0];
        const totalQuantity = parseFloat(existingItem.quantity) + data.quantity;
        const totalCost = (parseFloat(existingItem.average_price) * parseFloat(existingItem.quantity)) + totalAmount;
        const newAveragePrice = totalCost / totalQuantity;

        await client.query(
          `UPDATE portfolio_items 
           SET quantity = $1, average_price = $2, current_price = $3, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4 AND symbol = $5 AND asset_type = $6`,
          [totalQuantity, newAveragePrice, data.price, userId, data.symbol, data.asset_type]
        );
      } else {
        // Yeni portföy öğesi oluştur
        await client.query(
          `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, data.symbol, data.name, data.asset_type, data.quantity, data.price, data.price]
        );
      }

      // Portföy değerlerini güncelle
      await this.updatePortfolioValue(userId, client);

      await client.query('COMMIT');

      // Rozet kontrolü (asenkron, hata olsa bile devam et)
      setImmediate(async () => {
        try {
          const { BadgeService } = await import('./badges');
          await BadgeService.checkAndAwardBadges(userId);
        } catch (error) {
          console.error('Badge check error:', error);
        }
      });

      // Güncellenmiş portföy öğesini al
      const updatedPortfolioResult = await client.query(
        `SELECT * FROM portfolio_items WHERE user_id = $1 AND symbol = $2 AND asset_type = $3`,
        [userId, data.symbol, data.asset_type]
      );

      return {
        success: true,
        transaction: {
          id: transaction.id,
          user_id: transaction.user_id,
          type: transaction.type,
          symbol: transaction.symbol,
          name: transaction.name,
          asset_type: transaction.asset_type,
          quantity: parseFloat(transaction.quantity),
          price: parseFloat(transaction.price),
          total_amount: parseFloat(transaction.total_amount),
          commission: parseFloat(transaction.commission),
          net_amount: parseFloat(transaction.net_amount),
          created_at: transaction.created_at
        },
        portfolioItem: updatedPortfolioResult.rows[0] ? {
          id: updatedPortfolioResult.rows[0].id,
          user_id: updatedPortfolioResult.rows[0].user_id,
          symbol: updatedPortfolioResult.rows[0].symbol,
          name: updatedPortfolioResult.rows[0].name,
          asset_type: updatedPortfolioResult.rows[0].asset_type,
          quantity: parseFloat(updatedPortfolioResult.rows[0].quantity),
          average_price: parseFloat(updatedPortfolioResult.rows[0].average_price),
          current_price: parseFloat(updatedPortfolioResult.rows[0].current_price),
          total_value: parseFloat(updatedPortfolioResult.rows[0].total_value || 0),
          profit_loss: parseFloat(updatedPortfolioResult.rows[0].profit_loss || 0),
          profit_loss_percent: parseFloat(updatedPortfolioResult.rows[0].profit_loss_percent || 0),
          created_at: updatedPortfolioResult.rows[0].created_at,
          updated_at: updatedPortfolioResult.rows[0].updated_at
        } : undefined
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Buy transaction error:', error);
      return { success: false, message: 'İşlem sırasında bir hata oluştu' };
    } finally {
      client.release();
    }
  }

  // Satış işlemi
  static async sell(userId: string, data: SellRequest): Promise<{ success: boolean; message?: string; transaction?: Transaction; portfolioItem?: PortfolioItem }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Portföy öğesini kontrol et
      const portfolioResult = await client.query(
        `SELECT * FROM portfolio_items WHERE user_id = $1 AND symbol = $2`,
        [userId, data.symbol]
      );

      if (portfolioResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Portföyde bu varlık bulunamadı' };
      }

      const portfolioItem = portfolioResult.rows[0];

      // Miktar kontrolü
      if (parseFloat(portfolioItem.quantity) < data.quantity) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Yetersiz miktar' };
      }

      // Güncel fiyatı al (portföy öğesindeki current_price kullanılır)
      const currentPrice = parseFloat(portfolioItem.current_price);
      const totalAmount = data.quantity * currentPrice;
      const commission = totalAmount * COMMISSION_RATE;
      const netAmount = totalAmount - commission;

      // İşlemi kaydet
      const transactionResult = await client.query(
        `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          userId,
          'sell',
          portfolioItem.symbol,
          portfolioItem.name,
          portfolioItem.asset_type,
          data.quantity,
          currentPrice,
          totalAmount,
          commission,
          netAmount
        ]
      );

      const transaction = transactionResult.rows[0];

      // Bakiyeyi güncelle
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [netAmount, userId]
      );

      // Portföy öğesini güncelle
      const newQuantity = parseFloat(portfolioItem.quantity) - data.quantity;

      if (newQuantity <= 0) {
        // Tüm varlık satıldıysa portföy öğesini sil
        await client.query(
          'DELETE FROM portfolio_items WHERE user_id = $1 AND symbol = $2 AND asset_type = $3',
          [userId, data.symbol, portfolioItem.asset_type]
        );
      } else {
        // Kısmi satış - miktarı güncelle
        await client.query(
          `UPDATE portfolio_items 
           SET quantity = $1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2 AND symbol = $3 AND asset_type = $4`,
          [newQuantity, userId, data.symbol, portfolioItem.asset_type]
        );
      }

      // Portföy değerlerini güncelle
      await this.updatePortfolioValue(userId, client);

      await client.query('COMMIT');

      // Rozet kontrolü (asenkron, hata olsa bile devam et)
      setImmediate(async () => {
        try {
          const { BadgeService } = await import('./badges');
          await BadgeService.checkAndAwardBadges(userId);
        } catch (error) {
          console.error('Badge check error:', error);
        }
      });

      return {
        success: true,
        transaction: {
          id: transaction.id,
          user_id: transaction.user_id,
          type: transaction.type,
          symbol: transaction.symbol,
          name: transaction.name,
          asset_type: transaction.asset_type,
          quantity: parseFloat(transaction.quantity),
          price: parseFloat(transaction.price),
          total_amount: parseFloat(transaction.total_amount),
          commission: parseFloat(transaction.commission),
          net_amount: parseFloat(transaction.net_amount),
          created_at: transaction.created_at
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Sell transaction error:', error);
      return { success: false, message: 'İşlem sırasında bir hata oluştu' };
    } finally {
      client.release();
    }
  }

  // Portföy değerlerini güncelle
  private static async updatePortfolioValue(userId: string, client: any): Promise<void> {
    // Portföy öğelerini al ve değerleri hesapla
    const portfolioResult = await client.query(
      `SELECT quantity, current_price, average_price, symbol, asset_type 
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

      // Portföy öğesinin değerlerini güncelle
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

    // Kullanıcının portföy değerini güncelle
    await client.query(
      `UPDATE users 
       SET portfolio_value = $1, total_profit_loss = $2 
       WHERE id = $3`,
      [totalPortfolioValue, totalProfitLoss, userId]
    );
  }
}

