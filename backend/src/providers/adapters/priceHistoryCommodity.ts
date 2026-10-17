/**
 * Emtia → CommodityProvider ('pricehistory'): son bilinen fiyatlar `price_history` tablosundan.
 *
 * Dış API çağırmaz, anahtar istemez. Kullanım: yerel geliştirme (npm run dev:local varsayılanı) ve emtia API'si
 * olmayan kurulumlar. Fiyatlar, tabloyu kim besliyorsa odur: canlıda fiyat geçmişi işi (başka bir emtia
 * sağlayıcısının snapshot'ları), yerelde dev:local veritabanının fiyat simülasyonu (seed tickMarket). Bu yüzden
 * fiyatlar "son bilinen" fiyattır; tazelik `updated_at`'ten gelir (fetchedAt) ve işlem tazelik penceresi
 * (MAX_PRICE_AGE_MS.commodity) aynen uygulanır — tablo beslenmiyorsa fiyat bayatlar, işlem reddedilir.
 *
 * Bu adaptörün döndürdüğü tablodan okunmuş fiyatlar `fromHistory: true` taşır: fiyat geçmişi işi bunları tabloya
 * GERİ YAZMAZ (aksi halde bayat bir fiyat her turda yeniden "taze" damgalanırdı).
 *
 * Gram altın (GAU, TL) tablodaki satırlardan değil, ons altından türetilir: GOLD (USD/ons) × USD/TRY ÷ 31,1034768.
 */
import pool from '../../config/database';
import { isTryQuotedCommodity } from '../../services/commodity';
import { COMMODITY_NAMES } from '../../services/picks/config';
import { TtlCache, ttlFromEnv } from '../../utils/ttlCache';
import type { CommodityProvider, CommodityQuote } from '../types';
import { positiveNumber } from './http';
import { DERIVED_COMMODITY_CODES, TROY_OUNCE_GRAMS } from './goldApiSymbols';

export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Listede öne çıkanlar (NosyAPI servisindeki sırayla uyumlu); diğerleri alfabetik */
const PRIORITY = ['GAU', 'GOLD', 'SILVER', 'BRENT_OIL', 'CRUDEOIL', 'NATURAL_GAS', 'COPPER', 'PLATINUM', 'PALLADIUM'];

