import pool from '../config/database';
import { providers } from '../providers';
import type { AssetType } from '../types';
import { isTryQuotedCommodity } from './commodity';
import {
  DAY_MS,
  GRANULARITY_MS,
  PRICE_GRANULARITIES,
  PRICE_TZ,
  bucketStart,
  istanbulDayStart,
  istanbulYearStart,
  type PriceGranularity,
} from '../utils/priceBuckets';

export { DAY_MS, GRANULARITY_MS, PRICE_GRANULARITIES, PRICE_TZ, bucketStart, istanbulDayStart, istanbulYearStart };
export type { PriceGranularity };

/**
 * Varlık fiyat geçmişi (price_history) — grafikler, performans rozetleri ve sparkline'lar.
 *
 * Veri kaynağı: sadece ZATEN ÇEKİLMİŞ fiyatlar okunur, dış API'ye istek atılmaz:
 *  - hisse / kripto : market_data_cache (USD)
 *  - döviz          : currency_rates satış kuru (TL)
 *  - emtia          : providers.commodities.getPopularPrices() (önbellekli; para birimi quoteCurrency)
 *
 * Kovalar (bkz. migrations/007_price_history.sql):
 *  - m15  : 15 dakikalık kova (UTC çeyrek saat), 3 gün saklanır  → 1D grafiği
 *  - hour : saatlik kova, 15 gün saklanır                        → 1W grafiği + sparkline
 *  - day  : İstanbul takvim günü, kalıcı                          → 1M … ALL
 *
 * Cron (index.ts) her 15 dakikada bir, kovanın sonuna yakın (xx:14, :29, :44, :59) snapshotAll()
 * çalıştırır; böylece her kovadaki değer o kovanın KAPANIŞ fiyatıdır.
 * Fiyatlar varlığın kendi para biriminde saklanır ve döndürülür (TL'ye çevrilmez).
 */

export const PRICE_RANGES = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const;
export type PriceRange = (typeof PRICE_RANGES)[number];
export type QuoteCurrency = 'USD' | 'TRY';

export const PERFORMANCE_PERIODS = ['1W', '1M', '3M', '6M', 'YTD', '1Y'] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];
export type PerformanceData = Record<PerformancePeriod, number | null>;

/** Budama: m15 3 günden, hour 15 günden eski satırlar silinir (day kalıcı). */
export const RETENTION_MS: Record<Exclude<PriceGranularity, 'day'>, number> = {
  m15: 3 * DAY_MS,
  hour: 15 * DAY_MS,
};

/** Kaynak fiyatın kabul edilen en eski yaşı (snapshot + canlı fiyat) */
const SOURCE_MAX_AGE_MS = DAY_MS;

/** Sparkline: son 7 günün saatlik kapanışları, en fazla 42 nokta */
export const SPARKLINE_DAYS = 7;
export const SPARKLINE_MAX_POINTS = 42;
export const SPARKLINE_MAX_ITEMS = 60;

/** Aralık → birincil yoğunluk + geriye bakış (ALL/YTD için null → özel) */
const RANGE_CONFIG: Record<PriceRange, { granularity: PriceGranularity; days: number | null }> = {
  '1D': { granularity: 'm15', days: 1 },
  '1W': { granularity: 'hour', days: 7 },
  '1M': { granularity: 'day', days: 30 },
  '3M': { granularity: 'day', days: 90 },
  '6M': { granularity: 'day', days: 182 },
  YTD: { granularity: 'day', days: null },
  '1Y': { granularity: 'day', days: 365 },
  ALL: { granularity: 'day', days: null },
};

/** Birincil yoğunlukta veri yoksa denenecek sıra (önce bir ince, sonra bir kaba) */
const FALLBACK_ORDER: Record<PriceGranularity, PriceGranularity[]> = {
  m15: ['m15', 'hour', 'day'],
  hour: ['hour', 'm15', 'day'],
  day: ['day', 'hour', 'm15'],
};

