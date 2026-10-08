import { PoolClient } from 'pg';
import pool from '../config/database';
import { AppError } from '../utils/errors';
import { AssetType, toNumber } from '../types';
import { MIN_TRADE_TRY, OrderContext, TransactionService, computeBuyCost, normalizeQuantity } from './transaction';
import { ExecutionPrice, PricingService, PriceUnavailableError, priceKey } from './pricing';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'active' | 'filled' | 'cancelled' | 'expired' | 'failed';

export interface Order {
  id: string;
  user_id: string;
  asset_type: AssetType;
  symbol: string;
  name: string | null;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  trigger_price: number;
  status: OrderStatus;
  reserved_cash: number;
  filled_price: number | null;
  filled_quantity: number | null;
  filled_at: Date | null;
  transaction_id: string | null;
  fail_reason: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOrderRequest {
  asset_type: AssetType;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  trigger_price: number;
  /** Geçerlilik süresi (gün). Varsayılan: 30 */
  expires_in_days?: number;
}

/** Kullanıcı başına en fazla aktif emir */
export const MAX_ACTIVE_ORDERS = 20;
/** Varsayılan geçerlilik süresi (gün) */
export const DEFAULT_ORDER_EXPIRY_DAYS = 30;
/** Executor tek turda en fazla bu kadar adayı değerlendirir */
const MAX_CANDIDATES_PER_RUN = 2000;

const QUANTITY_EPSILON = 1e-8;

export const ORDER_LABELS: Record<`${OrderSide}:${OrderType}`, string> = {
  'buy:limit': 'Limit alış',
  'sell:limit': 'Limit satış',
  'sell:stop_loss': 'Zarar durdur',
  'sell:take_profit': 'Kâr al',
  // Desteklenmeyen kombinasyonlar (doğrulamada reddedilir)
  'buy:stop_loss': 'Zarar durdur',
  'buy:take_profit': 'Kâr al',
};

const orderLabel = (side: OrderSide, type: OrderType) => ORDER_LABELS[`${side}:${type}`];

const nullableNumber = (v: unknown) => (v === null || v === undefined ? null : toNumber(v));

export function mapOrderRow(row: any): Order {
  return {
    id: row.id,
    user_id: row.user_id,
    asset_type: row.asset_type,
    symbol: String(row.symbol).toUpperCase(),
    name: row.name ?? null,
    side: row.side,
    type: row.type,
    quantity: toNumber(row.quantity),
    trigger_price: toNumber(row.trigger_price),
    status: row.status,
    reserved_cash: toNumber(row.reserved_cash),
    filled_price: nullableNumber(row.filled_price),
    filled_quantity: nullableNumber(row.filled_quantity),
    filled_at: row.filled_at ?? null,
    transaction_id: row.transaction_id ?? null,
    fail_reason: row.fail_reason ?? null,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Tetikleme kuralı (fiyatlar TL / birim):
 *  - limit alış:  fiyat <= tetikleme
 *  - limit satış ve kâr al: fiyat >= tetikleme
 *  - zarar durdur: fiyat <= tetikleme
 */
export function shouldTrigger(order: { side: OrderSide; type: OrderType; trigger_price: number }, price: number): boolean {
  if (!(price > 0)) return false;
  if (order.type === 'stop_loss') return price <= order.trigger_price;
  if (order.type === 'take_profit') return price >= order.trigger_price;
  // limit
  return order.side === 'buy' ? price <= order.trigger_price : price >= order.trigger_price;
}

const rejected = (msg: string, code = 'ORDER_REJECTED') => new AppError(400, msg, code);

/** Emrin tetikleme fiyatı güncel fiyata göre anlamlı mı? Değilse kullanıcıya gösterilecek mesaj. */
export function validateTriggerAgainstPrice(side: OrderSide, type: OrderType, trigger: number, current: number): string | null {
  if (side === 'buy') {
    if (type !== 'limit') return 'Alış tarafında sadece limit emri verilebilir';
    return trigger < current ? null : 'Limit alış fiyatı güncel fiyatın altında olmalı';
  }
  switch (type) {
    case 'limit':
      return trigger > current ? null : 'Limit satış fiyatı güncel fiyatın üstünde olmalı';
    case 'take_profit':
      return trigger > current ? null : 'Kâr al fiyatı güncel fiyatın üstünde olmalı';
    case 'stop_loss':
      return trigger < current ? null : 'Zarar durdur fiyatı güncel fiyatın altında olmalı';
    default:
      return 'Geçersiz emir tipi';
  }
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Sonlandırılan emirde rezervi iade eder ve durumu günceller (çağıran users + orders satırlarını kilitlemiş olmalı). */
async function closeWithRefund(
  client: PoolClient,
  order: { id: string; user_id: string; reserved_cash: unknown },
  status: 'cancelled' | 'expired' | 'failed',
  reason: string
): Promise<number> {
  const refund = toNumber(order.reserved_cash);
  if (refund > 0) {
    await client.query(
      'UPDATE users SET balance = balance + $1, reserved_cash = GREATEST(reserved_cash - $1, 0) WHERE id = $2',
      [refund, order.user_id]
    );
  }
  await client.query(
    `UPDATE orders
        SET status = $2, reserved_cash = 0, fail_reason = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [order.id, status, reason.slice(0, 255)]
  );
  return refund;
}

function logActivity(userId: string, activity_type: string, description: string, metadata: Record<string, unknown>) {
  setImmediate(async () => {
    try {
      const { ActivityLogService } = await import('./activityLog');
      await ActivityLogService.createLog({ user_id: userId, activity_type, description, metadata });
    } catch (error: any) {
      console.error('[orders] Activity log error:', error?.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export class OrderService {
  /**
   * Yeni bekleyen emir.
   * - Limit alış: maliyet (tetikleme fiyatından, komisyon dahil) bakiyeden orders.reserved_cash'e taşınır.
   * - Satış tarafı: miktar eldeki miktarı aşamaz (gerçekleşirken tekrar eldeki miktara göre sınırlanır).
   * Kilit sırası (işlemlerle aynı): users → portfolio_items.
   */
  static async createOrder(userId: string, data: CreateOrderRequest): Promise<{ success: true; message: string; order: Order }> {
    const symbol = data.symbol.trim().toUpperCase();
    const { side, type } = data;
    if (side === 'buy' && type !== 'limit') {
      throw rejected('Alış tarafında sadece limit emri verilebilir');
    }
    const quantity = normalizeQuantity(data.quantity);
    if (!(quantity > 0)) {
      throw rejected('Miktar çok küçük');
    }
    const trigger = data.trigger_price;
    if (!(trigger > 0) || !Number.isFinite(trigger)) {
      throw rejected('Tetikleme fiyatı geçersiz');
    }

    // Güncel fiyat (varlığın varlığını da doğrular). Ağ çağrısı olabilir → transaction dışında.
    const quote = await PricingService.getExecutionPriceTRY(symbol, data.asset_type);
    const invalid = validateTriggerAgainstPrice(side, type, trigger, quote.priceTRY);
    if (invalid) {
      throw rejected(invalid, 'INVALID_TRIGGER');
    }
    if (quantity * trigger < MIN_TRADE_TRY) {
      throw rejected('Emir tutarı çok küçük');
    }

    const days = Math.min(365, Math.max(1, Math.trunc(data.expires_in_days ?? DEFAULT_ORDER_EXPIRY_DAYS)));

    const order = await inTransaction(async (client) => {
      const userRes = await client.query('SELECT id, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (userRes.rows.length === 0) {
        throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
      }

      const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1 AND status = 'active'`, [userId]);
      if (toNumber(countRes.rows[0]?.n) >= MAX_ACTIVE_ORDERS) {
        throw new AppError(409, `En fazla ${MAX_ACTIVE_ORDERS} aktif emriniz olabilir`, 'ORDER_LIMIT');
      }

      let name = quote.name;
      let reserved = 0;

      if (side === 'sell') {
        const itemRes = await client.query(
          `SELECT quantity, name FROM portfolio_items
            WHERE user_id = $1 AND UPPER(symbol) = $2 AND asset_type = $3
            FOR UPDATE`,
          [userId, symbol, data.asset_type]
        );
        const held = itemRes.rows[0] ? toNumber(itemRes.rows[0].quantity) : 0;
        if (!(held > 0)) {
          throw rejected('Portföyde bu varlık bulunamadı');
        }
        if (quantity > held + QUANTITY_EPSILON / 2) {
          throw rejected('Yetersiz miktar: emir miktarı eldeki miktarı aşamaz');
        }
        name = itemRes.rows[0].name || name;
      } else {
        reserved = computeBuyCost(quantity, trigger).netAmount;
        if (toNumber(userRes.rows[0].balance) < reserved) {
          throw rejected('Yetersiz bakiye');
        }
        const balRes = await client.query(
          'UPDATE users SET balance = balance - $1, reserved_cash = reserved_cash + $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
          [reserved, userId]
        );
        if (balRes.rowCount === 0) {
          throw rejected('Yetersiz bakiye');
        }
      }

      const ins = await client.query(
        `INSERT INTO orders (user_id, asset_type, symbol, name, side, type, quantity, trigger_price, status, reserved_cash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, CURRENT_TIMESTAMP + ($10::int * INTERVAL '1 day'))
         RETURNING *`,
        [userId, data.asset_type, symbol, name, side, type, quantity, trigger, reserved, days]
      );
      return mapOrderRow(ins.rows[0]);
    });

    return { success: true, message: 'Emir oluşturuldu', order };
  }

  static async listOrders(
    userId: string,
    view: 'active' | 'history' | 'all' = 'active',
    filter: { symbol?: string; asset_type?: AssetType; type?: OrderType } = {}
  ): Promise<{ success: true; orders: Order[] }> {
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];
    if (view === 'active') where.push(`status = 'active'`);
    if (view === 'history') where.push(`status <> 'active'`);
    if (filter.symbol) {
      params.push(filter.symbol.toUpperCase());
      where.push(`UPPER(symbol) = $${params.length}`);
    }
    if (filter.asset_type) {
      params.push(filter.asset_type);
      where.push(`asset_type = $${params.length}`);
    }
    if (filter.type) {
      params.push(filter.type);
      where.push(`type = $${params.length}`);
    }
    const order = view === 'history' ? 'COALESCE(filled_at, updated_at) DESC' : 'created_at DESC';
    const limit = view === 'active' ? 100 : 200;
    const result = await pool.query(
      `SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`,
      params
    );
    return { success: true, orders: result.rows.map(mapOrderRow) };
  }