export function commodityDisplayName(code: string): string {
  return COMMODITY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

export function sortCommodities(list: CommodityQuote[]): CommodityQuote[] {
  const rank = (c: string) => {
    const i = PRIORITY.indexOf(c.toUpperCase());
    return i === -1 ? PRIORITY.length : i;
  };
  return [...list].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Her emtianın tablodaki en son fiyatı + 24 saat önceki fiyata göre değişim (%). Türetilen kodlar (GAU) hariç.
 * `now` yalnızca fetchedAt hesabı içindir (yaş SQL'de hesaplanır; Node saat diliminden bağımsız).
 */
export async function readCommodityHistoryQuotes(db: Queryable = pool, now: number = Date.now()): Promise<CommodityQuote[]> {
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
            AND NOT (symbol = ANY($1::text[]))
            AND bucket_start <= CURRENT_TIMESTAMP
          ORDER BY symbol, updated_at DESC, bucket_start DESC
       ) l`,
    [DERIVED_COMMODITY_CODES as string[]]
  );
  const out: CommodityQuote[] = [];
  for (const row of r.rows) {
    const code = String(row.symbol).toUpperCase();
    const price = positiveNumber(row.price);
    if (!price) continue;
    const ageMs = Math.max(0, Number(row.age_ms) || 0);
    const fetchedAt = now - ageMs;
    const prev = positiveNumber(row.prev);
    out.push({
      code,
      name: commodityDisplayName(code),
      buying: price,
      selling: price,
      changeRate: prev ? round4(((price - prev) / prev) * 100) : 0,
      datetime: new Date(fetchedAt).toISOString(),
      quoteCurrency: row.currency === 'TRY' ? 'TRY' : 'USD',
      fetchedAt,
      fromHistory: true,
    });
  }
  return out;
}

/** Verilen kodların ~24 saat önceki (m15/hour) fiyatı — canlı fiyatların değişim yüzdesi için */
export async function readPrices24hAgo(codes: readonly string[], db: Queryable = pool): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (codes.length === 0) return out;
  const r = await db.query(
    `SELECT DISTINCT ON (symbol) symbol, price
       FROM price_history
      WHERE asset_type = 'commodity' AND symbol = ANY($1::text[]) AND currency = 'USD'
        AND granularity IN ('m15', 'hour')
        AND bucket_start <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND bucket_start >= CURRENT_TIMESTAMP - INTERVAL '30 hours'
      ORDER BY symbol, bucket_start DESC`,
    [codes.map((c) => c.toUpperCase())]
  );
  for (const row of r.rows) {
    const p = positiveNumber(row.price);
    if (p) out.set(String(row.symbol).toUpperCase(), p);
  }
  return out;
}

/**
 * Gram altın (TL) = ons altın (USD) × USD/TRY ÷ 31,1034768. Tazelik iki girdiden eskisidir (ons ya da kur bayatsa
 * GAU da bayattır). Değişim: (1 + ons %) × (1 + kur %) − 1. Ons USD değilse ya da kur yoksa null.
 */
export async function deriveGramGold(gold: CommodityQuote | undefined, db: Queryable = pool, now: number = Date.now()): Promise<CommodityQuote | null> {
  if (!gold || gold.quoteCurrency !== 'USD') return null;
  const ounce = positiveNumber(gold.selling);
  if (!ounce) return null;
  const r = await db.query(
    `SELECT selling, change_rate, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) * 1000 AS age_ms
       FROM currency_rates WHERE UPPER(code) = 'USD' AND selling > 0 LIMIT 1`
  );
  const row = r.rows[0];
  const usdTry = positiveNumber(row?.selling);
  if (!row || !usdTry) return null;
  const usdAt = now - Math.max(0, Number(row.age_ms) || 0);
  const fetchedAt = Math.min(gold.fetchedAt, usdAt);
  const fxChange = Number(row.change_rate) || 0;
  const goldChange = Number(gold.changeRate) || 0;
  const perGram = (usd: number) => (usd * usdTry) / TROY_OUNCE_GRAMS;
  return {
    code: 'GAU',
    name: commodityDisplayName('GAU'),
    buying: perGram(positiveNumber(gold.buying) ?? ounce),
    selling: perGram(ounce),
    changeRate: round4(((1 + goldChange / 100) * (1 + fxChange / 100) - 1) * 100),
    datetime: new Date(fetchedAt).toISOString(),
    quoteCurrency: 'TRY',
    fetchedAt,
    // Tablodan geri okunmaz, her seferinde onstan hesaplanır → fiyat geçmişine yazılabilir (grafik/sparkline)
    fromHistory: false,
  };
}

/** Listeden tek kod; `maxAgeMs`'den eskiyse null (işlem tazelik penceresi) */
export function pickFresh(list: CommodityQuote[], code: string, maxAgeMs: number, now: number = Date.now()): CommodityQuote | null {
  const upper = code.trim().toUpperCase();
  const q = list.find((c) => c.code.toUpperCase() === upper);
  if (!q || !(q.selling > 0)) return null;
  return now - q.fetchedAt <= maxAgeMs ? q : null;
}

export interface PriceHistoryCommodityDeps {
  db?: Queryable;
  /** Liste okuma önbelleği (ms); varsayılan COMMODITY_HISTORY_CACHE_MS ya da 10 sn (testte 0) */
  cacheMs?: () => number;
}

export function createPriceHistoryCommodityProvider(deps: PriceHistoryCommodityDeps = {}): CommodityProvider {
  const db = deps.db ?? pool;
  const cache = new TtlCache<CommodityQuote[]>(deps.cacheMs ?? ttlFromEnv('COMMODITY_HISTORY_CACHE_MS', 10_000), 1);

  const load = async (): Promise<CommodityQuote[]> => {
    const now = Date.now();
    const rows = await readCommodityHistoryQuotes(db, now);
    const gau = await deriveGramGold(
      rows.find((q) => q.code === 'GOLD'),
      db,
      now
    );
    return sortCommodities(gau ? [gau, ...rows] : rows);
  };
  const getPopularPrices = () => cache.get('all', load);

  return {
    id: 'pricehistory',
    isConfigured: () => true,
    getList: async () => (await getPopularPrices()).map((q) => ({ code: q.code, name: q.name })),
    getPopularPrices,
    getPrice: async (code, _refreshAfterMs, maxAgeMs = DAY_MS) => pickFresh(await getPopularPrices(), code, maxAgeMs),
    isTryQuoted: (code) => isTryQuotedCommodity(code),
  };
}

export const priceHistoryCommodityProvider = createPriceHistoryCommodityProvider();
