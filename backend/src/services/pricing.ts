import pool from '../config/database';
import { AppError } from '../utils/errors';
import { AssetType } from '../types';
import { providers } from '../providers';
import { isTryQuotedCommodity } from './commodity';

export { isTryQuotedCommodity };

/** Fiyat bulunamadığında / bayat olduğunda fırlatılır (HTTP 503). */
export class PriceUnavailableError extends AppError {
  constructor(message = 'Fiyat verisi şu an mevcut değil') {
    super(503, message, 'PRICE_UNAVAILABLE');
  }
}

/** İşlem için kabul edilen en eski fiyat yaşı */
export const MAX_PRICE_AGE_MS: Record<AssetType, number> = {
  stock: 15 * 60 * 1000,
  crypto: 15 * 60 * 1000,
  currency: 24 * 60 * 60 * 1000,
  commodity: 24 * 60 * 60 * 1000,
};

/** Portföy değerlemesi için (işlem değil) daha gevşek pencere: market_data_cache TTL'i (1 saat) */
const VALUATION_MARKET_MAX_AGE_MS = 60 * 60 * 1000;

const USD_TRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const USD_TRY_MEMO_MS = 30 * 1000;

export interface UsdTryRate {
  rate: number;
  updatedAt: Date | null;
  source: 'db' | 'env';
}

export interface ExecutionPrice {
  priceTRY: number;
  name: string;
  /** Kaynağın son güncellenme zamanı */
  priceUpdatedAt: Date | null;
}

export interface PriceKey {
  symbol: string;
  asset_type: AssetType;
}

export const priceKey = (assetType: string, symbol: string) => `${assetType}:${symbol.toUpperCase()}`;

/** İşlem yönü: alışta kullanıcı satış kurundan alır, satışta alış kurundan satar (yalnızca döviz). */
export type PriceSide = 'buy' | 'sell';

let usdMemo: { value: UsdTryRate | null; at: number } | null = null;

