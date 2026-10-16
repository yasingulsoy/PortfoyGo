import { PoolClient } from 'pg';
import pool from '../config/database';
import { AppError } from '../utils/errors';
import { AssetType, toNumber } from '../types';
import { COMMISSION_RATE, MIN_TRADE_TRY, OrderContext, TransactionService, computeBuyCost, normalizeQuantity } from './transaction';
import { ExecutionPrice, PricingService, PriceUnavailableError, priceKey } from './pricing';
import { NotificationService, formatTry } from './notifications';
import { marketClock, stockMarketState } from './marketHours';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'market_on_open';
export type OrderStatus = 'active' | 'filled' | 'cancelled' | 'expired' | 'failed';

export const ORDER_TYPES: readonly OrderType[] = ['limit', 'stop_loss', 'take_profit', 'trailing_stop', 'market_on_open'];

export interface Order {
  id: string;
  user_id: string;
  asset_type: AssetType;
  symbol: string;
  name: string | null;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /**
   * limit / zarar durdur / kâr al: tetikleme fiyatı.
   * trailing_stop: GÜNCEL tetikleme (zirveyle birlikte yukarı taşınır).
   * market_on_open: emir anındaki referans fiyat (bilgi amaçlı; tetikleme yok).
   */
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
  /** trailing_stop: yüzde mesafe (ör. 5 = %5) — trail_amount ile birlikte olmaz */
  trail_percent: number | null;
  /** trailing_stop: TL mesafe */
  trail_amount: number | null;
  /** trailing_stop: emir verildiğinden beri görülen en yüksek (taze) fiyat */
  high_water_price: number | null;
  high_water_at: Date | null;
  /** market_on_open: en erken gerçekleşme anı (seans açılışı) */
  execute_after: Date | null;
}

export interface CreateOrderRequest {
  asset_type: AssetType;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /** limit / stop_loss / take_profit için zorunlu; diğerlerinde yok sayılır */
  trigger_price?: number;
  /** trailing_stop: yüzde mesafe (TRAIL_PERCENT_MIN–MAX) — trail_amount ile birlikte verilemez */
  trail_percent?: number;
  /** trailing_stop: TL mesafe (güncel fiyattan küçük) */
  trail_amount?: number;
  /** Geçerlilik süresi (gün). Varsayılan: 30. market_on_open'da yok sayılır (seans kapanışında sona erer). */
  expires_in_days?: number;
}

export interface UpdateTrailingRequest {
  trail_percent?: number;
  trail_amount?: number;
}

/** Kullanıcı başına en fazla aktif emir */
export const MAX_ACTIVE_ORDERS = 20;
/** Varsayılan geçerlilik süresi (gün) */
export const DEFAULT_ORDER_EXPIRY_DAYS = 30;
/**
 * Açılışta alış (MOO) emrinde referans fiyata eklenen tampon: rezerv = maliyet(miktar, referans × 1.05).
 * Açılış fiyatı bu tamponu da aşarsa ayrılan tutarın karşıladığı kadar alınır (kısmi gerçekleşme),
 * hiç alınamıyorsa emir başarısız olur ve rezervin tamamı iade edilir. Serbest bakiyeye dokunulmaz.
 */
export const MOO_BUY_BUFFER = 0.05;
/** Takip eden stop yüzde sınırları */
export const TRAIL_PERCENT_MIN = 0.1;
export const TRAIL_PERCENT_MAX = 50;
/** Executor tek turda en fazla bu kadar adayı değerlendirir */
const MAX_CANDIDATES_PER_RUN = 2000;

const QUANTITY_EPSILON = 1e-8;