  /** Kullanıcı iptali: rezerv (varsa) bakiyeye iade edilir. */
  static async cancelOrder(
    userId: string,
    orderId: string,
    opts: { type?: OrderType } = {}
  ): Promise<{ success: true; message: string; order: Order; refunded: number }> {
    return inTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const res = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2 ${opts.type ? 'AND type = $3' : ''} FOR UPDATE`,
        opts.type ? [orderId, userId, opts.type] : [orderId, userId]
      );
      const row = res.rows[0];
      if (!row) {
        throw new AppError(404, 'Emir bulunamadı', 'NOT_FOUND');
      }
      if (row.status !== 'active') {
        throw new AppError(409, 'Emir zaten aktif değil', 'ORDER_NOT_ACTIVE');
      }
      const refunded = await closeWithRefund(client, row, 'cancelled', 'Kullanıcı tarafından iptal edildi');
      const fresh = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return { success: true as const, message: 'Emir iptal edildi', order: mapOrderRow(fresh.rows[0]), refunded };
    });
  }

  // -------------------------------------------------------------------------
  // Executor (cron)
  // -------------------------------------------------------------------------

  /**
   * Her dakika: süresi dolanları kapatır, pozisyonu kalmayan satış emirlerini iptal eder,
   * taze fiyatlarla tetiklenen emirleri (her biri kendi transaction'ında) gerçekleştirir.
   * Eşzamanlı çalışmalarda aynı emir iki kez işlenmez (users kilidi + emir durumu kontrolü + SKIP LOCKED).
   */
  static async processOrders(): Promise<{ filled: number; expired: number; cancelled: number; failed: number }> {
    const stats = { filled: 0, expired: 0, cancelled: 0, failed: 0 };

    // 1) Süresi dolanlar
    const expiredRes = await pool.query(
      `SELECT id, user_id FROM orders
        WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at
        LIMIT ${MAX_CANDIDATES_PER_RUN}`
    );
    for (const r of expiredRes.rows) {
      try {
        if (await this.expireOne(r.id, r.user_id)) stats.expired += 1;
      } catch (error: any) {
        console.error(`[orders] Süre dolumu işlenemedi (${r.id}):`, error?.publicMessage || error?.message);
      }
    }

    // 2) Pozisyonu kalmayan satış emirleri (rezerv yok → iade gerekmez)
    const orphanRes = await pool.query(
      `UPDATE orders o
          SET status = 'cancelled', fail_reason = 'Pozisyon artık mevcut değil', updated_at = CURRENT_TIMESTAMP
        WHERE o.id IN (
          SELECT o2.id FROM orders o2
           WHERE o2.status = 'active' AND o2.side = 'sell'
             AND NOT EXISTS (
               SELECT 1 FROM portfolio_items pi
                WHERE pi.user_id = o2.user_id AND UPPER(pi.symbol) = UPPER(o2.symbol)
                  AND pi.asset_type = o2.asset_type AND pi.quantity > 0
             )
           FOR UPDATE SKIP LOCKED
        )
        RETURNING o.id`
    );
    stats.cancelled += orphanRes.rowCount ?? 0;

    // 3) Adaylar (kilitsiz okuma) + taze fiyatlar
    const candidates = await pool.query(
      `SELECT id, user_id, symbol, asset_type, side, type, trigger_price
         FROM orders
        WHERE status = 'active'
        ORDER BY created_at
        LIMIT ${MAX_CANDIDATES_PER_RUN}`
    );
    if (candidates.rows.length === 0) return stats;

    const keys = candidates.rows.map((r: any) => ({ symbol: String(r.symbol).toUpperCase(), asset_type: r.asset_type as AssetType }));
    const prices = await PricingService.getPricesTRY(keys, true);

    for (const cand of candidates.rows) {
      const current = prices.get(priceKey(cand.asset_type, String(cand.symbol)));
      const probe = { side: cand.side as OrderSide, type: cand.type as OrderType, trigger_price: toNumber(cand.trigger_price) };
      if (current === undefined || !shouldTrigger(probe, current)) continue;
      try {
        const outcome = await this.executeOne(cand.id, cand.user_id);
        if (outcome === 'filled') stats.filled += 1;
        else if (outcome === 'cancelled') stats.cancelled += 1;
        else if (outcome === 'expired') stats.expired += 1;
        else if (outcome === 'failed') stats.failed += 1;
      } catch (error: any) {
        console.error(`[orders] Emir işlenemedi (${cand.id}):`, error?.publicMessage || error?.message);
      }
    }

    if (stats.filled || stats.expired || stats.cancelled || stats.failed) {
      console.log(`[orders] Gerçekleşen: ${stats.filled}, süresi dolan: ${stats.expired}, iptal: ${stats.cancelled}, başarısız: ${stats.failed}`);
    }
    return stats;
  }

  /** Süresi dolmuş tek emri kapatır (rezerv iade). */
  static async expireOne(orderId: string, userId: string): Promise<boolean> {
    return inTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const res = await client.query(
        `SELECT * FROM orders
          WHERE id = $1 AND user_id = $2 AND status = 'active'
            AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
          FOR UPDATE SKIP LOCKED`,
        [orderId, userId]
      );
      if (!res.rows[0]) return false;
      await closeWithRefund(client, res.rows[0], 'expired', 'Emrin süresi doldu');
      return true;
    });
  }

  /**
   * Tek emri gerçekleştirmeyi dener. Kilit sırası: users → orders (SKIP LOCKED) → portfolio_items.
   * Dönüş: 'filled' | 'cancelled' | 'expired' | 'failed' | 'skipped'
   */
  static async executeOne(
    orderId: string,
    userId: string,
    opts: { quote?: ExecutionPrice } = {}
  ): Promise<'filled' | 'cancelled' | 'expired' | 'failed' | 'skipped'> {
    // Adayın sembolünü öğren ve fiyatı transaction DIŞINDA al (kilitleri kısa tut)
    const peek = await pool.query(`SELECT symbol, asset_type FROM orders WHERE id = $1 AND status = 'active'`, [orderId]);
    if (!peek.rows[0]) return 'skipped';

    let quote: ExecutionPrice;
    try {
      quote = opts.quote ?? (await PricingService.getExecutionPriceTRY(peek.rows[0].symbol, peek.rows[0].asset_type));
    } catch (error) {
      if (error instanceof PriceUnavailableError) return 'skipped'; // sonraki turda tekrar denenir
      throw error;
    }

    const client = await pool.connect();
    let postCommit: (() => void) | undefined;
    let outcome: 'filled' | 'cancelled' | 'expired' | 'failed' | 'skipped' = 'skipped';
    let failure: unknown;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      const orderRes = await client.query(
        `SELECT *, (expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP) AS is_expired
           FROM orders
          WHERE id = $1 AND user_id = $2 AND status = 'active'
          FOR UPDATE SKIP LOCKED`,
        [orderId, userId]
      );
      const row = orderRes.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return 'skipped'; // başka bir süreç işledi / işliyor veya artık aktif değil
      }

      if (row.is_expired) {
        await closeWithRefund(client, row, 'expired', 'Emrin süresi doldu');
        await client.query('COMMIT');
        return 'expired';
      }

      const order = mapOrderRow(row);
      if (!shouldTrigger(order, quote.priceTRY)) {
        await client.query('ROLLBACK');
        return 'skipped';
      }

      const ctx: OrderContext = {
        id: order.id,
        type: order.type,
        label: `${orderLabel(order.side, order.type)} emri gerçekleşti`,
      };

      let result;
      if (order.side === 'sell') {
        const holdingRes = await client.query(
          `SELECT quantity FROM portfolio_items
            WHERE user_id = $1 AND UPPER(symbol) = $2 AND asset_type = $3
            FOR UPDATE`,
          [userId, order.symbol, order.asset_type]
        );
        const held = holdingRes.rows[0] ? toNumber(holdingRes.rows[0].quantity) : 0;
        if (!(held > 0)) {
          await closeWithRefund(client, row, 'cancelled', 'Pozisyon artık mevcut değil');
          await client.query('COMMIT');
          return 'cancelled';
        }
        result = await TransactionService.sell(
          userId,
          { symbol: order.symbol, asset_type: order.asset_type, quantity: Math.min(order.quantity, held) },
          { client, quote, capToHolding: true, order: ctx }
        );
      } else {
        result = await TransactionService.buy(
          userId,
          { symbol: order.symbol, asset_type: order.asset_type, quantity: order.quantity },
          { client, quote, reservedCash: order.reserved_cash, order: ctx }
        );
      }
      postCommit = result.postCommit;

      await client.query(
        `UPDATE orders
            SET status = 'filled', reserved_cash = 0,
                filled_price = $2, filled_quantity = $3, filled_at = CURRENT_TIMESTAMP,
                transaction_id = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [orderId, result.transaction.price, result.transaction.quantity, result.transaction.id]
      );

