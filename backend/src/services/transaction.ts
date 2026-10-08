import { PoolClient } from 'pg';
import pool from '../config/database';
import { AssetType, PortfolioItem, Transaction, mapPortfolioRow, mapTransactionRow, toNumber } from '../types';
import { AppError } from '../utils/errors';
import { ExecutionPrice, PricingService } from './pricing';

export const COMMISSION_RATE = 0.0025; // %0.25 komisyon
/** Bu miktarın altındaki kalan pozisyon "sıfır" kabul edilir (NUMERIC(20,8) çözünürlüğü) */
const QUANTITY_EPSILON = 1e-8;
/** En küçük işlem tutarı (TL) */
const MIN_TRADE_TRY = 0.01;

export interface BuyRequest {
  symbol: string;
  asset_type: AssetType;
  quantity: number;
}

export interface SellRequest {
  symbol: string;
  /** Opsiyonel (geriye dönük uyumluluk): yoksa sembolle eşleşen TEK varlık kullanılır */
  asset_type?: AssetType;
  quantity: number;
}

export interface TradeResult {
  success: true;
  message: string;
  transaction: Transaction;
  portfolioItem?: PortfolioItem;
  executedPrice: number;
  /**
   * opts.client ile çağrıldığında aktivite logu/rozet kontrolü otomatik yapılmaz;
   * çağıran COMMIT'ten sonra bunu çağırmalıdır.
   */
  postCommit?: () => void;
}

/** Bekleyen emirden (orders) tetiklenen işlemler için bağlam (aktivite logu / metadata). */
export interface OrderContext {
  id: string;
  type: 'limit' | 'stop_loss' | 'take_profit';
  /** Örn. "Limit alış emri gerçekleşti" */
  label: string;
}

export interface SellOptions {
  /** Var olan bir transaction içinde çalış (BEGIN/COMMIT çağıran sorumludur) */
  client?: PoolClient;
  /** Önceden hesaplanmış işlem fiyatı (örn. stop-loss) */
  quote?: ExecutionPrice;
  /** İstenen miktar eldekinden fazlaysa eldeki miktara indir */
  capToHolding?: boolean;
  /** Aktivite logu açıklaması için kaynak */
  source?: 'user' | 'stop_loss';
  /** Bekleyen emirden tetiklendiyse */
  order?: OrderContext;
}

export interface BuyOptions {
  /** Var olan bir transaction içinde çalış (BEGIN/COMMIT çağıran sorumludur) */
  client?: PoolClient;
  /** Önceden hesaplanmış işlem fiyatı */
  quote?: ExecutionPrice;
  /**
   * Önceden bakiyeden ayrılmış (rezerve) tutar — limit alış emri.
   * Verilirse bakiye kontrol edilmez/düşülmez; maliyet bu tutardan karşılanır ve
   * kullanılmayan kısım bakiyeye iade edilir. Maliyet bu tutarı aşarsa işlem reddedilir.
   */
  reservedCash?: number;
  /** Bekleyen emirden tetiklendiyse */
  order?: OrderContext;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
const floor2 = (n: number) => Math.floor(n * 100 + 1e-7) / 100;
/** Miktarı 8 ondalığa (DB hassasiyeti) aşağı yuvarla */
const floorQty = (n: number) => Math.floor(n * 1e8 + 1e-6) / 1e8;

export { floorQty as normalizeQuantity, MIN_TRADE_TRY };

/**
 * Alış maliyeti (TL): brüt tutar, komisyon ve toplam (net) tutar.
 * Fiyata göre monoton artandır: fiyat <= p ise maliyet <= computeBuyCost(q, p).netAmount
 * (limit alış rezervi bu fonksiyonla tetikleme fiyatından hesaplanır).
 */
export function computeBuyCost(quantity: number, price: number): { totalAmount: number; commission: number; netAmount: number } {
  const totalAmount = ceil2(quantity * price);
  const commission = ceil2(totalAmount * COMMISSION_RATE);
  return { totalAmount, commission, netAmount: round2(totalAmount + commission) };
}

const insufficient = (msg: string) => new AppError(400, msg, 'TRADE_REJECTED');

async function withTransaction<T>(existing: PoolClient | undefined, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (existing) {
    return fn(existing);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* yut */
    }
    throw err;
  } finally {
    client.release();
  }
}

