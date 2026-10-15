import pool from '../../config/database';
import type { Queryable } from '../game/common';
import { COMMODITY_NAMES, PICK_ASSET_TYPES, PICK_LIMITS, PRICES, PickAssetType, QuoteCurrency } from './config';

/**
 * Haftalık Seçim fiyatları — YALNIZCA zaten saklanmış veriyi okur (dış API çağrısı yok, sağlayıcı iç
 * yapısına dokunmaz). Fiyatlar varlığın kendi kote para birimindedir (TL'ye çevrilmez):
 *   hisse / kripto : market_data_cache.price (USD)
 *   döviz          : currency_rates.selling (TL; TRY hariç)
 *   emtia          : price_history'deki en son kayıt (fiyat geçmişi işi 15 dk'da bir sağlayıcı önbelleğinden yazar;
 *                    para birimi satırın currency alanı)
 * Tazelik gerçek saate (veritabanının CURRENT_TIMESTAMP'i) göre ölçülür; geliştirme saati etkilemez.
 */

export interface AssetKey {
  asset_type: PickAssetType;
  symbol: string;
}

export interface CurrentPrice {
  asset_type: PickAssetType;
  symbol: string;
  name: string;
  price: number;
  quote_currency: QuoteCurrency;
  change_24h_pct: number | null;
}

export interface CapturedPrice {
  price: number;
  at: Date;
  source: 'live' | 'history';
}

export const assetKey = (assetType: string, symbol: string): string => `${assetType}:${String(symbol).toUpperCase()}`;

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

const asCurrency = (v: unknown, fallback: QuoteCurrency): QuoteCurrency => (v === 'USD' || v === 'TRY' ? v : fallback);

export const commodityName = (symbol: string): string => COMMODITY_NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase();

/** Kova bitişi (kapanış anı) — SQL ifadesi (price_history p) */
const BUCKET_END_SQL = `(p.bucket_start + CASE p.granularity
    WHEN 'm15' THEN INTERVAL '15 minutes'
    WHEN 'hour' THEN INTERVAL '1 hour'
    ELSE INTERVAL '1 day' END)`;

// ---------------------------------------------------------------------------
// Güncel fiyatlar (toplu)
// ---------------------------------------------------------------------------

