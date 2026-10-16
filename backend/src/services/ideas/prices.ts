import pool from '../../config/database';
import type { Queryable } from '../game/common';
import { commodityName } from '../picks/prices';
import { IDEA_ASSET_TYPES, IDEA_PRICES, IdeaAssetType, QuoteCurrency } from './config';
import { positive } from './math';

/**
 * Ortak Akıl fiyatları — YALNIZCA zaten saklanmış veriyi okur (dış API çağrısı yok; services/finnhub, coingecko,
 * currency, commodity, news ve sağlayıcı adaptörlerine dokunulmaz). Haftalık Seçim ile aynı kaynaklar, ek olarak
 * fiyatın zamanı (as_of) döner:
 *   hisse / kripto : market_data_cache.price (USD), cached_at
 *   döviz          : currency_rates.selling (TL), updated_at
 *   emtia          : price_history'deki en son kayıt (para birimi satırın currency alanı), updated_at
 * Tazelik gerçek saate (veritabanının CURRENT_TIMESTAMP'i) göre ölçülür.
 */

export interface AssetRef {
  asset_type: IdeaAssetType;
  symbol: string;
}

export interface Quote {
  asset_type: IdeaAssetType;
  symbol: string;
  name: string;
  price: number;
  quote_currency: QuoteCurrency;
  as_of: Date;
}

export const quoteKey = (assetType: string, symbol: string): string => `${assetType}:${String(symbol).toUpperCase()}`;

const asCurrency = (v: unknown, fallback: QuoteCurrency): QuoteCurrency => (v === 'USD' || v === 'TRY' ? v : fallback);

function uniqueRefs(keys: AssetRef[]): Map<string, AssetRef> {
  const out = new Map<string, AssetRef>();
  for (const k of keys) {
    if (!(IDEA_ASSET_TYPES as readonly string[]).includes(k.asset_type)) continue;
    const symbol = String(k.symbol || '').trim().toUpperCase();
    if (symbol) out.set(quoteKey(k.asset_type, symbol), { asset_type: k.asset_type, symbol });
  }
  return out;
}

/**
 * Önbelleksiz: verilen varlıkların saklanmış en güncel fiyatı. maxAgeMs: tür başına kabul edilen en eski fiyat
 * (sayı verilirse tüm türler için aynı). Bulunamayanlar haritada yer almaz.
 */
export async function fetchQuotes(
  keys: AssetRef[],
  maxAgeMs: number | Record<IdeaAssetType, number>,
  db: Queryable = pool
): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const uniq = uniqueRefs(keys);
  if (uniq.size === 0) return out;
  const age = (t: IdeaAssetType) => (typeof maxAgeMs === 'number' ? maxAgeMs : maxAgeMs[t]);
  const byType = new Map<IdeaAssetType, string[]>();
  for (const k of uniq.values()) byType.set(k.asset_type, [...(byType.get(k.asset_type) ?? []), k.symbol]);

  for (const type of ['stock', 'crypto'] as const) {
    const syms = byType.get(type);
    if (!syms?.length) continue;
    const r = await db.query(
      `SELECT DISTINCT ON (UPPER(symbol)) UPPER(symbol) AS sym, name, price, cached_at
         FROM market_data_cache
        WHERE asset_type = $1 AND UPPER(symbol) = ANY($2::text[]) AND price > 0
          AND cached_at >= CURRENT_TIMESTAMP - ($3::bigint * INTERVAL '1 millisecond')
        ORDER BY UPPER(symbol), cached_at DESC`,
      [type, syms, age(type)]
    );
    for (const row of r.rows) {
      const price = positive(row.price);
      if (!price) continue;
      out.set(quoteKey(type, row.sym), { asset_type: type, symbol: row.sym, name: row.name || row.sym, price, quote_currency: 'USD', as_of: new Date(row.cached_at) });
    }
  }

  const fx = byType.get('currency');
  if (fx?.length) {
    const r = await db.query(
      `SELECT DISTINCT ON (UPPER(code)) UPPER(code) AS sym, name, selling, updated_at
         FROM currency_rates
        WHERE UPPER(code) = ANY($1::text[]) AND UPPER(code) <> 'TRY' AND selling > 0
          AND updated_at >= CURRENT_TIMESTAMP - ($2::bigint * INTERVAL '1 millisecond')
        ORDER BY UPPER(code), updated_at DESC`,
      [fx, age('currency')]
    );
    for (const row of r.rows) {
      const price = positive(row.selling);
      if (!price) continue;
      out.set(quoteKey('currency', row.sym), {
        asset_type: 'currency',
        symbol: row.sym,
        name: row.name || row.sym,
        price,
        quote_currency: 'TRY',
        as_of: new Date(row.updated_at),
      });
    }
  }

  const cm = byType.get('commodity');
  if (cm?.length) {
    const r = await db.query(
      `SELECT DISTINCT ON (symbol) symbol, price, currency, updated_at
         FROM price_history
        WHERE asset_type = 'commodity' AND price > 0 AND symbol = ANY($1::text[])
          AND updated_at >= CURRENT_TIMESTAMP - ($2::bigint * INTERVAL '1 millisecond')
          AND bucket_start <= CURRENT_TIMESTAMP
        ORDER BY symbol, updated_at DESC, bucket_start DESC`,
      [cm, age('commodity')]
    );
    for (const row of r.rows) {
      const price = positive(row.price);
      if (!price) continue;
      const sym = String(row.symbol).toUpperCase();
      out.set(quoteKey('commodity', sym), {
        asset_type: 'commodity',
        symbol: sym,
        name: commodityName(sym),
        price,
        quote_currency: asCurrency(row.currency, 'USD'),
        as_of: new Date(row.updated_at),
      });
    }
  }
  return out;
}

