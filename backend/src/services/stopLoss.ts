import pool from '../config/database';
import { TransactionService } from './transaction';

export interface StopLossOrder {
  id: string;
  user_id: string;
  portfolio_item_id: string;
  symbol: string;
  asset_type: string;
  quantity: number;
  trigger_price: number;
  status: 'active' | 'triggered' | 'cancelled';
  created_at: Date;
  triggered_at?: Date;
}

export interface CreateStopLossRequest {
  portfolio_item_id: string;
  trigger_price: number;
  quantity?: number; // Eğer belirtilmezse tüm miktar için
}

export class StopLossService {
  // Stop-loss emri oluştur
  static async createStopLoss(userId: string, data: CreateStopLossRequest): Promise<{ success: boolean; message?: string; stopLoss?: StopLossOrder }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Portföy öğesini kontrol et
      const portfolioResult = await client.query(
        'SELECT * FROM portfolio_items WHERE id = $1 AND user_id = $2',
        [data.portfolio_item_id, userId]
      );

      if (portfolioResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Portföy öğesi bulunamadı!' };
      }

      const portfolioItem = portfolioResult.rows[0];
      const quantity = data.quantity || parseFloat(portfolioItem.quantity);

      // Miktar kontrolü
      if (quantity > parseFloat(portfolioItem.quantity)) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Yetersiz miktar!' };
      }

      // Mevcut aktif stop-loss'u kontrol et
      const existingResult = await client.query(
        'SELECT id FROM stop_loss_orders WHERE user_id = $1 AND portfolio_item_id = $2 AND status = $3',
        [userId, data.portfolio_item_id, 'active']
      );

      if (existingResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Bu varlık için zaten aktif bir stop-loss emri var!' };
      }

      // Stop-loss emri oluştur
      const result = await client.query(
        `INSERT INTO stop_loss_orders 
         (user_id, portfolio_item_id, symbol, asset_type, quantity, trigger_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [
          userId,
          data.portfolio_item_id,
          portfolioItem.symbol,
          portfolioItem.asset_type,
          quantity,
          data.trigger_price
        ]
      );

      await client.query('COMMIT');

      const stopLoss: StopLossOrder = {
        id: result.rows[0].id,
        user_id: result.rows[0].user_id,
        portfolio_item_id: result.rows[0].portfolio_item_id,
        symbol: result.rows[0].symbol,
        asset_type: result.rows[0].asset_type,
        quantity: parseFloat(result.rows[0].quantity),
        trigger_price: parseFloat(result.rows[0].trigger_price),
        status: result.rows[0].status,
        created_at: result.rows[0].created_at,
        triggered_at: result.rows[0].triggered_at
      };

      return { success: true, stopLoss };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create stop-loss error:', error);
      return { success: false, message: 'Stop-loss emri oluşturulamadı!' };
    } finally {
      client.release();
    }
  }

  // Kullanıcının stop-loss emirlerini getir
  static async getStopLossOrders(userId: string): Promise<{ success: boolean; stopLossOrders?: StopLossOrder[] }> {
    try {
      const result = await pool.query(
        `SELECT * FROM stop_loss_orders 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      const stopLossOrders: StopLossOrder[] = result.rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        portfolio_item_id: row.portfolio_item_id,
        symbol: row.symbol,
        asset_type: row.asset_type,
        quantity: parseFloat(row.quantity),
        trigger_price: parseFloat(row.trigger_price),
        status: row.status,
        created_at: row.created_at,
        triggered_at: row.triggered_at
      }));

      return { success: true, stopLossOrders };
    } catch (error) {
      console.error('Get stop-loss orders error:', error);
      return { success: false };
    }
  }

  // Stop-loss emrini iptal et
  static async cancelStopLoss(userId: string, stopLossId: string): Promise<{ success: boolean; message?: string }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'UPDATE stop_loss_orders SET status = $1 WHERE id = $2 AND user_id = $3 AND status = $4 RETURNING *',
        ['cancelled', stopLossId, userId, 'active']
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Stop-loss emri bulunamadı veya zaten iptal edilmiş!' };
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Cancel stop-loss error:', error);
      return { success: false, message: 'Stop-loss emri iptal edilemedi!' };
    } finally {
      client.release();
    }
  }

  // Aktif stop-loss emirlerini kontrol et ve tetiklenenleri işle
  static async checkAndTriggerStopLosses(): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Aktif stop-loss emirlerini getir
      const result = await client.query(
        `SELECT sl.*, pi.current_price, pi.name 
         FROM stop_loss_orders sl
         JOIN portfolio_items pi ON sl.portfolio_item_id = pi.id
         WHERE sl.status = 'active'`
      );

      for (const order of result.rows) {
        const currentPrice = parseFloat(order.current_price);
        const triggerPrice = parseFloat(order.trigger_price);

        // Fiyat trigger fiyatına ulaştı veya geçti mi?
        if (currentPrice <= triggerPrice) {
          // Stop-loss'u tetikle - otomatik satış yap
          const sellResult = await TransactionService.sell(order.user_id, {
            symbol: order.symbol,
            quantity: parseFloat(order.quantity)
          });

          if (sellResult.success) {
            // Stop-loss'u tetiklendi olarak işaretle
            await client.query(
              'UPDATE stop_loss_orders SET status = $1, triggered_at = CURRENT_TIMESTAMP WHERE id = $2',
              ['triggered', order.id]
            );
            
            console.log(`Stop-loss tetiklendi: ${order.symbol} - ${order.quantity} adet ${triggerPrice} fiyatından satıldı`);
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Check stop-losses error:', error);
    } finally {
      client.release();
    }
  }
}