function uniqueKeys(keys: AssetKey[]): Map<string, AssetKey> {
  const out = new Map<string, AssetKey>();
  for (const k of keys) {
    if (!(PICK_ASSET_TYPES as readonly string[]).includes(k.asset_type)) continue;
    const symbol = String(k.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    out.set(assetKey(k.asset_type, symbol), { asset_type: k.asset_type, symbol });
  }
  return out;
}

/** Önbelleksiz: verilen varlıkların güncel fiyatları (bulunamayanlar haritada yok). */
export async function fetchCurrentPrices(keys: AssetKey[], db: Queryable = pool): Promise<Map<string, CurrentPrice>> {
  const out = new Map<string, CurrentPrice>();
  const uniq = uniqueKeys(keys);
  if (uniq.size === 0) return out;
  const byType = new Map<PickAssetType, string[]>();
  for (const k of uniq.values()) byType.set(k.asset_type, [...(byType.get(k.asset_type) ?? []), k.symbol]);

  for (const type of ['stock', 'crypto'] as const) {
    const syms = byType.get(type);
    if (!syms?.length) continue;
    const r = await db.query(
      `SELECT DISTINCT ON (UPPER(symbol)) UPPER(symbol) AS sym, name, price, change_percent
         FROM market_data_cache
        WHERE asset_type = $1 AND UPPER(symbol) = ANY($2::text[]) AND price > 0
          AND cached_at >= CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 millisecond')
        ORDER BY UPPER(symbol), cached_at DESC`,
      [type, syms, PRICES.maxAgeMs[type]]
    );
    for (const row of r.rows) {
      const price = positive(row.price);
      if (!price) continue;
      const pct = finite(row.change_percent);
      out.set(assetKey(type, row.sym), {
        asset_type: type,
        symbol: row.sym,
        name: row.name || row.sym,
        price,
        quote_currency: 'USD',
        change_24h_pct: pct === null ? null : round2(pct),
      });
    }
  }

  const fx = byType.get('currency');
  if (fx?.length) {
    const r = await db.query(
      `SELECT DISTINCT ON (UPPER(code)) UPPER(code) AS sym, name, selling, change_rate
         FROM currency_rates
        WHERE UPPER(code) = ANY($1::text[]) AND UPPER(code) <> 'TRY' AND selling > 0
          AND updated_at >= CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 millisecond')
        ORDER BY UPPER(code), updated_at DESC`,
      [fx, PRICES.maxAgeMs.currency]
    );
    for (const row of r.rows) {
      const price = positive(row.selling);
      if (!price) continue;
      const pct = finite(row.change_rate);
      out.set(assetKey('currency', row.sym), {
        asset_type: 'currency',
        symbol: row.sym,
        name: row.name || row.sym,
        price,
        quote_currency: 'TRY',
        change_24h_pct: pct === null ? null : round2(pct),
      });
    }
  }

  const cm = byType.get('commodity');
  if (cm?.length) {
    for (const row of await commodityRows(db, cm)) out.set(assetKey('commodity', row.symbol), row);
  }
  return out;
}

/** Emtia: price_history'deki en son (taze) kayıt + ~24 saat önceki kapanışa göre değişim */
async function commodityRows(db: Queryable, symbols: string[] | null): Promise<CurrentPrice[]> {
  const r = await db.query(
    `SELECT l.symbol, l.price, l.currency,
            (SELECT p.price FROM price_history p
              WHERE p.asset_type = 'commodity' AND p.symbol = l.symbol AND p.currency = l.currency
                AND p.granularity IN ('m15', 'hour')
                AND p.bucket_start <= l.bucket_start - INTERVAL '24 hours'
                AND p.bucket_start >= l.bucket_start - INTERVAL '30 hours'
              ORDER BY p.bucket_start DESC LIMIT 1) AS prev
       FROM (
         SELECT DISTINCT ON (symbol) symbol, price, currency, bucket_start
           FROM price_history
          WHERE asset_type = 'commodity' AND price > 0
            AND ($1::text[] IS NULL OR symbol = ANY($1::text[]))
            AND updated_at >= CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 millisecond')
            AND bucket_start <= CURRENT_TIMESTAMP
          ORDER BY symbol, updated_at DESC, bucket_start DESC
       ) l`,
    [symbols, PRICES.maxAgeMs.commodity]
  );
  const out: CurrentPrice[] = [];
  for (const row of r.rows) {
    const price = positive(row.price);
    if (!price) continue;
    const prev = positive(row.prev);
    out.push({
      asset_type: 'commodity',
      symbol: String(row.symbol).toUpperCase(),
      name: commodityName(String(row.symbol)),
      price,
      quote_currency: asCurrency(row.currency, 'USD'),
      change_24h_pct: prev ? round2((price / prev - 1) * 100) : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Önbellekli güncel fiyatlar (canlı getiri) — PRICES.cacheMs (gerçek saat)
// ---------------------------------------------------------------------------

const priceCache = new Map<string, { at: number; value: CurrentPrice | null }>();

export function clearPriceCache(): void {
  priceCache.clear();
}

export async function getCurrentPrices(keys: AssetKey[]): Promise<Map<string, CurrentPrice>> {
  const out = new Map<string, CurrentPrice>();
  const uniq = uniqueKeys(keys);
  const missing: AssetKey[] = [];
  const nowMs = Date.now();
  for (const [k, key] of uniq) {
    const hit = priceCache.get(k);
    if (hit && nowMs - hit.at < PRICES.cacheMs) {
      if (hit.value) out.set(k, hit.value);
    } else {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    const fresh = await fetchCurrentPrices(missing);
    for (const key of missing) {
      const k = assetKey(key.asset_type, key.symbol);
      const v = fresh.get(k) ?? null;
      priceCache.set(k, { at: nowMs, value: v });
      if (v) out.set(k, v);
    }
    if (priceCache.size > 5000) {
      for (const [k, v] of priceCache) if (nowMs - v.at >= PRICES.cacheMs) priceCache.delete(k);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Giriş / çıkış fiyatı yakalama
// ---------------------------------------------------------------------------

export interface CaptureKey extends AssetKey {
  quote_currency: QuoteCurrency;
}

/**
 * `target` anındaki fiyatlar (anahtar: assetKey).
 *  1) İş zamanında çalışıyorsa (now − target ∈ [0, liveCaptureWindowMs]): güncel fiyat (önbelleksiz).
 *  2) Aksi halde / güncel fiyat yoksa: price_history'de target'a kadar KAPANMIŞ en son kova
 *     (kova bitişi ≤ target; ileriye bakma yok), en fazla historyLookbackMs öncesine kadar. Eşit bitişte ince kova.
 *  Hiçbiri yoksa haritada yer almaz (çağıran seçimi 'void' yapar).
 */
export async function capturePrices(keys: CaptureKey[], target: Date, now: Date, db: Queryable = pool): Promise<Map<string, CapturedPrice>> {
  const out = new Map<string, CapturedPrice>();
  const uniq = new Map<string, CaptureKey>();
  for (const k of keys) uniq.set(assetKey(k.asset_type, k.symbol), { ...k, symbol: k.symbol.toUpperCase() });
  if (uniq.size === 0) return out;

  const late = now.getTime() - target.getTime();
  if (late >= 0 && late <= PRICES.liveCaptureWindowMs) {
    const live = await fetchCurrentPrices([...uniq.values()], db);
    for (const [k, key] of uniq) {
      const p = live.get(k);
      if (p && p.quote_currency === key.quote_currency) out.set(k, { price: p.price, at: now, source: 'live' });
    }
  }

  const missing = [...uniq.entries()].filter(([k]) => !out.has(k));
  if (missing.length > 0) {
    const r = await db.query(
      `SELECT i.k, h.price, h.bucket_end
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS i(k, asset_type, symbol, currency)
         CROSS JOIN LATERAL (
           SELECT p.price, ${BUCKET_END_SQL} AS bucket_end
             FROM price_history p
            WHERE p.asset_type = i.asset_type AND p.symbol = i.symbol AND p.currency = i.currency
              AND p.bucket_start < $5::timestamptz
              AND p.bucket_start >= $5::timestamptz - INTERVAL '1 day' - ($6::int * INTERVAL '1 millisecond')
              AND ${BUCKET_END_SQL} <= $5::timestamptz
              AND ${BUCKET_END_SQL} >= $5::timestamptz - ($6::int * INTERVAL '1 millisecond')
            ORDER BY ${BUCKET_END_SQL} DESC, CASE p.granularity WHEN 'm15' THEN 0 WHEN 'hour' THEN 1 ELSE 2 END
            LIMIT 1
         ) h`,
      [
        missing.map(([k]) => k),
        missing.map(([, key]) => key.asset_type),
        missing.map(([, key]) => key.symbol),
        missing.map(([, key]) => key.quote_currency),
        target.toISOString(),
        PRICES.historyLookbackMs,
      ]
    );
    for (const row of r.rows) {
      const price = positive(row.price);
      if (price) out.set(String(row.k), { price, at: new Date(row.bucket_end), source: 'history' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seçilebilir varlıklar (arama)
// ---------------------------------------------------------------------------

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Varsayılan liste kotaları (arama yokken, tür seçilmemişken) */
const DEFAULT_QUOTAS: Record<PickAssetType, number> = { stock: 20, crypto: 15, currency: 8, commodity: 7 };
const TYPE_ORDER: Record<PickAssetType, number> = { stock: 0, crypto: 1, currency: 2, commodity: 3 };
const FX_ORDER = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'];

export async function searchAssets(q: string | undefined, type: PickAssetType | undefined, db: Queryable = pool): Promise<CurrentPrice[]> {
  const query = (q ?? '').trim().toUpperCase();
  const types = type ? [type] : [...PICK_ASSET_TYPES];
  const limit = PICK_LIMITS.assetsMax;
  const quota = (t: PickAssetType) => (query || type ? limit : DEFAULT_QUOTAS[t]);
  const exact = query || null;
  const prefix = query ? `${escapeLike(query)}%` : null;
  const contains = query ? `%${escapeLike(query)}%` : null;
  const rows: (CurrentPrice & { score: number; order: number })[] = [];
  const scoreOf = (sym: string, name: string) =>
    !query ? 2 : sym === query ? 0 : sym.startsWith(query) ? 1 : name.toUpperCase().includes(query) || sym.includes(query) ? 2 : 3;

  for (const t of types) {
    if (t === 'stock' || t === 'crypto') {
      const r = await db.query(
        `SELECT UPPER(symbol) AS sym, name, price, change_percent
           FROM market_data_cache
          WHERE asset_type = $1 AND price > 0
            AND cached_at >= CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 millisecond')
            AND ($3::text IS NULL OR UPPER(symbol) LIKE $4 OR UPPER(name) LIKE $4)
          ORDER BY (UPPER(symbol) = $3) DESC, (UPPER(symbol) LIKE $5) DESC, market_cap DESC NULLS LAST, UPPER(symbol) ASC
          LIMIT $6`,
        [t, PRICES.maxAgeMs[t], exact, contains, prefix, quota(t)]
      );
      r.rows.forEach((row: any, i: number) => {
        const price = positive(row.price);
        if (!price) return;
        const pct = finite(row.change_percent);
        rows.push({
          asset_type: t,
          symbol: row.sym,
          name: row.name || row.sym,
          price,
          quote_currency: 'USD',
          change_24h_pct: pct === null ? null : round2(pct),
          score: scoreOf(row.sym, row.name || ''),
          order: i,
        });
      });
    } else if (t === 'currency') {
      const r = await db.query(
        `SELECT DISTINCT ON (UPPER(code)) UPPER(code) AS sym, name, selling, change_rate
           FROM currency_rates
          WHERE UPPER(code) <> 'TRY' AND selling > 0
            AND updated_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 millisecond')
            AND ($2::text IS NULL OR UPPER(code) LIKE $3 OR UPPER(name) LIKE $3)
          ORDER BY UPPER(code), updated_at DESC`,
        [PRICES.maxAgeMs.currency, exact, contains]
      );
      const list = r.rows
        .map((row: any) => ({ row, idx: FX_ORDER.indexOf(row.sym) }))
        .sort((a, b) => (a.idx < 0 ? 99 : a.idx) - (b.idx < 0 ? 99 : b.idx) || String(a.row.sym).localeCompare(String(b.row.sym)))
        .slice(0, quota(t));
      list.forEach(({ row }, i) => {
        const price = positive(row.selling);
        if (!price) return;
        const pct = finite(row.change_rate);
        rows.push({
          asset_type: 'currency',
          symbol: row.sym,
          name: row.name || row.sym,
          price,
          quote_currency: 'TRY',
          change_24h_pct: pct === null ? null : round2(pct),
          score: scoreOf(row.sym, row.name || ''),
          order: i,
        });
      });
    } else {
      const list = (await commodityRows(db, null))
        .filter((c) => !query || c.symbol.includes(query) || c.name.toUpperCase().includes(query))
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .slice(0, quota(t));
      list.forEach((c, i) => rows.push({ ...c, score: scoreOf(c.symbol, c.name), order: i }));
    }
  }

  return rows
    .sort((a, b) => a.score - b.score || TYPE_ORDER[a.asset_type] - TYPE_ORDER[b.asset_type] || a.order - b.order)
    .slice(0, limit)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ score: _s, order: _o, ...item }) => item);
}