/** Yayın anı: tazelik sınırlı tek fiyat (yoksa null) */
export async function captureQuote(ref: AssetRef, db: Queryable = pool): Promise<Quote | null> {
  const m = await fetchQuotes([ref], IDEA_PRICES.captureMaxAgeMs, db);
  return m.get(quoteKey(ref.asset_type, ref.symbol)) ?? null;
}

// ---------------------------------------------------------------------------
// Önbellekli canlı fiyatlar (liste / detay performansı)
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; value: Quote | null }>();

export function clearQuoteCache(): void {
  cache.clear();
}

export async function liveQuotes(keys: AssetRef[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const uniq = uniqueRefs(keys);
  const missing: AssetRef[] = [];
  const nowMs = Date.now();
  for (const [k, ref] of uniq) {
    const hit = cache.get(k);
    if (hit && nowMs - hit.at < IDEA_PRICES.cacheMs) {
      if (hit.value) out.set(k, hit.value);
    } else {
      missing.push(ref);
    }
  }
  if (missing.length > 0) {
    const fresh = await fetchQuotes(missing, IDEA_PRICES.displayMaxAgeMs);
    for (const ref of missing) {
      const k = quoteKey(ref.asset_type, ref.symbol);
      const v = fresh.get(k) ?? null;
      cache.set(k, { at: nowMs, value: v });
      if (v) out.set(k, v);
    }
    if (cache.size > 5000) {
      for (const [k, v] of cache) if (nowMs - v.at >= IDEA_PRICES.cacheMs) cache.delete(k);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Yayından bu yana en yüksek / en düşük (seviye aşımı) ve grafik serisi
// ---------------------------------------------------------------------------

export interface HighLow {
  high: number | null;
  low: number | null;
}

/**
 * price_history'de `from` anından SONRA başlayan kovaların kapanış fiyatlarıyla en yüksek / en düşük
 * (aynı kote para birimi). Canlı fiyat ayrıca hesaba katılmalıdır.
 */
export async function highLowSince(
  ref: AssetRef & { quote_currency: QuoteCurrency },
  from: Date,
  db: Queryable = pool
): Promise<HighLow> {
  const r = await db.query(
    `SELECT MAX(price) AS hi, MIN(price) AS lo
       FROM price_history
      WHERE asset_type = $1 AND symbol = $2 AND currency = $3 AND price > 0
        AND bucket_start >= $4::timestamptz AND bucket_start <= CURRENT_TIMESTAMP`,
    [ref.asset_type, ref.symbol.toUpperCase(), ref.quote_currency, from.toISOString()]
  );
  return { high: positive(r.rows[0]?.hi), low: positive(r.rows[0]?.lo) };
}

export type ChartGranularity = 'm15' | 'hour' | 'day';

export interface ChartPoint {
  /** Unix zaman damgası (saniye, UTC) */
  t: number;
  v: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Süreye göre tercih edilen yoğunluk sırası (en az 2 noktası olan ilk yoğunluk seçilir) */
export function granularityOrder(spanMs: number): ChartGranularity[] {
  if (spanMs <= 2 * DAY_MS) return ['m15', 'hour', 'day'];
  if (spanMs <= 14 * DAY_MS) return ['hour', 'day', 'm15'];
  return ['day', 'hour', 'm15'];
}

/** Fiyat geçmişi noktaları [from, to] (seçilen yoğunlukta, kronolojik) */
export async function chartSeries(
  ref: AssetRef & { quote_currency: QuoteCurrency },
  from: Date,
  to: Date,
  db: Queryable = pool
): Promise<{ granularity: ChartGranularity | null; points: ChartPoint[] }> {
  const r = await db.query(
    `SELECT granularity, bucket_start, price
       FROM price_history
      WHERE asset_type = $1 AND symbol = $2 AND currency = $3 AND price > 0
        AND bucket_start >= $4::timestamptz AND bucket_start <= $5::timestamptz
      ORDER BY bucket_start ASC`,
    [ref.asset_type, ref.symbol.toUpperCase(), ref.quote_currency, from.toISOString(), to.toISOString()]
  );
  const by = new Map<ChartGranularity, ChartPoint[]>();
  for (const row of r.rows) {
    const v = positive(row.price);
    if (!v) continue;
    const g = row.granularity as ChartGranularity;
    by.set(g, [...(by.get(g) ?? []), { t: Math.floor(new Date(row.bucket_start).getTime() / 1000), v }]);
  }
  const order = granularityOrder(to.getTime() - from.getTime());
  const g = order.find((x) => (by.get(x)?.length ?? 0) >= 2) ?? order.find((x) => (by.get(x)?.length ?? 0) > 0) ?? null;
  return { granularity: g, points: g ? by.get(g)! : [] };
}