export const ORDER_LABELS: Record<`${OrderSide}:${OrderType}`, string> = {
  'buy:limit': 'Limit alış',
  'sell:limit': 'Limit satış',
  'sell:stop_loss': 'Zarar durdur',
  'sell:take_profit': 'Kâr al',
  'sell:trailing_stop': 'Takip eden stop',
  'buy:market_on_open': 'Açılışta alış',
  'sell:market_on_open': 'Açılışta satış',
  // Desteklenmeyen kombinasyonlar (doğrulamada reddedilir)
  'buy:stop_loss': 'Zarar durdur',
  'buy:take_profit': 'Kâr al',
  'buy:trailing_stop': 'Takip eden stop',
};

const orderLabel = (side: OrderSide, type: OrderType) => ORDER_LABELS[`${side}:${type}`] ?? type;

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
    trail_percent: nullableNumber(row.trail_percent),
    trail_amount: nullableNumber(row.trail_amount),
    high_water_price: nullableNumber(row.high_water_price),
    high_water_at: row.high_water_at ?? null,
    execute_after: row.execute_after ?? null,
  };
}

/**
 * Tetikleme kuralı (fiyatlar TL / birim; satış emirlerinde dövizin alış kuru):
 *  - limit alış:  fiyat <= tetikleme
 *  - limit satış ve kâr al: fiyat >= tetikleme
 *  - zarar durdur ve takip eden stop: fiyat <= tetikleme (takip edende güncel tetikleme)
 *  - açılışta (market_on_open): fiyat kuralı yok (zaman + seans; bkz. processOrders)
 */
export function shouldTrigger(order: { side: OrderSide; type: OrderType; trigger_price: number }, price: number): boolean {
  if (!(price > 0)) return false;
  if (order.type === 'market_on_open') return false;
  if (order.type === 'stop_loss' || order.type === 'trailing_stop') return price <= order.trigger_price;
  if (order.type === 'take_profit') return price >= order.trigger_price;
  // limit
  return order.side === 'buy' ? price <= order.trigger_price : price >= order.trigger_price;
}

/**
 * Takip eden stopun tetikleme fiyatı: zirve × (1 − %/100) ya da zirve − TL; 8 ondalığa aşağı yuvarlanır
 * (stop hiçbir zaman istenen seviyenin üstünde olmaz). processOrders'taki SQL ile aynı formül.
 */
export function trailingTrigger(highWater: number, trail: { percent?: number | null; amount?: number | null }): number {
  const raw = trail.percent != null ? highWater * (1 - trail.percent / 100) : highWater - (trail.amount ?? 0);
  return Math.floor(raw * 1e8 + 1e-6) / 1e8;
}