function afterCommit(userId: string, log: { activity_type: 'buy' | 'sell'; description: string; metadata: Record<string, unknown> }) {
  setImmediate(async () => {
    try {
      const { ActivityLogService } = await import('./activityLog');
      await ActivityLogService.createLog({ user_id: userId, ...log });
    } catch (error: any) {
      console.error('[trade] Activity log error:', error?.message);
    }
    try {
      const { BadgeService } = await import('./badges');
      await BadgeService.checkAndAwardBadges(userId);
    } catch (error: any) {
      console.error('[trade] Badge check error:', error?.message);
    }
  });
}

export class TransactionService {
  /**
   * Alış. Fiyat SUNUCU tarafından belirlenir (istemcinin gönderdiği fiyat/isim yok sayılır).
   * Kullanıcı satırı ve portföy satırı FOR UPDATE ile kilitlenir; tek transaction.
   * opts.client verilirse çağıranın transaction'ı içinde çalışır (limit alış emri).
   */
  static async buy(userId: string, data: BuyRequest, opts: BuyOptions = {}): Promise<TradeResult> {
    const symbol = data.symbol.trim().toUpperCase();
    const quantity = floorQty(data.quantity);
    if (!(quantity > 0)) {
      throw insufficient('Miktar çok küçük');
    }

    // Fiyatı transaction dışında al (ağ çağrısı olabilir); kilitleri kısa tut
    const quote = opts.quote ?? (await PricingService.getExecutionPriceTRY(symbol, data.asset_type));
    const price = quote.priceTRY;

    const { totalAmount, commission, netAmount } = computeBuyCost(quantity, price);
    if (totalAmount < MIN_TRADE_TRY) {
      throw insufficient('İşlem tutarı çok küçük');
    }
    const reserved = opts.reservedCash;
    if (reserved !== undefined && netAmount > reserved + 1e-9) {
      throw insufficient('Ayrılan tutar işlem maliyetini karşılamıyor');
    }

    const { transaction, portfolioItem } = await withTransaction(opts.client, async (client) => {
      const userRes = await client.query('SELECT id, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (userRes.rows.length === 0) {
        throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
      }
      if (reserved === undefined && toNumber(userRes.rows[0].balance) < netAmount) {
        throw insufficient('Yetersiz bakiye');
      }

      // Mevcut pozisyonu kilitle (varsa)
      await client.query(
        `SELECT id FROM portfolio_items WHERE user_id = $1 AND UPPER(symbol) = $2 AND asset_type = $3 FOR UPDATE`,
        [userId, symbol, data.asset_type]
      );

      const txRes = await client.query(
        `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
         VALUES ($1, 'buy', $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userId, symbol, quote.name, data.asset_type, quantity, price, totalAmount, commission, netAmount]
      );

      if (reserved === undefined) {
        const balRes = await client.query(
          'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
          [netAmount, userId]
        );
        if (balRes.rowCount === 0) {
          throw insufficient('Yetersiz bakiye');
        }
      } else {
        // Maliyet rezervden karşılandı; kullanılmayan kısmı iade et
        const refund = Math.max(round2(reserved - netAmount), 0);
        await client.query(
          'UPDATE users SET balance = balance + $1, reserved_cash = GREATEST(reserved_cash - $2, 0) WHERE id = $3',
          [refund, reserved, userId]
        );
      }

      // Pozisyonu oluştur veya göreli güncelle (ortalama maliyet = toplam maliyet / toplam miktar)
      const itemRes = await client.query(
        `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (user_id, symbol, asset_type) DO UPDATE SET
           average_price = (portfolio_items.average_price * portfolio_items.quantity + $7)
                           / (portfolio_items.quantity + EXCLUDED.quantity),
           quantity      = portfolio_items.quantity + EXCLUDED.quantity,
           current_price = EXCLUDED.current_price,
           name          = EXCLUDED.name,
           updated_at    = CURRENT_TIMESTAMP
         RETURNING id`,
        [userId, symbol, quote.name, data.asset_type, quantity, price, totalAmount]
      );

      await this.recalculateUserPortfolio(userId, client);

      const fresh = await client.query('SELECT * FROM portfolio_items WHERE id = $1', [itemRes.rows[0].id]);
      return {
        transaction: mapTransactionRow(txRes.rows[0]),
        portfolioItem: fresh.rows[0] ? mapPortfolioRow(fresh.rows[0]) : undefined,
      };
    });

    const logEntry = {
      activity_type: 'buy' as const,
      description: opts.order
        ? `${opts.order.label}: ${quantity} adet ${quote.name} (${symbol}) alındı`
        : `${quantity} adet ${quote.name} (${symbol}) alındı`,
      metadata: {
        symbol,
        name: quote.name,
        asset_type: data.asset_type,
        quantity,
        price,
        total_amount: totalAmount,
        commission,
        net_amount: netAmount,
        transaction_id: transaction.id,
        ...(opts.order ? { source: 'order', order_id: opts.order.id, order_type: opts.order.type } : {}),
      },
    };

    const response: TradeResult = {
      success: true,
      message: 'Alış işlemi başarılı',
      transaction,
      portfolioItem,
      executedPrice: transaction.price,
    };

    if (opts.client) {
      // Çağıranın transaction'ı henüz commit edilmedi
      response.postCommit = () => afterCommit(userId, logEntry);
    } else {
      afterCommit(userId, logEntry);
    }
    return response;
  }

  /**
   * Satış. Fiyat SUNUCU tarafından belirlenir.
   * opts.client verilirse çağıranın transaction'ı içinde çalışır (stop-loss).
   */
  static async sell(userId: string, data: SellRequest, opts: SellOptions = {}): Promise<TradeResult> {
    const symbol = data.symbol.trim().toUpperCase();
    let requestedQty = floorQty(data.quantity);
    if (!(requestedQty > 0)) {
      throw insufficient('Miktar çok küçük');
    }

    // asset_type verilmemişse (eski istemciler) sembolle eşleşen tek varlığı bul
    let assetType = data.asset_type;
    if (!assetType) {
      const q = opts.client ?? pool;
      const matches = await q.query(
        'SELECT DISTINCT asset_type FROM portfolio_items WHERE user_id = $1 AND UPPER(symbol) = $2',
        [userId, symbol]
      );
      if (matches.rows.length === 0) {
        throw insufficient('Portföyde bu varlık bulunamadı');
      }
      if (matches.rows.length > 1) {
        throw new AppError(400, 'Bu sembol için birden fazla varlık var; asset_type belirtin', 'ASSET_TYPE_REQUIRED');
      }
      assetType = matches.rows[0].asset_type as AssetType;
    }
    const resolvedType: AssetType = assetType;

    const quote = opts.quote ?? (await PricingService.getExecutionPriceTRY(symbol, resolvedType));
    const price = quote.priceTRY;

    const result = await withTransaction(opts.client, async (client) => {
      const userRes = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (userRes.rows.length === 0) {
        throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
      }

      const itemRes = await client.query(
        `SELECT * FROM portfolio_items
          WHERE user_id = $1 AND UPPER(symbol) = $2 AND asset_type = $3
          FOR UPDATE`,
        [userId, symbol, resolvedType]
      );
      if (itemRes.rows.length === 0) {
        throw insufficient('Portföyde bu varlık bulunamadı');
      }
      const item = itemRes.rows[0];
      const held = toNumber(item.quantity);

      if (requestedQty > held + QUANTITY_EPSILON / 2) {
        if (opts.capToHolding) {
          requestedQty = held;
        } else {
          throw insufficient('Yetersiz miktar');
        }
      }
      const quantity = Math.min(requestedQty, held);
      if (!(quantity > 0)) {
        throw insufficient('Yetersiz miktar');
      }

      const totalAmount = floor2(quantity * price);
      if (totalAmount < MIN_TRADE_TRY) {
        throw insufficient('İşlem tutarı çok küçük');
      }
      const commission = ceil2(totalAmount * COMMISSION_RATE);
      const netAmount = round2(totalAmount - commission);

      const txRes = await client.query(
        `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
         VALUES ($1, 'sell', $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userId, item.symbol, item.name, item.asset_type, quantity, price, totalAmount, commission, netAmount]
      );

      await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [netAmount, userId]);

      let portfolioItem: PortfolioItem | undefined;
      if (held - quantity < QUANTITY_EPSILON) {
        // Pozisyon kapandı (stop_loss_orders FK ON DELETE CASCADE ile ilgili emirler de silinir)
        await client.query('DELETE FROM portfolio_items WHERE id = $1', [item.id]);
      } else {
        const upd = await client.query(
          `UPDATE portfolio_items
              SET quantity = quantity - $1, current_price = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *`,
          [quantity, price, item.id]
        );
        portfolioItem = upd.rows[0] ? mapPortfolioRow(upd.rows[0]) : undefined;
      }

      await this.recalculateUserPortfolio(userId, client);

      if (portfolioItem) {
        const fresh = await client.query('SELECT * FROM portfolio_items WHERE id = $1', [portfolioItem.id]);
        portfolioItem = fresh.rows[0] ? mapPortfolioRow(fresh.rows[0]) : portfolioItem;
      }

      return { transaction: mapTransactionRow(txRes.rows[0]), portfolioItem, item, quantity, totalAmount, commission, netAmount };
    });