const PERFORMANCE_DAYS: Record<Exclude<PerformancePeriod, 'YTD'>, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 182,
  '1Y': 365,
};

export interface PricePoint {
  /** Kova başlangıcı (veya canlı nokta için "şimdi"), Unix saniye (UTC) */
  t: number;
  v: number;
}

export interface PriceHistoryData {
  symbol: string;
  type: AssetType;
  range: PriceRange;
  /** Noktaların gerçekte okunduğu yoğunluk (yedeğe düşüldüyse birincilden farklıdır); veri yoksa null */
  granularity: PriceGranularity | null;
  currency: QuoteCurrency;
  points: PricePoint[];
  first: number | null;
  last: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface PriceRow {
  granularity: PriceGranularity;
  bucketStart: Date;
  price: number;
}

export interface LivePrice {
  price: number;
  currency: QuoteCurrency;
  at: Date | null;
}

export interface SnapshotResult {
  market: number;
  currency: number;
  commodity: number;
  pruned: number;
}

export interface SparklineItem {
  type: AssetType;
  symbol: string;
}

// ---------------------------------------------------------------------------
// Saf yardımcılar (testlenebilir)
// ---------------------------------------------------------------------------

/** Aralığın başlangıç anı (ALL için null) */
export function rangeStart(range: PriceRange, now: Date): Date | null {
  if (range === 'ALL') return null;
  if (range === 'YTD') return istanbulYearStart(now);
  return new Date(now.getTime() - (RANGE_CONFIG[range].days as number) * DAY_MS);
}

export function primaryGranularity(range: PriceRange): PriceGranularity {
  return RANGE_CONFIG[range].granularity;
}

/** Varlık tipinin (ve emtia kodunun) kote edildiği para birimi */
export function defaultCurrency(type: AssetType, symbol: string): QuoteCurrency {
  if (type === 'currency') return 'TRY';
  if (type === 'commodity') return isTryQuotedCommodity(symbol) ? 'TRY' : 'USD';
  return 'USD';
}

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
const round2 = (n: number) => Math.round(n * 100) / 100;

function positive(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

/**
 * Aralık için yoğunluğu seçer: birincil yoğunlukta en az 2 nokta varsa o; yoksa FALLBACK_ORDER
 * sırasıyla en az 2 noktası olan ilk yoğunluk; hiçbirinde 2 nokta yoksa noktası olan ilk yoğunluk.
 */
export function chooseGranularity(rows: PriceRow[], range: PriceRange): PriceGranularity | null {
  const counts = new Map<PriceGranularity, number>();
  for (const r of rows) counts.set(r.granularity, (counts.get(r.granularity) ?? 0) + 1);
  const order = FALLBACK_ORDER[primaryGranularity(range)];
  return order.find((g) => (counts.get(g) ?? 0) >= 2) ?? order.find((g) => (counts.get(g) ?? 0) > 0) ?? null;
}

/**
 * Satırlardan aralık noktalarını kurar (saf fonksiyon). rows: aralık başlangıcından itibaren tüm yoğunluklar.
 * Canlı fiyat son kovadan daha yeniyse "şimdi" noktası olarak sona eklenir.
 */
export function buildPriceHistory(
  rows: PriceRow[],
  opts: { type: AssetType; symbol: string; range: PriceRange; now: Date; live: LivePrice | null; currency?: QuoteCurrency }
): PriceHistoryData {
  const from = rangeStart(opts.range, opts.now);
  const to = opts.now.getTime();
  const inRange = rows.filter((r) => {
    const ms = r.bucketStart.getTime();
    return Number.isFinite(ms) && ms <= to && (from === null || ms >= from.getTime());
  });
  const granularity = chooseGranularity(inRange, opts.range);
  const points: PricePoint[] = inRange
    .filter((r) => r.granularity === granularity)
    .sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime())
    .map((r) => ({ t: Math.floor(r.bucketStart.getTime() / 1000), v: r.price }));

  if (opts.live) {
    const liveT = Math.floor(to / 1000);
    if (points.length === 0 || liveT > points[points.length - 1].t) {
      points.push({ t: liveT, v: opts.live.price });
    }
  }

  const first = points.length > 0 ? points[0].v : null;
  const last = points.length > 0 ? points[points.length - 1].v : null;
  const hasChange = points.length >= 2 && first !== null && last !== null;
  const change = hasChange ? round8(last! - first!) : null;
  const changePercent = hasChange && first! > 0 ? round2(((last! - first!) / first!) * 100) : null;

  return {
    symbol: opts.symbol,
    type: opts.type,
    range: opts.range,
    granularity: points.length > 0 ? granularity ?? null : null,
    currency: opts.live?.currency ?? opts.currency ?? defaultCurrency(opts.type, opts.symbol),
    points,
    first,
    last,
    change,
    changePercent,
  };
}

/** En fazla `max` noktaya eşit aralıklı seçimle indirger (ilk ve son nokta korunur). */
export function downsample<T>(values: T[], max: number = SPARKLINE_MAX_POINTS): T[] {
  if (max <= 0) return [];
  if (values.length <= max) return values.slice();
  if (max === 1) return [values[values.length - 1]];
  const out: T[] = [];
  const step = (values.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(values[Math.round(i * step)]);
  return out;
}

export const sparklineKey = (type: string, symbol: string) => `${type}:${symbol.toUpperCase()}`;

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

/** Kova uç zamanı (kapanış anı) — SQL ifadesi */
const BUCKET_END_SQL = `(p.bucket_start + CASE p.granularity
    WHEN 'm15' THEN INTERVAL '15 minutes'
    WHEN 'hour' THEN INTERVAL '1 hour'
    ELSE INTERVAL '1 day' END)`;

const UPSERT_SUFFIX = `ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE
   SET price = EXCLUDED.price, currency = EXCLUDED.currency, updated_at = EXCLUDED.updated_at`;

export class PriceHistoryService {
  /**
   * Bilinen son fiyatları güncel m15, hour ve day kovalarına yazar (UPSERT) ve eski satırları budar.
   * Her kaynak için tek toplu INSERT. Dış API çağrısı yapmaz (emtia: önbellekli liste).
   */
  static async snapshotAll(now: Date = new Date()): Promise<SnapshotResult> {
    const nowIso = now.toISOString();
    const buckets = [
      bucketStart('m15', now).toISOString(),
      bucketStart('hour', now).toISOString(),
      bucketStart('day', now).toISOString(),
    ];
    const bucketsSql = `(VALUES ('m15', $2::timestamptz), ('hour', $3::timestamptz), ('day', $4::timestamptz)) AS b(g, bs)`;
    const result: SnapshotResult = { market: 0, currency: 0, commodity: 0, pruned: 0 };

    // 1) Hisse + kripto (USD) — son 1 gün içinde güncellenmiş cache satırları
    const market = await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       SELECT m.asset_type, m.sym, b.g, b.bs, m.price, 'USD', $1::timestamptz
         FROM (
           SELECT DISTINCT ON (asset_type, UPPER(symbol)) asset_type, UPPER(symbol) AS sym, price
             FROM market_data_cache
            WHERE asset_type IN ('stock', 'crypto')
              AND price > 0
              AND length(symbol) <= 20
              AND cached_at >= $1::timestamptz - ($5::int * INTERVAL '1 millisecond')
            ORDER BY asset_type, UPPER(symbol), cached_at DESC
         ) m
         CROSS JOIN ${bucketsSql}
       ${UPSERT_SUFFIX}`,
      [nowIso, ...buckets, SOURCE_MAX_AGE_MS]
    );
    result.market = market.rowCount ?? 0;

    // 2) Döviz (TL / birim, satış kuru) — TRY'nin kendisi hariç
    const fx = await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       SELECT 'currency', c.sym, b.g, b.bs, c.selling, 'TRY', $1::timestamptz
         FROM (
           SELECT DISTINCT ON (UPPER(code)) UPPER(code) AS sym, selling
             FROM currency_rates
            WHERE selling > 0
              AND UPPER(code) <> 'TRY'
              AND length(code) <= 20
              AND updated_at >= $1::timestamptz - ($5::int * INTERVAL '1 millisecond')
            ORDER BY UPPER(code), updated_at DESC
         ) c
         CROSS JOIN ${bucketsSql}
       ${UPSERT_SUFFIX}`,
      [nowIso, ...buckets, SOURCE_MAX_AGE_MS]
    );
    result.currency = fx.rowCount ?? 0;

    // 3) Emtia (önbellekli popüler liste; sağlayıcı yapılandırılmamışsa boş)
    try {
      const quotes = await providers.commodities.getPopularPrices();
      const bySymbol = new Map<string, { price: number; currency: QuoteCurrency }>();
      for (const q of quotes ?? []) {
        const sym = String(q?.code ?? '').trim().toUpperCase();
        const price = positive(q?.selling);
        if (!sym || sym.length > 20 || !price) continue;
        if (Number.isFinite(q.fetchedAt) && now.getTime() - q.fetchedAt > SOURCE_MAX_AGE_MS) continue;
        const currency: QuoteCurrency =
          q.quoteCurrency === 'TRY' || q.quoteCurrency === 'USD' ? q.quoteCurrency : defaultCurrency('commodity', sym);
        bySymbol.set(sym, { price, currency });
      }
      if (bySymbol.size > 0) {
        const syms = [...bySymbol.keys()];
        const commodity = await pool.query(
          `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
           SELECT 'commodity', q.sym, b.g, b.bs, q.price, q.cur, $1::timestamptz
             FROM unnest($5::text[], $6::numeric[], $7::text[]) AS q(sym, price, cur)
             CROSS JOIN ${bucketsSql}
           ${UPSERT_SUFFIX}`,
          [
            nowIso,
            ...buckets,
            syms,
            syms.map((s) => bySymbol.get(s)!.price),
            syms.map((s) => bySymbol.get(s)!.currency),
          ]
        );
        result.commodity = commodity.rowCount ?? 0;
      }
    } catch (err: any) {
      console.error('[price-history] Emtia fiyatları okunamadı:', err?.message || err);
    }

    result.pruned = await PriceHistoryService.prune(now);
    return result;
  }

  /** m15 → 3 günden, hour → 15 günden eski satırları siler. */
  static async prune(now: Date = new Date()): Promise<number> {
    const r = await pool.query(
      `DELETE FROM price_history
        WHERE (granularity = 'm15' AND bucket_start < $1::timestamptz)
           OR (granularity = 'hour' AND bucket_start < $2::timestamptz)`,
      [new Date(now.getTime() - RETENTION_MS.m15).toISOString(), new Date(now.getTime() - RETENTION_MS.hour).toISOString()]
    );
    return r.rowCount ?? 0;
  }

  /** Cron işi: anlık görüntü + kısa log */
  static async snapshotJob(): Promise<void> {
    const r = await PriceHistoryService.snapshotAll(new Date());
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log(
        `[price-history] Anlık görüntü: ${r.market} piyasa, ${r.currency} döviz, ${r.commodity} emtia satırı; ${r.pruned} eski satır silindi`
      );
    }
  }

