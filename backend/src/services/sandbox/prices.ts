import pool from '../../config/database';
import { providers } from '../../providers';
import { COMMODITY_NAMES } from '../picks/config';
import type { PoolClient } from 'pg';
import { MAX_PRICE_AGE_MS, PricingService, currencyTradePrice } from '../pricing';
import { AppError } from '../../utils/errors';
import {
  ASSET_CLASS_OF,
  AssetClass,
  SANDBOX_ASSET_TYPES,
  SandboxAssetType,
  SeriesPoint,
  assetKey,
} from './math';

/**
 * Sanal portföy USD fiyatları — YALNIZCA saklanmış veriyi okur (dış API çağrısı yapmaz; sağlayıcı iç yapısına
 * dokunmaz). Kaynaklar:
 *   hisse / kripto : market_data_cache.price (zaten USD)
 *   döviz          : currency_rates (TL / birim) ÷ USD/TRY  (alış = satış kuru, satış = alış kuru → makas; USD nakittir)
 *   emtia          : providers.commodities.getPrice (önbellekli); yoksa price_history'deki en son kayıt.
 *                    TL kotalı (GAU …) olanlar USD/TRY ile çevrilir.
 * USD/TRY: PricingService.getUsdTry() (currency_rates USD satış kuru, 24 saat tazelik; yoksa DEFAULT_USD_TRY).
 *
 * Tazelik: işlem için pricing.ts'teki MAX_PRICE_AGE_MS (hisse/kripto 15 dk, döviz/emtia 24 saat); değerleme için
 * hisse/kripto 1 saat. Daha eski fiyatlar da döner ama `fresh` / `valuation_fresh` false olur.
 */

export type Queryable = { query: PoolClient['query'] };

export interface UsdQuote {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  /** Alış / değerleme fiyatı (USD) */
  price_usd: number;
  /** Satış fiyatı (USD) — döviz makası; diğerlerinde price_usd ile aynı */
  sell_price_usd: number;
  /** Kaynağın kote para birimi */
  quote_currency: 'USD' | 'TRY';
  /** Fiyatın alındığı an (yaklaşık; yaş veritabanı saatine göre ölçülür) */
  as_of: Date | null;
  /** İşlem tazelik penceresi içinde mi */
  fresh: boolean;
  /** Değerleme tazelik penceresi içinde mi */
  valuation_fresh: boolean;
  change_24h_pct: number | null;
}

export interface AssetSearchItem {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  price_usd: number;
  quote_currency: 'USD' | 'TRY';
  change_24h_pct: number | null;
}

export interface PriceKeyInput {
  asset_type: string;
  symbol: string;
}

/** Değerleme (işlem değil) için hisse/kripto tazelik penceresi — pricing.ts'teki market_data_cache TTL'i */
export const VALUATION_MAX_AGE_MS: Record<SandboxAssetType, number> = {
  stock: 60 * 60 * 1000,
  crypto: 60 * 60 * 1000,
  currency: MAX_PRICE_AGE_MS.currency,
  commodity: MAX_PRICE_AGE_MS.commodity,
};

