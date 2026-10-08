import pool from '../config/database';
import { AppError } from '../utils/errors';
import { AssetType, toNumber } from '../types';
import { TransactionService } from './transaction';
import { PricingService, PriceUnavailableError, priceKey } from './pricing';

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
  quantity?: number; // Belirtilmezse tüm miktar
}

const mapOrder = (row: any): StopLossOrder => ({
  id: row.id,
  user_id: row.user_id,
  portfolio_item_id: row.portfolio_item_id,
  symbol: row.symbol,
  asset_type: row.asset_type,
  quantity: toNumber(row.quantity),
  trigger_price: toNumber(row.trigger_price),
  status: row.status,
  created_at: row.created_at,
  triggered_at: row.triggered_at,
});

export class StopLossService {
  static async createStopLoss(userId: string, data: CreateStopLossRequest): Promise<{ success: true; stopLoss: StopLossOrder }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Önce users (işlemlerle aynı kilit sırası), sonra portföy öğesi
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const portfolioResult = await client.query(
        'SELECT * FROM portfolio_items WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [data.portfolio_item_id, userId]
      );
      if (portfolioResult.rows.length === 0) {
        throw new AppError(404, 'Portföy öğesi bulunamadı', 'NOT_FOUND');
      }

      const portfolioItem = portfolioResult.rows[0];
      const held = toNumber(portfolioItem.quantity);
      const quantity = data.quantity ?? held;

      if (!(quantity > 0) || quantity > held) {
        throw new AppError(400, 'Geçersiz miktar: 0 ile eldeki miktar arasında olmalı', 'INVALID_QUANTITY');
      }

      const existing = await client.query(
        `SELECT id FROM stop_loss_orders WHERE user_id = $1 AND portfolio_item_id = $2 AND status = 'active'`,
        [userId, data.portfolio_item_id]
      );
      if (existing.rows.length > 0) {
        throw new AppError(409, 'Bu varlık için zaten aktif bir stop-loss emri var', 'DUPLICATE');
      }

      const result = await client.query(
        `INSERT INTO stop_loss_orders
           (user_id, portfolio_item_id, symbol, asset_type, quantity, trigger_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING *`,
        [userId, data.portfolio_item_id, portfolioItem.symbol, portfolioItem.asset_type, quantity, data.trigger_price]
      );

      await client.query('COMMIT');
      return { success: true, stopLoss: mapOrder(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getStopLossOrders(userId: string): Promise<{ success: true; stopLossOrders: StopLossOrder[] }> {
    const result = await pool.query(
      `SELECT * FROM stop_loss_orders
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [userId]
    );
    return { success: true, stopLossOrders: result.rows.map(mapOrder) };
  }

  static async cancelStopLoss(userId: string, stopLossId: string): Promise<{ success: boolean; message?: string }> {
    const result = await pool.query(
      `UPDATE stop_loss_orders SET status = 'cancelled'
        WHERE id = $1 AND user_id = $2 AND status = 'active'
        RETURNING id`,
      [stopLossId, userId]
    );
    if (result.rows.length === 0) {
      return { success: false, message: 'Stop-loss emri bulunamadı veya zaten aktif değil' };
    }
    return { success: true, message: 'Stop-loss emri iptal edildi' };
  }

  /**
   * Cron: aktif emirleri kontrol eder; fiyat tetikleme seviyesine indiyse satar.
   * Her emir kendi transaction'ında işlenir. Kilit sırası: users → stop_loss_orders
   * (FOR UPDATE SKIP LOCKED) → portfolio_items (TransactionService.sell içinde).
   */
  static async checkAndTriggerStopLosses(): Promise<void> {
    // 1) Pozisyonu artık olmayan aktif emirleri iptal et
    await pool.query(
      `UPDATE stop_loss_orders sl
          SET status = 'cancelled'
        WHERE sl.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM portfolio_items pi WHERE pi.id = sl.portfolio_item_id)`
    );

    // 2) Aday emirler (kilitsiz okuma)
    const candidates = await pool.query(
      `SELECT sl.id, sl.user_id, sl.symbol, sl.asset_type, sl.trigger_price
         FROM stop_loss_orders sl
        WHERE sl.status = 'active'
        ORDER BY sl.created_at
        LIMIT 500`
    );
    if (candidates.rows.length === 0) return;

    // 3) Güncel (taze) fiyatlar
    const keys = candidates.rows.map((r: any) => ({ symbol: String(r.symbol).toUpperCase(), asset_type: r.asset_type as AssetType }));
    const prices = await PricingService.getPricesTRY(keys, true);

    for (const cand of candidates.rows) {
      const current = prices.get(priceKey(cand.asset_type, String(cand.symbol)));
      if (current === undefined || current > toNumber(cand.trigger_price)) {
        continue;
      }
      try {
        await this.triggerOne(cand.id, cand.user_id);
      } catch (error: any) {
        console.error(`[stop-loss] Emir işlenemedi (${cand.id}):`, error?.publicMessage || error?.message);
      }
    }
  }

  private static async triggerOne(orderId: string, userId: string): Promise<void> {
    const client = await pool.connect();
    let postCommit: (() => void) | undefined;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      const orderRes = await client.query(
        `SELECT * FROM stop_loss_orders
          WHERE id = $1 AND user_id = $2 AND status = 'active'
          FOR UPDATE SKIP LOCKED`,
        [orderId, userId]
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        return; // başka bir süreç işliyor veya artık aktif değil
      }

      const holdingRes = await client.query(
        'SELECT quantity FROM portfolio_items WHERE id = $1 AND user_id = $2',
        [order.portfolio_item_id, userId]
      );
      const held = holdingRes.rows[0] ? toNumber(holdingRes.rows[0].quantity) : 0;
      if (held <= 0) {
        await client.query(`UPDATE stop_loss_orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
        await client.query('COMMIT');
        return;
      }

      // Taze fiyatla tekrar kontrol et (aday seçimi ile bu an arasında fiyat değişmiş olabilir)
      const quote = await PricingService.getExecutionPriceTRY(order.symbol, order.asset_type);
      if (quote.priceTRY > toNumber(order.trigger_price)) {
        await client.query('ROLLBACK');
        return;
      }

      const quantity = Math.min(toNumber(order.quantity), held);
      const result = await TransactionService.sell(
        userId,
        { symbol: order.symbol, asset_type: order.asset_type, quantity },
        { client, quote, capToHolding: true, source: 'stop_loss' }
      );
      postCommit = result.postCommit;

      // Pozisyon tamamen kapandıysa FK CASCADE emri silmiş olabilir; UPDATE 0 satır etkiler, sorun değil
      await client.query(
        `UPDATE stop_loss_orders SET status = 'triggered', triggered_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );

      await client.query('COMMIT');
      console.log(`[stop-loss] Tetiklendi: ${order.symbol} ${quantity} @ ${quote.priceTRY.toFixed(4)} TL`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof PriceUnavailableError) {
        return; // fiyat yok: emir aktif kalır, sonraki turda tekrar denenir
      }
      if (error instanceof AppError && error.status < 500) {
        // İş kuralı hatası (ör. tutar çok küçük): emri iptal et ki her dakika tekrar denenmesin
        await pool
          .query(`UPDATE stop_loss_orders SET status = 'cancelled' WHERE id = $1 AND status = 'active'`, [orderId])
          .catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
    postCommit?.();
  }
}