  /**
   * Güncel (canlı) fiyat, varlığın kendi para biriminde. Snapshot ile aynı kaynaklar; 1 günden eskiyse null.
   */
  static async getLivePrice(type: AssetType, symbol: string, now: Date = new Date()): Promise<LivePrice | null> {
    const sym = symbol.trim().toUpperCase();
    const nowIso = now.toISOString();
    switch (type) {
      case 'stock':
      case 'crypto': {
        const r = await pool.query(
          `SELECT price, cached_at FROM market_data_cache
            WHERE asset_type = $1 AND UPPER(symbol) = $2 AND price > 0
              AND cached_at >= $3::timestamptz - ($4::int * INTERVAL '1 millisecond')
            ORDER BY cached_at DESC LIMIT 1`,
          [type, sym, nowIso, SOURCE_MAX_AGE_MS]
        );
        const price = positive(r.rows[0]?.price);
        return price ? { price, currency: 'USD', at: r.rows[0].cached_at ? toDate(r.rows[0].cached_at) : null } : null;
      }
      case 'currency': {
        if (sym === 'TRY') return null;
        const r = await pool.query(
          `SELECT selling, updated_at FROM currency_rates
            WHERE UPPER(code) = $1 AND selling > 0
              AND updated_at >= $2::timestamptz - ($3::int * INTERVAL '1 millisecond')
            ORDER BY updated_at DESC LIMIT 1`,
          [sym, nowIso, SOURCE_MAX_AGE_MS]
        );
        const price = positive(r.rows[0]?.selling);
        return price ? { price, currency: 'TRY', at: r.rows[0].updated_at ? toDate(r.rows[0].updated_at) : null } : null;
      }
      case 'commodity': {
        try {
          const quotes = await providers.commodities.getPopularPrices();
          const q = (quotes ?? []).find((c) => String(c?.code ?? '').toUpperCase() === sym);
          const price = positive(q?.selling);
          if (!q || !price) return null;
          if (Number.isFinite(q.fetchedAt) && now.getTime() - q.fetchedAt > SOURCE_MAX_AGE_MS) return null;
          const currency: QuoteCurrency =
            q.quoteCurrency === 'TRY' || q.quoteCurrency === 'USD' ? q.quoteCurrency : defaultCurrency('commodity', sym);
          return { price, currency, at: Number.isFinite(q.fetchedAt) ? new Date(q.fetchedAt) : null };
        } catch (err: any) {
          console.error(`[price-history] Emtia canlı fiyatı okunamadı (${sym}):`, err?.message || err);
          return null;
        }
      }
      default:
        return null;
    }
  }

