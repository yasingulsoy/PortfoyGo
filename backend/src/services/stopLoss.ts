import pool from '../config/database';
import { AppError } from '../utils/errors';
import { toNumber } from '../types';
import { Order, OrderService } from './orders';

/**
 * GERİYE DÖNÜK UYUMLULUK: /api/stop-loss uçları artık genel "bekleyen emirler"
 * (orders tablosu, type = 'stop_loss', side = 'sell') üzerinde çalışır.
 * Eski stop_loss_orders tablosu kullanılmaz (004_orders.sql aktif emirleri taşır).
 * Emirler OrderService.processOrders (cron) tarafından gerçekleştirilir.
 */

export interface StopLossOrder {
  id: string;
  user_id: string;
  /** Pozisyon hâlâ açıksa güncel portföy öğesi ID'si; kapandıysa boş */
  portfolio_item_id: string;
  symbol: string;
  name?: string | null;
  asset_type: string;
  quantity: number;
  trigger_price: number;
  status: 'active' | 'triggered' | 'cancelled';
  created_at: Date;
  triggered_at?: Date;
  expires_at?: Date | null;
}

export interface CreateStopLossRequest {
  portfolio_item_id: string;
  trigger_price: number;
  quantity?: number; // Belirtilmezse tüm miktar
}

function toLegacy(order: Order, portfolioItemId: string | null): StopLossOrder {
  return {
    id: order.id,
    user_id: order.user_id,
    portfolio_item_id: portfolioItemId ?? '',
    symbol: order.symbol,
    name: order.name,
    asset_type: order.asset_type,
    quantity: order.quantity,
    trigger_price: order.trigger_price,
    status: order.status === 'active' ? 'active' : order.status === 'filled' ? 'triggered' : 'cancelled',
    created_at: order.created_at,
    triggered_at: order.filled_at ?? undefined,
    expires_at: order.expires_at,
  };
}

export class StopLossService {
  static async createStopLoss(userId: string, data: CreateStopLossRequest): Promise<{ success: true; stopLoss: StopLossOrder }> {
    const itemRes = await pool.query('SELECT id, symbol, asset_type, quantity FROM portfolio_items WHERE id = $1 AND user_id = $2', [
      data.portfolio_item_id,
      userId,
    ]);
    const item = itemRes.rows[0];
    if (!item) {
      throw new AppError(404, 'Portföy öğesi bulunamadı', 'NOT_FOUND');
    }
    const held = toNumber(item.quantity);
    const quantity = data.quantity ?? held;
    if (!(quantity > 0) || quantity > held) {
      throw new AppError(400, 'Geçersiz miktar: 0 ile eldeki miktar arasında olmalı', 'INVALID_QUANTITY');
    }

    const { order } = await OrderService.createOrder(userId, {
      asset_type: item.asset_type,
      symbol: item.symbol,
      side: 'sell',
      type: 'stop_loss',
      quantity,
      trigger_price: data.trigger_price,
    });
    return { success: true, stopLoss: toLegacy(order, item.id) };
  }

  static async getStopLossOrders(userId: string): Promise<{ success: true; stopLossOrders: StopLossOrder[] }> {
    const [{ orders }, items] = await Promise.all([
      OrderService.listOrders(userId, 'all', { type: 'stop_loss' }),
      pool.query('SELECT id, UPPER(symbol) AS symbol, asset_type FROM portfolio_items WHERE user_id = $1', [userId]),
    ]);
    const itemIds = new Map<string, string>(items.rows.map((r: any) => [`${r.asset_type}:${r.symbol}`, r.id]));
    return {
      success: true,
      stopLossOrders: orders.map((o) => toLegacy(o, itemIds.get(`${o.asset_type}:${o.symbol}`) ?? null)),
    };
  }

  static async cancelStopLoss(userId: string, stopLossId: string): Promise<{ success: boolean; message?: string }> {
    try {
      await OrderService.cancelOrder(userId, stopLossId, { type: 'stop_loss' });
      return { success: true, message: 'Stop-loss emri iptal edildi' };
    } catch (error) {
      if (error instanceof AppError && (error.status === 404 || error.status === 409)) {
        return { success: false, message: 'Stop-loss emri bulunamadı veya zaten aktif değil' };
      }
      throw error;
    }
  }

  /** @deprecated OrderService.processOrders kullanın (tüm emir tiplerini işler). */
  static async checkAndTriggerStopLosses(): Promise<void> {
    await OrderService.processOrders();
  }
}