    const { transaction, portfolioItem, item, quantity, totalAmount, commission, netAmount } = result;
    const logEntry = {
      activity_type: 'sell' as const,
      description: opts.order
        ? `${opts.order.label}: ${quantity} adet ${item.name} (${item.symbol}) satıldı`
        : opts.source === 'stop_loss'
          ? `Stop-loss tetiklendi: ${quantity} adet ${item.name} (${item.symbol}) satıldı`
          : `${quantity} adet ${item.name} (${item.symbol}) satıldı`,
      metadata: {
        symbol: item.symbol,
        name: item.name,
        asset_type: item.asset_type,
        quantity,
        price,
        total_amount: totalAmount,
        commission,
        net_amount: netAmount,
        transaction_id: transaction.id,
        ...(opts.order
          ? { source: 'order', order_id: opts.order.id, order_type: opts.order.type }
          : opts.source === 'stop_loss'
            ? { source: 'stop_loss' }
            : {}),
      },
    };

    const response: TradeResult = {
      success: true,
      message: 'Satış işlemi başarılı',
      transaction,
      portfolioItem,
      executedPrice: transaction.price,
    };

    if (opts.client) {
      // Çağıranın transaction'ı henüz commit edilmedi
      response.postCommit = () => afterCommit(userId, logEntry);
    } else {
      afterCommit(userId, logEntry);
    }
    return response;
  }

  /** Kullanıcının tüm pozisyonlarının değer/K-Z alanlarını ve users özet alanlarını yeniden hesaplar. */
  static async recalculateUserPortfolio(userId: string, client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE portfolio_items
          SET total_value = quantity * current_price,
              profit_loss = (current_price - average_price) * quantity,
              profit_loss_percent = CASE WHEN average_price > 0
                                         THEN ((current_price - average_price) / average_price) * 100
                                         ELSE 0 END
        WHERE user_id = $1`,
      [userId]
    );
    await client.query(
      `UPDATE users u
          SET portfolio_value   = COALESCE(s.tv, 0),
              total_profit_loss = COALESCE(s.pl, 0)
         FROM (SELECT SUM(total_value) AS tv, SUM(profit_loss) AS pl
                 FROM portfolio_items WHERE user_id = $1) s
        WHERE u.id = $1`,
      [userId]
    );
  }
}