  /** GET /api/market/history */
  static async getHistory(type: AssetType, symbol: string, range: PriceRange, now: Date = new Date()): Promise<PriceHistoryData> {
    const sym = symbol.trim().toUpperCase();
    const from = rangeStart(range, now);
    const [rowsRes, live] = await Promise.all([
      pool.query(
        `SELECT granularity, bucket_start, price, currency
           FROM price_history
          WHERE asset_type = $1 AND symbol = $2
            AND ($3::timestamptz IS NULL OR bucket_start >= $3::timestamptz)
            AND bucket_start <= $4::timestamptz
          ORDER BY bucket_start ASC`,
        [type, sym, from ? from.toISOString() : null, now.toISOString()]
      ),
      PriceHistoryService.getLivePrice(type, sym, now),
    ]);

    const rows: PriceRow[] = [];
    let storedCurrency: QuoteCurrency | undefined;
    for (const r of rowsRes.rows) {
      const price = positive(r.price);
      if (!price) continue;
      rows.push({ granularity: r.granularity, bucketStart: toDate(r.bucket_start), price });
      if (r.currency === 'USD' || r.currency === 'TRY') storedCurrency = r.currency;
    }

    return buildPriceHistory(rows, { type, symbol: sym, range, now, live, currency: storedCurrency });
  }