      await client.query('COMMIT');
      outcome = 'filled';
      console.log(
        `[orders] Gerçekleşti: ${ctx.label} ${order.symbol} ${result.transaction.quantity} @ ${quote.priceTRY.toFixed(4)} TL`
      );
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      failure = error;
    } finally {
      // Bağlantı, olası failOne transaction'ından ÖNCE havuza iade edilir
      client.release();
    }

    if (failure !== undefined) {
      if (failure instanceof PriceUnavailableError) {
        return 'skipped'; // fiyat yok: emir aktif kalır, sonraki turda tekrar denenir
      }
      if (failure instanceof AppError && failure.status < 500) {
        // İş kuralı hatası (ör. tutar çok küçük): emri kapat (rezerv iade) ki her dakika tekrar denenmesin
        const reason = failure.publicMessage;
        const closed = await this.failOne(orderId, userId, reason);
        if (!closed) return 'skipped';
        logActivity(userId, 'order_failed', `Emir gerçekleştirilemedi: ${reason}`, { order_id: orderId, reason });
        return 'failed';
      }
      throw failure;
    }

    postCommit?.();
    return outcome;
  }

  private static async failOne(orderId: string, userId: string, reason: string): Promise<boolean> {
    return inTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const res = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE SKIP LOCKED`,
        [orderId, userId]
      );
      if (!res.rows[0]) return false;
      await closeWithRefund(client, res.rows[0], 'failed', reason);
      return true;
    });
  }
}