/** Ayrılan tutarın (komisyon dahil, kuruş yuvarlamasıyla) karşılayabildiği en büyük miktar. */
export function maxAffordableQuantity(budget: number, price: number): number {
  if (!(budget > 0) || !(price > 0)) return 0;
  // ceil2 yuvarlamaları için 3 kuruş pay; ardından kesin kontrol
  let q = normalizeQuantity(Math.max(0, budget - 0.03) / (price * (1 + COMMISSION_RATE)));
  for (let i = 0; i < 10 && q > 0 && computeBuyCost(q, price).netAmount > budget; i++) {
    q = normalizeQuantity(q * 0.999);
  }
  return q > 0 && computeBuyCost(q, price).netAmount <= budget ? q : 0;
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

/** Takip mesafesi doğrulaması; geçerliyse normalize edilmiş {percent, amount} (biri null). */
function parseTrail(input: { trail_percent?: number; trail_amount?: number }, highWater: number): { percent: number | null; amount: number | null } {
  const hasPct = input.trail_percent !== undefined && input.trail_percent !== null;
  const hasAmt = input.trail_amount !== undefined && input.trail_amount !== null;
  if (hasPct === hasAmt) {
    throw rejected('Takip mesafesini yüzde VEYA TL olarak girin', 'INVALID_TRAIL');
  }
  if (hasPct) {
    const pct = Number(input.trail_percent);
    if (!Number.isFinite(pct) || pct < TRAIL_PERCENT_MIN || pct > TRAIL_PERCENT_MAX) {
      throw rejected(`Takip yüzdesi %${TRAIL_PERCENT_MIN} ile %${TRAIL_PERCENT_MAX} arasında olmalı`, 'INVALID_TRAIL');
    }
    return { percent: Math.round(pct * 1e4) / 1e4, amount: null };
  }
  const amt = Number(input.trail_amount);
  if (!Number.isFinite(amt) || !(amt > 0)) {
    throw rejected('Takip tutarı 0’dan büyük olmalı', 'INVALID_TRAIL');
  }
  if (amt >= highWater) {
    throw rejected('Takip tutarı güncel fiyattan küçük olmalı', 'INVALID_TRAIL');
  }
  return { percent: null, amount: Math.round(amt * 1e8) / 1e8 };
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

const formatQty = (q: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(q);

type NotifyKind = 'filled' | 'moo_filled' | 'trailing_triggered' | 'expired' | 'failed' | 'cancelled_admin';

/**
 * Emir bildirimleri (kategori 'orders'). Çağıranın transaction client'ı ile yazılır: transaction geri
 * alınırsa bildirim de geri alınır; canlı yayın COMMIT sonrasında yapılır. Hata fırlatmaz.
 * Türler: order.filled · order.moo_filled (açılışta) · order.trailing_triggered (takip eden stop) ·
 * order.expired · order.failed · order.cancelled_admin
 */
async function notifyOrder(
  client: PoolClient,
  kind: NotifyKind,
  row: any,
  extra: { price?: number; quantity?: number; refund?: number; reason?: string } = {}
): Promise<void> {
  const order = mapOrderRow(row);
  const label = orderLabel(order.side, order.type).toLocaleLowerCase('tr-TR');
  const refundText = extra.refund && extra.refund > 0 ? ` ${formatTry(extra.refund)} bakiyenize iade edildi.` : '';
  const reason = extra.reason?.trim();
  const partial = extra.quantity !== undefined && extra.quantity + QUANTITY_EPSILON / 2 < order.quantity;
  let title: string;
  let body: string;
  switch (kind) {
    case 'filled':
      title = 'Emriniz gerçekleşti';
      body = `${order.symbol} ${label} emriniz ${formatTry(extra.price ?? order.trigger_price)} fiyattan gerçekleşti.`;
      break;
    case 'moo_filled':
      title = 'Açılış emriniz gerçekleşti';
      body = `${order.symbol} ${label} emriniz açılışta ${formatTry(extra.price ?? order.trigger_price)} fiyattan gerçekleşti.`;
      if (partial && order.side === 'buy') {
        body += ` Açılış fiyatı ayrılan tutarı aştığı için ${formatQty(extra.quantity!)} / ${formatQty(order.quantity)} adet alındı; artan tutar bakiyenize iade edildi.`;
      } else if (partial) {
        body += ` Elinizdeki ${formatQty(extra.quantity!)} adet satıldı.`;
      }
      break;
    case 'trailing_triggered':
      title = 'Takip eden stop tetiklendi';
      body =
        `${order.symbol} takip eden stop emriniz ${formatTry(extra.price ?? order.trigger_price)} fiyattan gerçekleşti` +
        (order.high_water_price ? ` (zirve ${formatTry(order.high_water_price)}).` : '.');
      break;
    case 'expired':
      title = 'Emrinizin süresi doldu';
      body = `${order.symbol} ${label} emrinizin süresi doldu.${refundText}`;
      break;
    case 'failed':
      title = 'Emriniz gerçekleştirilemedi';
      body = `${order.symbol} ${label} emriniz gerçekleştirilemedi${reason ? `: ${reason}` : '.'}${refundText}`;
      break;
    case 'cancelled_admin':
      title = 'Emriniz iptal edildi';
      body = `${order.symbol} ${label} emriniz yönetici tarafından iptal edildi${reason ? ` (${reason})` : ''}.${refundText}`;
      break;
  }
  await NotificationService.notify(
    order.user_id,
    {
      type: `order.${kind}`,
      category: 'orders',
      title,
      body,
      link: '/portfolio',
      data: {
        order_id: order.id,
        symbol: order.symbol,
        asset_type: order.asset_type,
        side: order.side,
        order_type: order.type,
        ...(extra.price !== undefined ? { price: extra.price } : {}),
        ...(extra.quantity !== undefined ? { quantity: extra.quantity } : {}),
        ...(partial ? { requested_quantity: order.quantity, partial: true } : {}),
        ...(order.type === 'trailing_stop' && order.high_water_price ? { high_water: order.high_water_price } : {}),
        ...(extra.refund ? { refunded: extra.refund } : {}),
        ...(reason ? { reason } : {}),
      },
    },
    client
  );
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
   * - Açılışta alış: maliyet (referans fiyat × (1 + MOO_BUY_BUFFER)) ayrılır.
   * - Satış tarafı: miktar eldeki miktarı aşamaz (gerçekleşirken tekrar eldeki miktara göre sınırlanır).
   * Kilit sırası (işlemlerle aynı): users → portfolio_items.
   */
  static async createOrder(userId: string, data: CreateOrderRequest): Promise<{ success: true; message: string; order: Order }> {
    const symbol = data.symbol.trim().toUpperCase();
    const { side, type } = data;
    if (side === 'buy' && type !== 'limit' && type !== 'market_on_open') {
      throw rejected('Alış tarafında sadece limit veya açılışta emri verilebilir');
    }
    const quantity = normalizeQuantity(data.quantity);
    if (!(quantity > 0)) {
      throw rejected('Miktar çok küçük');
    }

    let trigger: number;
    let quote: ExecutionPrice;
    let trail: { percent: number | null; amount: number | null } | null = null;
    let highWater: number | null = null;
    let executeAfter: Date | null = null;
    let expiresAt: Date | null = null;
    let reserveUnitPrice: number | null = null;

    // Güncel fiyat (varlığın varlığını da doğrular). Ağ çağrısı olabilir → transaction dışında.
    // Satış emirleri satış tarafı fiyatıyla (dövizde alış kuru) karşılaştırılır.
    if (type === 'market_on_open') {
      if (data.asset_type !== 'stock') {
        throw rejected('Açılışta emri yalnızca ABD hisseleri için verilebilir', 'INVALID_ORDER_TYPE');
      }
      const state = stockMarketState();
      if (state.open) {
        throw new AppError(409, 'Piyasa açık: emri piyasa fiyatından verebilirsiniz', 'MARKET_OPEN');
      }
      quote = await PricingService.getExecutionPriceTRY(symbol, data.asset_type, side);
      trigger = quote.priceTRY;
      executeAfter = state.session.next_open_at;
      // O seans içinde gerçekleşemezse (ör. fiyat verisi yok) kapanışta süresi dolar, rezerv iade edilir
      expiresAt = state.session.next_close_at;
      if (side === 'buy') reserveUnitPrice = trigger * (1 + MOO_BUY_BUFFER);
    } else if (type === 'trailing_stop') {
      if (side !== 'sell') {
        throw rejected('Takip eden stop yalnızca satış emri olabilir');
      }
      quote = await PricingService.getExecutionPriceTRY(symbol, data.asset_type, 'sell');
      highWater = quote.priceTRY;
      trail = parseTrail(data, highWater);
      trigger = trailingTrigger(highWater, trail);
      if (!(trigger > 0) || trigger >= quote.priceTRY) {
        throw rejected('Takip mesafesi geçersiz', 'INVALID_TRIGGER');
      }
    } else {
      trigger = Number(data.trigger_price);
      if (!(trigger > 0) || !Number.isFinite(trigger)) {
        throw rejected('Tetikleme fiyatı geçersiz');
      }
      quote = await PricingService.getExecutionPriceTRY(symbol, data.asset_type, side);
      const invalid = validateTriggerAgainstPrice(side, type, trigger, quote.priceTRY);
      if (invalid) {
        throw rejected(invalid, 'INVALID_TRIGGER');
      }
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
        reserved = computeBuyCost(quantity, reserveUnitPrice ?? trigger).netAmount;
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
        `INSERT INTO orders (user_id, asset_type, symbol, name, side, type, quantity, trigger_price, status, reserved_cash, expires_at,
                             trail_percent, trail_amount, high_water_price, high_water_at, execute_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9,
                 COALESCE($11::timestamptz, CURRENT_TIMESTAMP + ($10::int * INTERVAL '1 day')),
                 $12, $13, $14::numeric, CASE WHEN $14::numeric IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, $15::timestamptz)
         RETURNING *`,
        [
          userId,
          data.asset_type,
          symbol,
          name,
          side,
          type,
          quantity,
          trigger,
          reserved,
          days,
          expiresAt ? expiresAt.toISOString() : null,
          trail?.percent ?? null,
          trail?.amount ?? null,
          highWater,
          executeAfter ? executeAfter.toISOString() : null,
        ]
      );
      return mapOrderRow(ins.rows[0]);
    });

    return {
      success: true,
      message: type === 'market_on_open' ? 'Emir açılışta gerçekleşmek üzere sıraya alındı' : 'Emir oluşturuldu',
      order,
    };
  }

  /**
   * Takip eden stopun mesafesini değiştirir (zirve korunur; tetikleme yeniden hesaplanır).
   * Yeni tetikleme güncel fiyatın altında olmalı (aksi halde emir hemen tetiklenirdi).
   */
  static async updateTrailingOrder(
    userId: string,
    orderId: string,
    data: UpdateTrailingRequest
  ): Promise<{ success: true; message: string; order: Order }> {
    const peek = await pool.query(`SELECT symbol, asset_type, type, status FROM orders WHERE id = $1 AND user_id = $2`, [orderId, userId]);
    const p = peek.rows[0];
    if (!p) throw new AppError(404, 'Emir bulunamadı', 'NOT_FOUND');
    if (p.type !== 'trailing_stop') throw rejected('Yalnızca takip eden stop emirleri düzenlenebilir', 'NOT_EDITABLE');
    if (p.status !== 'active') throw new AppError(409, 'Emir zaten aktif değil', 'ORDER_NOT_ACTIVE');

    const quote = await PricingService.getExecutionPriceTRY(p.symbol, p.asset_type, 'sell');

    const order = await inTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const res = await client.query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`, [orderId, userId]);
      const row = res.rows[0];
      if (!row) throw new AppError(404, 'Emir bulunamadı', 'NOT_FOUND');
      if (row.status !== 'active') throw new AppError(409, 'Emir zaten aktif değil', 'ORDER_NOT_ACTIVE');
      const current = mapOrderRow(row);
      const highWater = current.high_water_price ?? quote.priceTRY;
      const trail = parseTrail(data, highWater);
      const trigger = trailingTrigger(highWater, trail);
      if (!(trigger > 0) || trigger >= quote.priceTRY) {
        throw rejected('Yeni tetikleme fiyatı güncel fiyatın altında olmalı', 'INVALID_TRIGGER');
      }
      if (current.quantity * trigger < MIN_TRADE_TRY) {
        throw rejected('Emir tutarı çok küçük');
      }
      const upd = await client.query(
        `UPDATE orders
            SET trail_percent = $2, trail_amount = $3, trigger_price = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *`,
        [orderId, trail.percent, trail.amount, trigger]
      );
      return mapOrderRow(upd.rows[0]);
    });
    return { success: true, message: 'Emir güncellendi', order };
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
    opts: { type?: OrderType; reason?: string; byAdmin?: boolean; adminReason?: string } = {}
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
      const refunded = await closeWithRefund(client, row, 'cancelled', opts.reason ?? 'Kullanıcı tarafından iptal edildi');
      if (opts.byAdmin) {
        await notifyOrder(client, 'cancelled_admin', row, { refund: refunded, reason: opts.adminReason });
      }
      const fresh = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return { success: true as const, message: 'Emir iptal edildi', order: mapOrderRow(fresh.rows[0]), refunded };
    });
  }

  /**
   * Yönetici iptali: kullanıcı iptaliyle aynı kilitleme + rezerv iadesi (users → orders).
   * fail_reason: 'Yönetici tarafından iptal: <neden>' (neden yoksa 'Yönetici tarafından iptal edildi').
   */
  static async cancelOrderAsAdmin(
    orderId: string,
    reason?: string | null
  ): Promise<{ success: true; message: string; order: Order; refunded: number }> {
    const peek = await pool.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);
    if (!peek.rows[0]) {
      throw new AppError(404, 'Emir bulunamadı', 'NOT_FOUND');
    }
    const text = reason?.trim();
    return this.cancelOrder(peek.rows[0].user_id, orderId, {
      reason: text ? `Yönetici tarafından iptal: ${text}` : 'Yönetici tarafından iptal edildi',
      byAdmin: true,
      adminReason: text || undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Executor (cron)
  // -------------------------------------------------------------------------

  /**
   * Her dakika: süresi dolanları kapatır, pozisyonu kalmayan satış emirlerini iptal eder,
   * takip eden stopların zirvesini taze fiyatla yukarı taşır ve tetiklenen / zamanı gelen emirleri
   * (her biri kendi transaction'ında) gerçekleştirir.
   * - Yalnızca TAZE fiyatlar kullanılır (bayat/eksik fiyatta ne tetikleme ne zirve güncellemesi olur).
   * - Hisse emirleri yalnızca ABD seansı açıkken ve fiyat seans açıldıktan SONRA alınmışsa işlenir.
   * - İdempotent: aynı fiyatlarla tekrar çalıştırmak hiçbir şeyi değiştirmez; eşzamanlı çalışmalarda
   *   aynı emir iki kez işlenmez (users kilidi + emir durumu kontrolü + SKIP LOCKED; zirve güncellemesi
   *   tek ifadeli ve monotondur).
   */
  static async processOrders(): Promise<{ filled: number; expired: number; cancelled: number; failed: number; trailed: number }> {
    const stats = { filled: 0, expired: 0, cancelled: 0, failed: 0, trailed: 0 };
    const now = marketClock.now();
    const nowIso = now.toISOString();

    // 1) Süresi dolanlar
    const expiredRes = await pool.query(
      `SELECT id, user_id FROM orders
        WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= $1::timestamptz
        ORDER BY expires_at
        LIMIT ${MAX_CANDIDATES_PER_RUN}`,
      [nowIso]
    );
    for (const r of expiredRes.rows) {
      try {
        if (await this.expireOne(r.id, r.user_id, now)) stats.expired += 1;
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
      `SELECT id, user_id, symbol, asset_type, side, type, trigger_price, high_water_price,
              (execute_after IS NULL OR execute_after <= $1::timestamptz) AS due
         FROM orders
        WHERE status = 'active'
        ORDER BY created_at
        LIMIT ${MAX_CANDIDATES_PER_RUN}`,
      [nowIso]
    );
    if (candidates.rows.length === 0) return stats;

    const keys = candidates.rows.map((r: any) => ({ symbol: String(r.symbol).toUpperCase(), asset_type: r.asset_type as AssetType }));
    const buyPrices = await PricingService.getPricesTRY(keys, true, 'buy');
    // Dövizde satış emirleri alış kuruyla (kullanıcının satabileceği fiyat) değerlendirilir
    const currencyKeys = keys.filter((k) => k.asset_type === 'currency');
    const sellPrices = currencyKeys.length > 0 ? await PricingService.getPricesTRY(currencyKeys, true, 'sell') : buyPrices;
    const priceFor = (r: any): number | undefined => {
      const key = priceKey(r.asset_type, String(r.symbol));
      return r.side === 'sell' && r.asset_type === 'currency' ? sellPrices.get(key) : buyPrices.get(key);
    };

    // ABD seansı: kapalıyken hisse emirleri bekler; açıkken yalnızca açılıştan sonra alınmış fiyatlar geçerli
    const market = stockMarketState(now);
    let sessionStocks: Set<string> | null = null;
    if (market.enforced) {
      const stockSymbols = keys.filter((k) => k.asset_type === 'stock').map((k) => k.symbol);
      sessionStocks =
        market.open && market.session.session_open_at && stockSymbols.length > 0
          ? await PricingService.getStocksQuotedSince(stockSymbols, market.session.session_open_at)
          : new Set();
    }

    for (const cand of candidates.rows) {
      const current = priceFor(cand);
      if (current === undefined || !(current > 0)) continue; // fiyat yok / bayat → dokunma
      const sym = String(cand.symbol).toUpperCase();
      if (cand.asset_type === 'stock' && sessionStocks && !sessionStocks.has(sym)) continue;

      let ready: boolean;
      if (cand.type === 'market_on_open') {
        ready = cand.due === true;
      } else if (cand.type === 'trailing_stop') {
        let trigger = toNumber(cand.trigger_price);
        if (current > toNumber(cand.high_water_price)) {
          try {
            const raised = await this.raiseHighWater(cand.id, current);
            if (raised !== null) {
              trigger = raised;
              stats.trailed += 1;
            }
          } catch (error: any) {
            console.error(`[orders] Takip eden stop güncellenemedi (${cand.id}):`, error?.message);
            continue;
          }
        }
        ready = current <= trigger;
      } else {
        ready = shouldTrigger({ side: cand.side as OrderSide, type: cand.type as OrderType, trigger_price: toNumber(cand.trigger_price) }, current);
      }
      if (!ready) continue;

      try {
        const outcome = await this.executeOne(cand.id, cand.user_id, { now });
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

  /**
   * Takip eden stopun zirvesini yükseltir (monoton, tek ifade; eşzamanlı çalışmalarda güvenli).
   * Tetikleme, emrin GÜNCEL mesafe parametreleriyle SQL'de hesaplanır (trailingTrigger ile aynı formül).
   * Dönüş: yeni tetikleme fiyatı; zirve zaten bu fiyattan yüksek/eşitse null.
   */
  static async raiseHighWater(orderId: string, price: number): Promise<number | null> {
    const res = await pool.query(
      `UPDATE orders
          SET high_water_price = $2::numeric,
              high_water_at = CURRENT_TIMESTAMP,
              trigger_price = CASE WHEN trail_percent IS NOT NULL
                                   THEN TRUNC($2::numeric * (1 - trail_percent / 100), 8)
                                   ELSE TRUNC($2::numeric - trail_amount, 8) END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'active' AND type = 'trailing_stop' AND high_water_price < $2::numeric
        RETURNING trigger_price`,
      [orderId, price]
    );
    return res.rows[0] ? toNumber(res.rows[0].trigger_price) : null;
  }

  /** Süresi dolmuş tek emri kapatır (rezerv iade). */
  static async expireOne(orderId: string, userId: string, now: Date = marketClock.now()): Promise<boolean> {
    return inTransaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const res = await client.query(
        `SELECT * FROM orders
          WHERE id = $1 AND user_id = $2 AND status = 'active'
            AND expires_at IS NOT NULL AND expires_at <= $3::timestamptz
          FOR UPDATE SKIP LOCKED`,
        [orderId, userId, now.toISOString()]
      );
      if (!res.rows[0]) return false;
      const refund = await closeWithRefund(client, res.rows[0], 'expired', 'Emrin süresi doldu');
      await notifyOrder(client, 'expired', res.rows[0], { refund });
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
    opts: { quote?: ExecutionPrice; now?: Date } = {}
  ): Promise<'filled' | 'cancelled' | 'expired' | 'failed' | 'skipped'> {
    const now = opts.now ?? marketClock.now();
    // Adayın sembolünü öğren ve fiyatı transaction DIŞINDA al (kilitleri kısa tut)
    const peek = await pool.query(`SELECT symbol, asset_type, side FROM orders WHERE id = $1 AND status = 'active'`, [orderId]);
    if (!peek.rows[0]) return 'skipped';
    const peekSymbol = String(peek.rows[0].symbol).toUpperCase();
    const peekType = peek.rows[0].asset_type as AssetType;

    let quote: ExecutionPrice;
    try {
      quote = opts.quote ?? (await PricingService.getExecutionPriceTRY(peekSymbol, peekType, peek.rows[0].side === 'sell' ? 'sell' : 'buy'));
    } catch (error) {
      if (error instanceof PriceUnavailableError) return 'skipped'; // sonraki turda tekrar denenir
      throw error;
    }

    // Hisse: yalnızca seans açıkken ve açılıştan sonra alınmış fiyatla (önceki kapanışla tetikleme yok)
    if (peekType === 'stock') {
      const market = stockMarketState(now);
      if (market.enforced) {
        if (!market.open || !market.session.session_open_at) return 'skipped';
        const fresh = await PricingService.getStocksQuotedSince([peekSymbol], market.session.session_open_at);
        if (!fresh.has(peekSymbol)) return 'skipped';
      }
    }

    const client = await pool.connect();
    let postCommit: (() => void) | undefined;
    let outcome: 'filled' | 'cancelled' | 'expired' | 'failed' | 'skipped' = 'skipped';
    let failure: unknown;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      const orderRes = await client.query(
        `SELECT *, (expires_at IS NOT NULL AND expires_at <= $3::timestamptz) AS is_expired,
                   (execute_after IS NULL OR execute_after <= $3::timestamptz) AS is_due
           FROM orders
          WHERE id = $1 AND user_id = $2 AND status = 'active'
          FOR UPDATE SKIP LOCKED`,
        [orderId, userId, now.toISOString()]
      );
      const row = orderRes.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return 'skipped'; // başka bir süreç işledi / işliyor veya artık aktif değil
      }

      if (row.is_expired) {
        const refund = await closeWithRefund(client, row, 'expired', 'Emrin süresi doldu');
        await notifyOrder(client, 'expired', row, { refund });
        await client.query('COMMIT');
        return 'expired';
      }

      const order = mapOrderRow(row);
      const ready = order.type === 'market_on_open' ? row.is_due === true : shouldTrigger(order, quote.priceTRY);
      if (!ready) {
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
        let quantity = order.quantity;
        if (order.type === 'market_on_open') {
          // Açılış fiyatı tamponu aştıysa: yalnızca ayrılan tutarın karşıladığı kadar (serbest bakiyeye dokunulmaz)
          const affordable = maxAffordableQuantity(order.reserved_cash, quote.priceTRY);
          if (affordable + QUANTITY_EPSILON / 2 < quantity) quantity = affordable;
          if (!(quantity > 0) || quantity * quote.priceTRY < MIN_TRADE_TRY) {
            throw new AppError(400, 'Açılış fiyatı ayrılan tutarı aştı; alınabilecek miktar kalmadı', 'MOO_UNAFFORDABLE');
          }
        }
        result = await TransactionService.buy(
          userId,
          { symbol: order.symbol, asset_type: order.asset_type, quantity },
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
      const kind: NotifyKind =
        order.type === 'market_on_open' ? 'moo_filled' : order.type === 'trailing_stop' ? 'trailing_triggered' : 'filled';
      await notifyOrder(client, kind, row, {
        price: toNumber(result.transaction.price),
        quantity: toNumber(result.transaction.quantity),
      });

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
      const refund = await closeWithRefund(client, res.rows[0], 'failed', reason);
      await notifyOrder(client, 'failed', res.rows[0], { refund, reason });
      return true;
    });
  }
}