  /**
   * GET /api/market/performance — her dönem için (şimdi − dönem) anındaki veya hemen öncesindeki
   * kapanıştan canlı fiyata yüzde değişim. O kadar eski nokta yoksa null.
   * Canlı fiyat yoksa en son kaydedilen fiyat kullanılır.
   */
  static async getPerformance(type: AssetType, symbol: string, now: Date = new Date()): Promise<PerformanceData> {
    const sym = symbol.trim().toUpperCase();
    const targets = PERFORMANCE_PERIODS.map((p) =>
      p === 'YTD' ? istanbulYearStart(now) : new Date(now.getTime() - PERFORMANCE_DAYS[p] * DAY_MS)
    );

    const [baseRes, live] = await Promise.all([
      pool.query(
        `SELECT t.k,
                (SELECT p.price FROM price_history p
                  WHERE p.asset_type = $1 AND p.symbol = $2
                    AND p.bucket_start <= t.ts
                    AND ${BUCKET_END_SQL} <= t.ts
                  ORDER BY ${BUCKET_END_SQL} DESC, p.bucket_start DESC
                  LIMIT 1) AS price
           FROM unnest($3::text[], $4::timestamptz[]) AS t(k, ts)`,
        [type, sym, [...PERFORMANCE_PERIODS], targets.map((d) => d.toISOString())]
      ),
      PriceHistoryService.getLivePrice(type, sym, now),
    ]);

    let current = live?.price ?? null;
    if (current === null) {
      const latest = await pool.query(
        `SELECT price FROM price_history WHERE asset_type = $1 AND symbol = $2 AND bucket_start <= $3::timestamptz
          ORDER BY bucket_start DESC LIMIT 1`,
        [type, sym, now.toISOString()]
      );
      current = positive(latest.rows[0]?.price);
    }

    const out = Object.fromEntries(PERFORMANCE_PERIODS.map((p) => [p, null])) as PerformanceData;
    if (current === null) return out;
    for (const r of baseRes.rows) {
      const base = positive(r.price);
      if (base && (PERFORMANCE_PERIODS as readonly string[]).includes(r.k)) {
        out[r.k as PerformancePeriod] = round2(((current - base) / base) * 100);
      }
    }
    return out;
  }