function positive(n: unknown): number | null {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Döviz işlem fiyatı (TL / birim). Alış (kullanıcı döviz alır) → satış kuru (selling);
 * satış (kullanıcı döviz satar) → alış kuru (buying). Satış fiyatı hiçbir zaman alış fiyatını
 * geçemez (ters/bozuk veride al-sat ile sanal para yaratılmasın): min(buying, selling).
 * Alış kuru yoksa satış kuru kullanılır (önceki davranış). Değerleme satış kuruyla yapılır
 * (bkz. migrations/README.md, 020).
 */
export function currencyTradePrice(row: { buying?: unknown; selling?: unknown } | null | undefined, side: PriceSide): number | null {
  const selling = positive(row?.selling);
  if (!selling) return null;
  if (side === 'buy') return selling;
  const buying = positive(row?.buying);
  return buying ? Math.min(buying, selling) : selling;
}

export class PricingService {
  /**
   * Güncel USD/TRY kuru: currency_rates tablosundaki USD satış kuru.
   * Yoksa/bayatsa DEFAULT_USD_TRY env değeri; o da yoksa null.
   */
  static async getUsdTry(): Promise<UsdTryRate | null> {
    if (usdMemo && Date.now() - usdMemo.at < USD_TRY_MEMO_MS) {
      return usdMemo.value;
    }

    let value: UsdTryRate | null = null;
    try {
      const r = await pool.query(
        `SELECT selling, updated_at,
                (updated_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 millisecond')) AS fresh
           FROM currency_rates
          WHERE UPPER(code) = 'USD'
          LIMIT 1`,
        [USD_TRY_MAX_AGE_MS]
      );
      const row = r.rows[0];
      const rate = positive(row?.selling);
      if (row && rate && row.fresh) {
        value = { rate, updatedAt: row.updated_at ?? null, source: 'db' };
      }
    } catch (err: any) {
      console.error('[pricing] USD/TRY okunamadı:', err?.message);
    }

    if (!value) {
      const envRate = positive(process.env.DEFAULT_USD_TRY);
      if (envRate) {
        value = { rate: envRate, updatedAt: null, source: 'env' };
      }
    }

    usdMemo = { value, at: Date.now() };
    return value;
  }

  static async requireUsdTry(): Promise<number> {
    const usd = await this.getUsdTry();
    if (!usd) {
      throw new PriceUnavailableError('Döviz kuru (USD/TRY) şu an mevcut değil');
    }
    return usd.rate;
  }

  /**
   * Sunucu tarafında belirlenen işlem fiyatı (TL / birim).
   * - stock, crypto: market_data_cache (USD) × USD/TRY
   * - currency: currency_rates (zaten TL / birim) — alışta satış kuru, satışta alış kuru (currencyTradePrice)
   * - commodity: emtia sağlayıcısı (providers.commodities); GAU ve *TRY kodları TL, diğerleri USD × USD/TRY
   * Fiyat yoksa veya bayatsa PriceUnavailableError fırlatır.
   */
  static async getExecutionPriceTRY(symbol: string, assetType: AssetType, side: PriceSide = 'buy'): Promise<ExecutionPrice> {
    const sym = symbol.trim().toUpperCase();
    const maxAge = MAX_PRICE_AGE_MS[assetType];

    switch (assetType) {
      case 'stock':
      case 'crypto': {
        const r = await pool.query(
          `SELECT name, price, cached_at
             FROM market_data_cache
            WHERE asset_type = $1
              AND UPPER(symbol) = $2
              AND cached_at >= CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 millisecond')
            ORDER BY cached_at DESC
            LIMIT 1`,
          [assetType, sym, maxAge]
        );
        const row = r.rows[0];
        const usdPrice = positive(row?.price);
        if (!row || !usdPrice) {
          throw new PriceUnavailableError();
        }
        const usdTry = await this.requireUsdTry();
        return { priceTRY: usdPrice * usdTry, name: row.name || sym, priceUpdatedAt: row.cached_at ?? null };
      }

      case 'currency': {
        if (sym === 'TRY') {
          throw new AppError(400, 'Bu varlık için işlem yapılamaz', 'INVALID_ASSET');
        }
        const r = await pool.query(
          `SELECT code, name, buying, selling, updated_at
             FROM currency_rates
            WHERE UPPER(code) = $1
              AND updated_at >= CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 millisecond')
            LIMIT 1`,
          [sym, maxAge]
        );
        const row = r.rows[0];
        const price = currencyTradePrice(row, side);
        if (!row || !price) {
          throw new PriceUnavailableError();
        }
        return { priceTRY: price, name: row.name || sym, priceUpdatedAt: row.updated_at ?? null };
      }

      case 'commodity': {
        const c = await providers.commodities.getPrice(sym, undefined, maxAge);
        const price = positive(c?.selling);
        if (!c || !price || Date.now() - c.fetchedAt > maxAge) {
          throw new PriceUnavailableError();
        }
        const priceTRY = providers.commodities.isTryQuoted(c.code) ? price : price * (await this.requireUsdTry());
        return { priceTRY, name: c.name || sym, priceUpdatedAt: new Date(c.fetchedAt) };
      }

      default:
        throw new AppError(400, 'Geçersiz varlık tipi', 'INVALID_ASSET');
    }
  }

  /**
   * Birden çok varlık için TL fiyatlarını toplu getirir (bulunamayanlar haritada yer almaz).
   * strict=true: işlem tazelik pencereleri; false: değerleme için daha gevşek pencere.
   * side: yalnızca dövizi etkiler ('sell' → alış kuru; değerleme ve alış tarafı → satış kuru).
   */
  static async getPricesTRY(keys: PriceKey[], strict = false, side: PriceSide = 'buy'): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (keys.length === 0) return out;

    const types = new Set(keys.map((k) => k.asset_type));
    const usd = types.has('stock') || types.has('crypto') || types.has('commodity') ? await this.getUsdTry() : null;

    if ((types.has('stock') || types.has('crypto')) && usd) {
      const marketMaxAge = strict ? MAX_PRICE_AGE_MS.stock : VALUATION_MARKET_MAX_AGE_MS;
      const r = await pool.query(
        `SELECT DISTINCT ON (asset_type, UPPER(symbol)) asset_type, UPPER(symbol) AS sym, price
           FROM market_data_cache
          WHERE asset_type IN ('stock', 'crypto')
            AND price > 0
            AND cached_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 millisecond')
          ORDER BY asset_type, UPPER(symbol), cached_at DESC`,
        [marketMaxAge]
      );
      for (const row of r.rows) {
        const p = positive(row.price);
        if (p) out.set(priceKey(row.asset_type, row.sym), p * usd.rate);
      }
    }

    if (types.has('currency')) {
      const r = await pool.query(
        `SELECT UPPER(code) AS sym, buying, selling
           FROM currency_rates
          WHERE selling > 0
            AND updated_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 millisecond')`,
        [MAX_PRICE_AGE_MS.currency]
      );
      for (const row of r.rows) {
        const p = currencyTradePrice(row, side);
        if (p && row.sym !== 'TRY') out.set(priceKey('currency', row.sym), p);
      }
    }

    if (types.has('commodity')) {
      const codes = [...new Set(keys.filter((k) => k.asset_type === 'commodity').map((k) => k.symbol.toUpperCase()))];
      for (const code of codes) {
        try {
          const c = await providers.commodities.getPrice(code, undefined, MAX_PRICE_AGE_MS.commodity);
          const p = positive(c?.selling);
          if (!c || !p) continue;
          if (providers.commodities.isTryQuoted(c.code)) {
            out.set(priceKey('commodity', code), p);
          } else if (usd) {
            out.set(priceKey('commodity', code), p * usd.rate);
          }
        } catch (err: any) {
          console.error(`[pricing] Emtia fiyatı alınamadı (${code}):`, err?.message);
        }
      }
    }

    return out;
  }

  /**
   * Fiyatı verilen andan (ör. seans açılışı) SONRA alınmış hisseler (büyük harf semboller).
   * Seans kuralı için: açılıştan önce alınmış fiyat (önceki kapanış) emir tetiklemez.
   * Karşılaştırma SQL'de yapılır (TIMESTAMP kolonları oturum saat dilimindedir; Node TZ'den bağımsız).
   */
  static async getStocksQuotedSince(symbols: string[], since: Date): Promise<Set<string>> {
    const out = new Set<string>();
    const syms = [...new Set(symbols.map((s) => s.toUpperCase()))];
    if (syms.length === 0) return out;
    const r = await pool.query(
      `SELECT DISTINCT UPPER(symbol) AS sym
         FROM market_data_cache
        WHERE asset_type = 'stock' AND UPPER(symbol) = ANY($1::text[]) AND price > 0
          AND cached_at >= $2::timestamptz`,
      [syms, since.toISOString()]
    );
    for (const row of r.rows) out.add(String(row.sym));
    return out;
  }
}
