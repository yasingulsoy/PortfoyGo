import pool from '../../config/database';
import type { AssetType } from '../../types';

/**
 * Portföy danışmanının varlık sınıfları ve her sınıfın:
 *  - fiyat serisi bileşenleri (istatistik için; price_history günlük kovaları, TL'ye çevrilir)
 *  - uygulanabilir enstrümanları (planı uygularken alınacak semboller ve sınıf içi ağırlıkları)
 *
 * Sınıflar SABİT sıradadır (ASSET_CLASSES); tüm vektör/matrisler bu sırayı kullanır.
 */

export const ASSET_CLASSES = ['cash_try', 'usd', 'eur', 'gold', 'us_stocks', 'crypto'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const CLASS_LABELS: Record<AssetClass, string> = {
  cash_try: 'TL Nakit',
  usd: 'Amerikan Doları',
  eur: 'Euro',
  gold: 'Altın',
  us_stocks: 'ABD Hisseleri',
  crypto: 'Kripto (BTC/ETH)',
};

/**
 * TL nakdin varsayılan yıllık getirisi (basit, TL bazında; ör. mevduat / para piyasası).
 * ADVISOR_TRY_CASH_RETURN ortam değişkeniyle (0–2 arası ondalık, ör. 0.40) değiştirilebilir.
 */
export const DEFAULT_TRY_CASH_RETURN = 0.4;

export function getTryCashReturn(): number {
  const raw = (process.env.ADVISOR_TRY_CASH_RETURN || '').trim();
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= 0 && v <= 2 ? v : DEFAULT_TRY_CASH_RETURN;
}

/** Fiyat geçmişi penceresi (gün) ve bir bileşenin "geçmişi var" sayılması için gereken en az nokta */
export const HISTORY_DAYS = 730;
export const MIN_COMPONENT_POINTS = 120;
/** ABD hisse sepetindeki en fazla sembol sayısı (eşit ağırlıklı) */
export const MAX_STOCKS = 10;
/** Önbellekte / geçmişte hiç hisse yoksa kullanılacak varsayılan sepet */
export const DEFAULT_STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'];
/** Kripto sepeti (sabit ağırlık) */
export const CRYPTO_BASKET = [
  { symbol: 'BTC', weight: 0.7, name: 'Bitcoin' },
  { symbol: 'ETH', weight: 0.3, name: 'Ethereum' },
] as const;

export interface Instrument {
  symbol: string;
  asset_type: AssetType;
  name: string;
  /** Sınıf içi ağırlık (toplam 1) */
  weight: number;
}

/** Sınıfın günlük TL serisini oluşturan bileşen (USD fiyatlı bileşenler USD/TRY ile çevrilir) */
export interface SeriesComponent {
  asset_type: AssetType;
  symbol: string;
  weight: number;
  currency: 'TRY' | 'USD';
}

export interface ClassSpec {
  class: AssetClass;
  label: string;
  instruments: Instrument[];
  /** Boş: sabit getirili (TL nakit) */
  components: SeriesComponent[];
}

export interface Universe {
  classes: ClassSpec[];
}

export const seriesKey = (assetType: string, symbol: string) => `${assetType}:${symbol.toUpperCase()}`;
export const USD_SERIES_KEY = seriesKey('currency', 'USD');

export interface UniverseInputs {
  /** price_history günlük nokta sayıları: "asset_type:SYMBOL" → n */
  historyCounts: Map<string, number>;
  /** market_data_cache'teki güncel hisseler */
  cachedStocks: { symbol: string; name: string }[];
  /** Görünen isimler: "asset_type:SYMBOL" → ad */
  names?: Map<string, string>;
}

/**
 * Saf: veri durumundan evreni kurar.
 * - gold: commodity:GAU (TL, gram) geçmişi varsa o; yoksa commodity:GOLD (USD, ons) × USD/TRY
 * - us_stocks: önbellekte olup geçmişi olan hisseler (en çok geçmişi olan ≤ 10), eşit ağırlık
 * - crypto: BTC %70 / ETH %30
 */
export function buildUniverse(input: UniverseInputs): Universe {
  const { historyCounts, cachedStocks } = input;
  const names = input.names ?? new Map<string, string>();
  const count = (type: string, sym: string) => historyCounts.get(seriesKey(type, sym)) ?? 0;
  const nameOf = (type: string, sym: string, fallback: string) => names.get(seriesKey(type, sym)) || fallback;

  const useGau = count('commodity', 'GAU') >= MIN_COMPONENT_POINTS;
  const goldSym = useGau ? 'GAU' : 'GOLD';
  const goldName = useGau ? nameOf('commodity', 'GAU', 'Gram Altın') : nameOf('commodity', 'GOLD', 'Altın (ons)');

  // ABD hisseleri: önce yeterli geçmişi olanlar, yoksa biraz geçmişi olanlar, yoksa önbellektekiler
  const cached = [...new Map(cachedStocks.map((s) => [s.symbol.toUpperCase(), s.name])).entries()].map(([symbol, name]) => ({
    symbol,
    name,
    n: count('stock', symbol),
  }));
  const byHistory = (a: { n: number; symbol: string }, b: { n: number; symbol: string }) =>
    b.n - a.n || a.symbol.localeCompare(b.symbol);
  let stocks = cached.filter((s) => s.n >= MIN_COMPONENT_POINTS).sort(byHistory);
  if (stocks.length === 0) stocks = cached.filter((s) => s.n >= 2).sort(byHistory);
  if (stocks.length === 0) stocks = cached.sort((a, b) => a.symbol.localeCompare(b.symbol));
  let stockList = stocks.slice(0, MAX_STOCKS).map((s) => ({ symbol: s.symbol, name: s.name || s.symbol }));
  if (stockList.length === 0) {
    stockList = DEFAULT_STOCKS.map((symbol) => ({ symbol, name: nameOf('stock', symbol, symbol) }));
  }
  const stockWeight = 1 / stockList.length;

  const classes: ClassSpec[] = [
    { class: 'cash_try', label: CLASS_LABELS.cash_try, instruments: [], components: [] },
    {
      class: 'usd',
      label: CLASS_LABELS.usd,
      instruments: [{ symbol: 'USD', asset_type: 'currency', name: nameOf('currency', 'USD', 'Amerikan Doları'), weight: 1 }],
      components: [{ asset_type: 'currency', symbol: 'USD', weight: 1, currency: 'TRY' }],
    },
    {
      class: 'eur',
      label: CLASS_LABELS.eur,
      instruments: [{ symbol: 'EUR', asset_type: 'currency', name: nameOf('currency', 'EUR', 'Euro'), weight: 1 }],
      components: [{ asset_type: 'currency', symbol: 'EUR', weight: 1, currency: 'TRY' }],
    },
    {
      class: 'gold',
      label: CLASS_LABELS.gold,
      instruments: [{ symbol: goldSym, asset_type: 'commodity', name: goldName, weight: 1 }],
      components: [{ asset_type: 'commodity', symbol: goldSym, weight: 1, currency: useGau ? 'TRY' : 'USD' }],
    },
    {
      class: 'us_stocks',
      label: CLASS_LABELS.us_stocks,
      instruments: stockList.map((s) => ({ symbol: s.symbol, asset_type: 'stock' as const, name: s.name, weight: stockWeight })),
      components: stockList.map((s) => ({ asset_type: 'stock' as const, symbol: s.symbol, weight: stockWeight, currency: 'USD' as const })),
    },
    {
      class: 'crypto',
      label: CLASS_LABELS.crypto,
      instruments: CRYPTO_BASKET.map((c) => ({
        symbol: c.symbol,
        asset_type: 'crypto' as const,
        name: nameOf('crypto', c.symbol, c.name),
        weight: c.weight,
      })),
      components: CRYPTO_BASKET.map((c) => ({ asset_type: 'crypto' as const, symbol: c.symbol, weight: c.weight, currency: 'USD' as const })),
    },
  ];
  return { classes };
}

/** Veritabanından (price_history, market_data_cache, currency_rates) evreni kurar. Sadece okur. */
export async function loadUniverse(): Promise<Universe> {
  const [hist, stocks, crypto, fx] = await Promise.all([
    pool.query(
      `SELECT asset_type, symbol, COUNT(*)::int AS n
         FROM price_history
        WHERE granularity = 'day'
          AND bucket_start >= now() - ($1::int * INTERVAL '1 day')
        GROUP BY asset_type, symbol`,
      [HISTORY_DAYS]
    ),
    pool.query(
      `SELECT UPPER(symbol) AS symbol, MAX(name) AS name
         FROM market_data_cache
        WHERE asset_type = 'stock' AND price > 0 AND cached_at >= now() - INTERVAL '7 days'
        GROUP BY UPPER(symbol)`
    ),
    pool.query(
      `SELECT UPPER(symbol) AS symbol, MAX(name) AS name
         FROM market_data_cache
        WHERE asset_type = 'crypto' AND UPPER(symbol) = ANY($1)
        GROUP BY UPPER(symbol)`,
      [CRYPTO_BASKET.map((c) => c.symbol)]
    ),
    pool.query(`SELECT UPPER(code) AS code, name FROM currency_rates WHERE UPPER(code) IN ('USD', 'EUR')`),
  ]);

  const historyCounts = new Map<string, number>();
  for (const r of hist.rows) historyCounts.set(seriesKey(r.asset_type, r.symbol), Number(r.n));
  const names = new Map<string, string>();
  for (const r of crypto.rows) if (r.name) names.set(seriesKey('crypto', r.symbol), r.name);
  for (const r of fx.rows) if (r.name) names.set(seriesKey('currency', r.code), r.name);

  return buildUniverse({
    historyCounts,
    cachedStocks: stocks.rows.map((r) => ({ symbol: String(r.symbol), name: String(r.name || r.symbol) })),
    names,
  });
}

/** Portföydeki bir varlığı danışman sınıfına eşler (eşleşmeyenler: 'other'). */
export const GOLD_CODES = new Set(['GAU', 'GOLD', 'GOLDTRY', 'XAU', 'XAUTRY', 'XAUUSD', 'ALTIN', 'GRAM_ALTIN']);

export function classifyHolding(assetType: string, symbol: string): AssetClass | 'other' {
  const sym = symbol.toUpperCase();
  switch (assetType) {
    case 'currency':
      return sym === 'USD' ? 'usd' : sym === 'EUR' ? 'eur' : 'other';
    case 'commodity':
      return GOLD_CODES.has(sym) ? 'gold' : 'other';
    case 'stock':
      return 'us_stocks';
    case 'crypto':
      return 'crypto';
    default:
      return 'other';
  }
}