  /**
   * GET /api/market/sparklines — 'type:SYMBOL' → son 7 günün saatlik kapanışları (≤ 42 nokta).
   * Tüm varlıklar için TEK sorgu. Verisi olmayan varlık boş dizi döner.
   */
  static async getSparklines(items: SparklineItem[], now: Date = new Date()): Promise<Record<string, number[]>> {
    const unique = new Map<string, SparklineItem>();
    for (const it of items) {
      const sym = it.symbol.trim().toUpperCase();
      unique.set(sparklineKey(it.type, sym), { type: it.type, symbol: sym });
    }
    const out: Record<string, number[]> = {};
    for (const key of unique.keys()) out[key] = [];
    if (unique.size === 0) return out;

    const list = [...unique.values()];
    const r = await pool.query(
      `SELECT p.asset_type, p.symbol, p.price
         FROM price_history p
         JOIN unnest($1::text[], $2::text[]) AS i(asset_type, symbol)
           ON p.asset_type = i.asset_type AND p.symbol = i.symbol
        WHERE p.granularity = 'hour'
          AND p.bucket_start >= $3::timestamptz
          AND p.bucket_start <= $4::timestamptz
        ORDER BY p.asset_type, p.symbol, p.bucket_start ASC`,
      [
        list.map((i) => i.type),
        list.map((i) => i.symbol),
        new Date(now.getTime() - SPARKLINE_DAYS * DAY_MS).toISOString(),
        now.toISOString(),
      ]
    );

    const series = new Map<string, number[]>();
    for (const row of r.rows) {
      const price = positive(row.price);
      if (!price) continue;
      const key = sparklineKey(row.asset_type, row.symbol);
      let arr = series.get(key);
      if (!arr) series.set(key, (arr = []));
      arr.push(price);
    }
    for (const [key, values] of series) {
      if (key in out) out[key] = downsample(values, SPARKLINE_MAX_POINTS);
    }
    return out;
  }
}