const SEARCH_LIMIT = 50;
const DEFAULT_QUOTAS: Record<SandboxAssetType, number> = { stock: 20, crypto: 15, currency: 8, commodity: 7 };
const TYPE_ORDER: Record<SandboxAssetType, number> = { stock: 0, crypto: 1, currency: 2, commodity: 3 };
const FX_ORDER = ['EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
/** USD nakittir, TRY bu (USD) portföyde işlem görmez */
const NON_TRADABLE_FX = new Set(['USD', 'TRY']);

const positive = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const finite = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const commodityName = (symbol: string): string => COMMODITY_NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase();

export function isSandboxAssetType(t: unknown): t is SandboxAssetType {
  return typeof t === 'string' && (SANDBOX_ASSET_TYPES as readonly string[]).includes(t);
}

/** Sanal portföyde işlem görebilir mi (USD/TRY döviz hariç) */
export function isTradableKey(assetType: string, symbol: string): boolean {
  if (!isSandboxAssetType(assetType)) return false;
  if (assetType === 'currency' && NON_TRADABLE_FX.has(symbol.toUpperCase())) return false;
  return true;
}

function ageFlags(type: SandboxAssetType, ageMs: number | null): { fresh: boolean; valuation_fresh: boolean; as_of: Date | null } {
  if (ageMs === null || !Number.isFinite(ageMs)) return { fresh: false, valuation_fresh: false, as_of: null };
  const age = Math.max(0, ageMs);
  return {
    fresh: age <= MAX_PRICE_AGE_MS[type],
    valuation_fresh: age <= VALUATION_MAX_AGE_MS[type],
    as_of: new Date(Date.now() - age),
  };
}

function uniqueKeys(keys: PriceKeyInput[]): Map<string, { asset_type: SandboxAssetType; symbol: string }> {
  const out = new Map<string, { asset_type: SandboxAssetType; symbol: string }>();
  for (const k of keys) {
    const symbol = String(k.symbol ?? '').trim().toUpperCase();
    if (!symbol || !isTradableKey(k.asset_type, symbol)) continue;
    out.set(assetKey(k.asset_type, symbol), { asset_type: k.asset_type as SandboxAssetType, symbol });
  }
  return out;
}

export class SandboxPrices {
  /**
   * Verilen varlıkların bilinen en son USD fiyatları (anahtar: `${asset_type}:${SYMBOL}`), tazelik bayraklarıyla.
   * Hiç fiyatı olmayan (veya USD/TRY gerektirip kuru olmayan) varlıklar haritada yer almaz.
   */
  static async getUsdPrices(keys: PriceKeyInput[], db: Queryable = pool): Promise<Map<string, UsdQuote>> {
    const out = new Map<string, UsdQuote>();
    const uniq = uniqueKeys(keys);
    if (uniq.size === 0) return out;
    const byType = new Map<SandboxAssetType, string[]>();
    for (const k of uniq.values()) byType.set(k.asset_type, [...(byType.get(k.asset_type) ?? []), k.symbol]);

    for (const type of ['stock', 'crypto'] as const) {
      const syms = byType.get(type);
      if (!syms?.length) continue;
      const r = await db.query(
        `SELECT DISTINCT ON (UPPER(symbol)) UPPER(symbol) AS sym, name, price, change_percent,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cached_at)) * 1000 AS age_ms
           FROM market_data_cache
          WHERE asset_type = $1 AND UPPER(symbol) = ANY($2::text[]) AND price > 0
          ORDER BY UPPER(symbol), cached_at DESC`,
        [type, syms]
      );
      for (const row of r.rows) {
        const price = positive(row.price);
        if (!price) continue;
        const pct = finite(row.change_percent);
        out.set(assetKey(type, row.sym), {
          asset_type: type,
          symbol: row.sym,
          name: row.name || row.sym,
          asset_class: ASSET_CLASS_OF[type],
          price_usd: price,
          sell_price_usd: price,
          quote_currency: 'USD',
          change_24h_pct: pct === null ? null : round2(pct),
          ...ageFlags(type, finite(row.age_ms)),
        });
      }
    }

    const needsUsdTry = (byType.get('currency')?.length ?? 0) > 0 || (byType.get('commodity')?.length ?? 0) > 0;
    const usd = needsUsdTry ? await PricingService.getUsdTry() : null;

    const fx = byType.get('currency');
    if (fx?.length && usd) {
      const r = await db.query(
        `SELECT DISTINCT ON (UPPER(code)) UPPER(code) AS sym, name, buying, selling, change_rate,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) * 1000 AS age_ms
           FROM currency_rates
          WHERE UPPER(code) = ANY($1::text[]) AND selling > 0
          ORDER BY UPPER(code), updated_at DESC`,
        [fx]
      );
      for (const row of r.rows) {
        const buy = currencyTradePrice(row, 'buy');
        const sell = currencyTradePrice(row, 'sell');
        if (!buy || !sell) continue;
        const pct = finite(row.change_rate);
        out.set(assetKey('currency', row.sym), {
          asset_type: 'currency',
          symbol: row.sym,
          name: row.name || row.sym,
          asset_class: 'doviz',
          price_usd: round8(buy / usd.rate),
          sell_price_usd: round8(sell / usd.rate),
          quote_currency: 'TRY',
          change_24h_pct: pct === null ? null : round2(pct),
          ...ageFlags('currency', finite(row.age_ms)),
        });
      }
    }

    const cm = byType.get('commodity');
    if (cm?.length) {
      for (const q of await SandboxPrices.commodityQuotes(cm, usd?.rate ?? null, db)) out.set(assetKey('commodity', q.symbol), q);
    }
    return out;
  }

  /**
   * İşlem için taze fiyatlar. Biri bile yoksa/bayatsa 503 PRICE_UNAVAILABLE (details.symbols) fırlatır.
   * USD/TRY dövizi ve geçersiz tipler 400 INVALID_ASSET.
   */
  static async requireTradeQuotes(keys: PriceKeyInput[], db: Queryable = pool): Promise<Map<string, UsdQuote>> {
    for (const k of keys) {
      if (!isTradableKey(k.asset_type, String(k.symbol ?? ''))) {
        const sym = String(k.symbol ?? '').toUpperCase();
        throw new AppError(
          400,
          sym === 'USD' ? 'USD nakittir; ayrıca alınıp satılamaz' : `${sym || 'Bu varlık'} sanal portföyde işlem görmez`,
          'INVALID_ASSET'
        );
      }
    }
    const quotes = await SandboxPrices.getUsdPrices(keys, db);
    const missing = [...uniqueKeys(keys).entries()].filter(([k]) => !quotes.get(k)?.fresh).map(([, v]) => v.symbol);
    if (missing.length > 0) {
      throw new AppError(503, `Güncel fiyat yok: ${missing.join(', ')}`, 'PRICE_UNAVAILABLE', { symbols: missing });
    }
    return quotes;
  }

  /** Emtia: önce sağlayıcı önbelleği (getPrice), yoksa price_history'deki en son kayıt */
  private static async commodityQuotes(symbols: string[], usdTry: number | null, db: Queryable): Promise<UsdQuote[]> {
    const out = new Map<string, UsdQuote>();
    const toUsd = (price: number, cur: 'USD' | 'TRY'): number | null => (cur === 'USD' ? price : usdTry ? price / usdTry : null);

    for (const sym of symbols) {
      try {
        const c = await providers.commodities.getPrice(sym, undefined, MAX_PRICE_AGE_MS.commodity);
        const p = positive(c?.selling);
        if (!c || !p) continue;
        const cur: 'USD' | 'TRY' = providers.commodities.isTryQuoted(c.code) ? 'TRY' : 'USD';
        const usdPrice = toUsd(p, cur);
        if (!usdPrice) continue;
        out.set(sym, {
          asset_type: 'commodity',
          symbol: sym,
          name: c.name || commodityName(sym),
          asset_class: 'emtia',
          price_usd: round8(usdPrice),
          sell_price_usd: round8(usdPrice),
          quote_currency: cur,
          change_24h_pct: null,
          ...ageFlags('commodity', Number.isFinite(c.fetchedAt) ? Date.now() - c.fetchedAt : null),
        });
      } catch (err: any) {
        console.error(`[sandbox] Emtia fiyatı okunamadı (${sym}):`, err?.message || err);
      }
    }

    const rest = symbols.filter((s) => !out.has(s));
    if (rest.length > 0) {
      for (const row of await SandboxPrices.commodityHistoryRows(rest, null, db)) {
        const usdPrice = toUsd(row.price, row.currency);
        if (!usdPrice) continue;
        out.set(row.symbol, {
          asset_type: 'commodity',
          symbol: row.symbol,
          name: commodityName(row.symbol),
          asset_class: 'emtia',
          price_usd: round8(usdPrice),
          sell_price_usd: round8(usdPrice),
          quote_currency: row.currency,
          change_24h_pct: row.change_24h_pct,
          ...ageFlags('commodity', row.age_ms),
        });
      }
    }
    return [...out.values()];
  }

  /** price_history'deki en son emtia kayıtları (symbols null → tümü; maxAgeMs verilirse yalnızca o kadar taze olanlar) */
  private static async commodityHistoryRows(
    symbols: string[] | null,
    maxAgeMs: number | null,
    db: Queryable
  ): Promise<{ symbol: string; price: number; currency: 'USD' | 'TRY'; age_ms: number | null; change_24h_pct: number | null }[]> {
    const r = await db.query(
      `SELECT l.symbol, l.price, l.currency, l.age_ms,
              (SELECT p.price FROM price_history p
                WHERE p.asset_type = 'commodity' AND p.symbol = l.symbol AND p.currency = l.currency
                  AND p.granularity IN ('m15', 'hour')
                  AND p.bucket_start <= l.bucket_start - INTERVAL '24 hours'
                  AND p.bucket_start >= l.bucket_start - INTERVAL '30 hours'
                ORDER BY p.bucket_start DESC LIMIT 1) AS prev
         FROM (
           SELECT DISTINCT ON (symbol) symbol, price, currency, bucket_start,
                  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) * 1000 AS age_ms
             FROM price_history
            WHERE asset_type = 'commodity' AND price > 0
              AND ($1::text[] IS NULL OR symbol = ANY($1::text[]))
              AND ($2::bigint IS NULL OR updated_at >= CURRENT_TIMESTAMP - ($2::bigint * INTERVAL '1 millisecond'))
              AND bucket_start <= CURRENT_TIMESTAMP
            ORDER BY symbol, updated_at DESC, bucket_start DESC
         ) l`,
      [symbols, maxAgeMs]
    );
    const out: { symbol: string; price: number; currency: 'USD' | 'TRY'; age_ms: number | null; change_24h_pct: number | null }[] = [];
    for (const row of r.rows) {
      const price = positive(row.price);
      if (!price) continue;
      const prev = positive(row.prev);
      out.push({
        symbol: String(row.symbol).toUpperCase(),
        price,
        currency: row.currency === 'TRY' ? 'TRY' : 'USD',
        age_ms: finite(row.age_ms),
        change_24h_pct: prev ? round2((price / prev - 1) * 100) : null,
      });
    }
    return out;
  }

  /**
   * Varlık arama — yalnızca İŞLEM için taze fiyatı olan varlıklar (≤ 50). q yoksa ve tip seçilmemişse
   * her tipten kotalı bir varsayılan liste döner. Fiyatlar USD.
   */
  static async searchAssets(q: string | undefined, type: SandboxAssetType | undefined, db: Queryable = pool): Promise<AssetSearchItem[]> {
    const query = (q ?? '').trim().toUpperCase();
    const types = type ? [type] : [...SANDBOX_ASSET_TYPES];
    const quota = (t: SandboxAssetType) => (query || type ? SEARCH_LIMIT : DEFAULT_QUOTAS[t]);
    const exact = query || null;
    const prefix = query ? `${escapeLike(query)}%` : null;
    const contains = query ? `%${escapeLike(query)}%` : null;
    const scoreOf = (sym: string, name: string) =>
      !query ? 2 : sym === query ? 0 : sym.startsWith(query) ? 1 : name.toUpperCase().includes(query) || sym.includes(query) ? 2 : 3;
    const rows: (AssetSearchItem & { score: number; order: number })[] = [];

    const candidates: { asset_type: SandboxAssetType; symbol: string; name: string; order: number }[] = [];
    for (const t of types) {
      if (t === 'stock' || t === 'crypto') {
        const r = await db.query(
          `SELECT UPPER(symbol) AS sym, name
             FROM market_data_cache
            WHERE asset_type = $1 AND price > 0
              AND cached_at >= CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 millisecond')
              AND ($3::text IS NULL OR UPPER(symbol) LIKE $4 OR UPPER(name) LIKE $4)
            ORDER BY (UPPER(symbol) = $3) DESC, (UPPER(symbol) LIKE $5) DESC, market_cap DESC NULLS LAST, UPPER(symbol) ASC
            LIMIT $6`,
          [t, MAX_PRICE_AGE_MS[t], exact, contains, prefix, quota(t)]
        );
        r.rows.forEach((row: any, i: number) => candidates.push({ asset_type: t, symbol: row.sym, name: row.name || row.sym, order: i }));
      } else if (t === 'currency') {
        const r = await db.query(
          `SELECT DISTINCT ON (UPPER(code)) UPPER(code) AS sym, name
             FROM currency_rates
            WHERE UPPER(code) NOT IN ('TRY', 'USD') AND selling > 0
              AND updated_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 millisecond')
              AND ($2::text IS NULL OR UPPER(code) LIKE $3 OR UPPER(name) LIKE $3)
            ORDER BY UPPER(code), updated_at DESC`,
          [MAX_PRICE_AGE_MS.currency, exact, contains]
        );
        r.rows
          .map((row: any) => ({ row, idx: FX_ORDER.indexOf(row.sym) }))
          .sort((a: any, b: any) => (a.idx < 0 ? 99 : a.idx) - (b.idx < 0 ? 99 : b.idx) || String(a.row.sym).localeCompare(String(b.row.sym)))
          .slice(0, quota(t))
          .forEach(({ row }: any, i: number) => candidates.push({ asset_type: 'currency', symbol: row.sym, name: row.name || row.sym, order: i }));
      } else {
        // Emtia: sağlayıcının popüler listesi (önbellek) + price_history'deki taze kayıtlar
        const syms = new Set<string>();
        try {
          for (const c of (await providers.commodities.getPopularPrices()) ?? []) {
            const code = String(c?.code ?? '').trim().toUpperCase();
            if (code && code.length <= 20 && positive(c?.selling)) syms.add(code);
          }
        } catch {
          /* sağlayıcı yok */
        }
        for (const row of await SandboxPrices.commodityHistoryRows(null, MAX_PRICE_AGE_MS.commodity, db)) syms.add(row.symbol);
        [...syms]
          .filter((s) => !query || s.includes(query) || commodityName(s).toUpperCase().includes(query))
          .sort((a, b) => a.localeCompare(b))
          .slice(0, quota(t))
          .forEach((s, i) => candidates.push({ asset_type: 'commodity', symbol: s, name: commodityName(s), order: i }));
      }
    }

    const quotes = await SandboxPrices.getUsdPrices(candidates, db);
    for (const c of candidates) {
      const qt = quotes.get(assetKey(c.asset_type, c.symbol));
      if (!qt || !qt.fresh) continue;
      rows.push({
        asset_type: c.asset_type,
        symbol: c.symbol,
        name: qt.name || c.name,
        asset_class: ASSET_CLASS_OF[c.asset_type],
        price_usd: qt.price_usd,
        quote_currency: qt.quote_currency,
        change_24h_pct: qt.change_24h_pct,
        score: scoreOf(c.symbol, qt.name || c.name),
        order: c.order,
      });
    }

    return rows
      .sort((a, b) => a.score - b.score || TYPE_ORDER[a.asset_type] - TYPE_ORDER[b.asset_type] || a.order - b.order)
      .slice(0, SEARCH_LIMIT)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ score: _s, order: _o, ...item }) => item);
  }

  /**
   * Günlük USD kapanış serileri (price_history 'day' kovaları, `from`dan itibaren). TL kotalı seriler
   * (döviz, TL emtia) aynı günün (yoksa önceki günün) USD/TRY kapanışıyla çevrilir. t = kova başlangıcı (Unix sn).
   */
  static async dailyUsdSeries(keys: PriceKeyInput[], from: Date, db: Queryable = pool): Promise<Map<string, SeriesPoint[]>> {
    const out = new Map<string, SeriesPoint[]>();
    const uniq = uniqueKeys(keys);
    if (uniq.size === 0) return out;
    const list = [...uniq.values()];
    const r = await db.query(
      `SELECT p.asset_type, p.symbol, p.bucket_start, p.price, p.currency
         FROM price_history p
         JOIN unnest($1::text[], $2::text[]) AS i(asset_type, symbol)
           ON p.asset_type = i.asset_type AND p.symbol = i.symbol
        WHERE p.granularity = 'day' AND p.price > 0 AND p.bucket_start >= $3::timestamptz
        ORDER BY p.bucket_start ASC`,
      [[...list.map((k) => k.asset_type), 'currency'], [...list.map((k) => k.symbol), 'USD'], from.toISOString()]
    );
    const usdTry: SeriesPoint[] = [];
    const raw = new Map<string, { t: number; v: number; cur: string }[]>();
    for (const row of r.rows) {
      const price = positive(row.price);
      if (!price) continue;
      const t = Math.floor(new Date(row.bucket_start).getTime() / 1000);
      const sym = String(row.symbol).toUpperCase();
      if (row.asset_type === 'currency' && sym === 'USD') usdTry.push({ t, v: price });
      const k = assetKey(row.asset_type, sym);
      if (!uniq.has(k)) continue;
      const cur = row.asset_type === 'currency' ? 'TRY' : String(row.currency || 'USD');
      const arr = raw.get(k) ?? [];
      arr.push({ t, v: price, cur });
      raw.set(k, arr);
    }
    usdTry.sort((a, b) => a.t - b.t);
    const rateAt = (t: number): number | null => {
      let lo = 0;
      let hi = usdTry.length - 1;
      let ans: number | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (usdTry[mid].t <= t) {
          ans = usdTry[mid].v;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans ?? (usdTry.length > 0 ? usdTry[0].v : null);
    };
    for (const [k, arr] of raw) {
      // Emtia hem TL hem USD satırı taşıyorsa USD olanı tercih et
      const hasUsd = arr.some((p) => p.cur === 'USD');
      const pts: SeriesPoint[] = [];
      const seen = new Set<number>();
      for (const p of arr) {
        if (hasUsd && p.cur !== 'USD') continue;
        if (seen.has(p.t)) continue;
        const v = p.cur === 'USD' ? p.v : (() => {
          const rate = rateAt(p.t);
          return rate ? p.v / rate : null;
        })();
        if (!v) continue;
        seen.add(p.t);
        pts.push({ t: p.t, v: round8(v) });
      }
      if (pts.length > 0) out.set(k, pts);
    }
    return out;
  }
}
