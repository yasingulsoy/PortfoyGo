import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import {
  AWARD_TITLE_SQL,
  INSERT_SEASON_SQL,
  generateInviteCode,
  previousSeasonSlug,
  seasonNameFor,
  seasonSlugFor,
} from '../utils/competition';
import { STOCK_UNIVERSE } from '../providers/stockUniverse';
import { DAY_MS, GRANULARITY_MS, bucketStart, istanbulDayStart } from '../utils/priceBuckets';
import { completedHoursEnd, loadHourlySeries, type ArenaInstrumentCode } from '../services/arena/instruments';
import { pickWindows, randomSeed } from '../services/arena/paths';
import {
  CRASH_DRILL_BRIEFING,
  CRASH_DRILL_DEBRIEF,
  CRASH_DRILL_DESCRIPTION,
  CRASH_DRILL_FROM,
  CRASH_DRILL_SERIES,
  CRASH_DRILL_SLUG,
  CRASH_DRILL_TITLE,
  CRASH_DRILL_TO,
  SYNTHETIC_LICENSE_NOTE,
  SYNTHETIC_SOURCE,
  generateCrashDrillSeries,
} from '../services/scenarios/synthetic';

/**
 * Yerel geliştirme veritabanı için örnek veri (SADECE yerel PGlite; canlı veritabanında KULLANMAYIN).
 *
 * - seedMarketData: döviz kurları + hisse/kripto fiyat cache'i (her açılışta tazelenir)
 * - seedUsers: demo yönetici + örnek kullanıcılar, portföyler ve işlem geçmişi (yalnızca bir kez)
 * - seedCompetitions: güncel + geçen ayın (bitmiş, ödüllü) sezonu ve "Ofis Ligi" (her açılışta, idempotent)
 * - seedPriceHistory: fiyat geçmişi grafikleri için sentetik geçmiş (~400 gün, 15 gün saatlik, 3 gün m15;
 *   her açılışta, idempotent — yeterli geçmişi olan varlıklar atlanır)
 * - seedArena: Arena için emtia fiyat geçmişi (altın, Brent, gümüş; USD) + örnek meydan okumalar
 *   (yaklaşan "Cuma Akşamı Kapışması" ve demo kullanıcının 2. olduğu bitmiş bir meydan okuma); idempotent
 * - tickMarket: fiyatları küçük rastgele adımlarla oynatır ve cached_at'i tazeler; böylece
 *   işlem fiyat tazelik kontrolleri (15 dk) çevrimdışı çalışırken de geçer.
 */

export const DEMO_EMAIL = 'demo@portfoygo.local';
export const DEMO_USERNAME = 'demo';

/** Kayıt akışıyla aynı bcrypt maliyeti (services/auth.ts → BCRYPT_ROUNDS) */
const BCRYPT_ROUNDS = 10;
const COMMISSION_RATE = 0.0025;
const INITIAL_BALANCE = 100_000;

/**
 * Döviz kurları (TL / birim): TCMB 16.10.2026 gösterge niteliğindeki döviz alış/satış kurları; değişim 15.10.2026
 * bültenine göre. Yalnızca YENİ satırlar eklenir (mevcut yerel veritabanındaki kurların üzerine yazılmaz); güncel kur
 * için LOCAL_LIVE_PRICES=1 (TCMB) ya da `npm run dev:local -- --reset`.
 */
export const CURRENCY_SEED: { code: string; name: string; buying: number; selling: number; change: number }[] = [
  { code: 'USD', name: 'Amerikan Doları', buying: 49.3573, selling: 49.4463, change: 0.05 },
  { code: 'EUR', name: 'Euro', buying: 55.5179, selling: 55.618, change: 0.37 },
  { code: 'GBP', name: 'İngiliz Sterlini', buying: 65.6633, selling: 66.0056, change: 0.63 },
  { code: 'CHF', name: 'İsviçre Frangı', buying: 59.7521, selling: 60.1358, change: 0.77 },
  { code: 'JPY', name: 'Japon Yeni', buying: 0.311708, selling: 0.313773, change: -0.02 },
  { code: 'AUD', name: 'Avustralya Doları', buying: 34.2637, selling: 34.4871, change: 0.53 },
  { code: 'CAD', name: 'Kanada Doları', buying: 34.8079, selling: 34.9649, change: 0.38 },
  { code: 'SAR', name: 'Suudi Arabistan Riyali', buying: 13.1524, selling: 13.1761, change: 0.06 },
  { code: 'DKK', name: 'Danimarka Kronu', buying: 7.4155, selling: 7.4519, change: 0.37 },
  { code: 'SEK', name: 'İsveç Kronu', buying: 4.9631, selling: 5.0145, change: 0.79 },
  { code: 'NOK', name: 'Norveç Kronu', buying: 5.2129, selling: 5.248, change: 0.8 },
  { code: 'KWD', name: 'Kuveyt Dinarı', buying: 159.275, selling: 161.359, change: 0.05 },
  { code: 'CNY', name: 'Çin Yuanı', buying: 7.34, selling: 7.436, change: 0.12 },
  { code: 'AED', name: 'BAE Dirhemi', buying: 13.3633, selling: 13.5382, change: 0.05 },
  { code: 'QAR', name: 'Katar Riyali', buying: 13.4645, selling: 13.6407, change: 0.05 },
  { code: 'AZN', name: 'Azerbaycan Manatı', buying: 28.871, selling: 29.2488, change: 0.05 },
  { code: 'RUB', name: 'Rus Rublesi', buying: 0.58651, selling: 0.59419, change: 0.1 },
  { code: 'RON', name: 'Rumen Leyi', buying: 10.3462, selling: 10.4816, change: 0.37 },
];

type MarketSeed = {
  asset_type: 'stock' | 'crypto';
  symbol: string;
  name: string;
  /** USD */
  price: number;
  change_percent: number;
  market_cap: number;
  volume: number;
  metadata: Record<string, unknown>;
};

const stock = (symbol: string, name: string, price: number, chg: number, capB: number, industry: string): MarketSeed => ({
  asset_type: 'stock',
  symbol,
  name,
  price,
  change_percent: chg,
  market_cap: Math.round(capB * 1e9),
  volume: 0,
  metadata: { symbol, logo: null, industry },
});

const coin = (symbol: string, id: string, name: string, price: number, chg: number, capB: number, volB: number): MarketSeed => ({
  asset_type: 'crypto',
  symbol,
  name,
  price,
  change_percent: chg,
  market_cap: Math.round(capB * 1e9),
  volume: Math.round(volB * 1e9),
  metadata: { id, image: '' },
});

/**
 * Piyasa cache'i (USD). Yalnızca YENİ semboller eklenir; mevcut satırların fiyatı korunur (simülasyon sürer).
 * - Hisseler: varsayılan evren (providers/stockUniverse.ts, 48 büyük ABD şirketi); fiyat / piyasa değeri YAKLAŞIK
 *   örnek değerlerdir (anahtarsız ücretsiz ABD hisse kaynağı yok; gerçek fiyat için LOCAL_FINNHUB_API_KEY).
 * - Kriptolar: CoinGecko piyasa değerine göre ilk 50, 17.10.2026 fiyatları (LOCAL_LIVE_PRICES=1 ile canlı).
 */
const STOCK_SEED_VALUES: Record<string, [price: number, changePct: number, capB: number]> = {
  AAPL: [238.4, 0.82, 3580],
  MSFT: [512.1, -0.35, 3810],
  NVDA: [182.6, 1.94, 4450],
  GOOGL: [241.3, 0.41, 2930],
  AMZN: [226.8, -0.62, 2420],
  META: [731.5, 1.12, 1840],
  TSLA: [418.2, -2.31, 1350],
  AVGO: [345.2, 1.05, 1630],
  ORCL: [292.4, -0.84, 820],
  AMD: [164.9, 2.48, 267],
  NFLX: [1204.7, 0.27, 512],
  CRM: [247.6, -0.42, 237],
  ADBE: [352.8, 0.31, 150],
  INTC: [36.9, 1.67, 161],
  CSCO: [69.4, 0.22, 275],
  QCOM: [168.3, -0.71, 182],
  IBM: [282.5, 0.38, 263],
  PLTR: [182.1, 3.12, 431],
  UBER: [96.7, -1.08, 201],
  JPM: [301.2, -0.18, 828],
  V: [345.6, 0.24, 668],
  MA: [571.3, 0.35, 518],
  BAC: [50.9, -0.27, 377],
  GS: [778.4, 0.92, 238],
  MS: [157.2, 0.61, 251],
  PYPL: [69.8, -1.35, 67],
  XOM: [114.6, 0.47, 488],
  CVX: [155.3, 0.29, 311],
  WMT: [102.4, 0.15, 817],
  COST: [921.5, -0.38, 409],
  HD: [392.7, 0.56, 391],
  KO: [69.1, 0.12, 297],
  PEP: [148.2, -0.21, 203],
  MCD: [302.6, 0.08, 216],
  SBUX: [84.3, -0.93, 96],
  NKE: [68.9, -1.44, 102],
  DIS: [112.4, 0.66, 203],
  LLY: [812.3, 1.21, 728],
  UNH: [352.1, -0.57, 319],
  JNJ: [189.7, 0.19, 457],
  ABBV: [228.4, 0.44, 403],
  MRK: [84.6, -0.33, 212],
  PFE: [24.9, -0.48, 141],
  BA: [216.8, 1.36, 164],
  CAT: [498.3, 0.87, 233],
  GE: [301.5, 0.72, 320],
  T: [27.4, -0.15, 196],
  VZ: [41.2, 0.09, 174],
};

export const MARKET_SEED: MarketSeed[] = [
  ...STOCK_UNIVERSE.filter((u) => STOCK_SEED_VALUES[u.symbol]).map((u) => {
    const [price, chg, capB] = STOCK_SEED_VALUES[u.symbol];
    return stock(u.symbol, u.name, price, chg, capB, u.industry);
  }),
  coin('BTC', 'bitcoin', 'Bitcoin', 81447, -0.96, 1637, 22.2),
  coin('ETH', 'ethereum', 'Ethereum', 2427.92, -1.74, 296.6, 8.8),
  coin('USDT', 'tether', 'Tether', 0.9988, -0.03, 183.5, 41.5),
  coin('BNB', 'binancecoin', 'BNB', 719.49, -1.34, 95.8, 0.5),
  coin('XRP', 'ripple', 'XRP', 1.3, -2.91, 82.1, 1.1),
  coin('USDC', 'usd-coin', 'USDC', 0.9996, -0.02, 72.5, 13.5),
  coin('SOL', 'solana', 'Solana', 104.29, -1.77, 61.5, 2.3),
  coin('TRX', 'tron', 'TRON', 0.3365, 0.38, 32, 0.3),
  coin('FIGR_HELOC', 'figure-heloc', 'Figure Heloc', 1.034, 0.29, 24.8, 0.1),
  coin('ZEC', 'zcash', 'Zcash', 1165.69, -5.1, 19.8, 0.7),
  coin('HYPE', 'hyperliquid', 'Hyperliquid', 78.79, -3.53, 17.5, 0.6),
  coin('DOGE', 'dogecoin', 'Dogecoin', 0.07997, -2.66, 12.5, 0.6),
  coin('XMR', 'monero', 'Monero', 554.62, -0.7, 10.4, 0.1),
  coin('USDS', 'usds', 'USDS', 0.9996, -0.03, 10.2, 0.1),
  coin('WBT', 'whitebit', 'WhiteBIT Coin', 79.88, -1.29, 9.5, 0.1),
  coin('LINK', 'chainlink', 'Chainlink', 12.1, -4.23, 9.3, 0.2),
  coin('ADA', 'cardano', 'Cardano', 0.2222, -3.54, 8.3, 0.2),
  coin('LEO', 'leo-token', 'LEO Token', 9.05, 0.06, 8.3, 0.01),
  coin('NEAR', 'near', 'NEAR Protocol', 5.08, -3.91, 6.7, 0.8),
  coin('XLM', 'stellar', 'Stellar', 0.1787, -2.78, 6.3, 0.1),
  coin('RAIN', 'rain', 'Rain', 0.008825, -4.02, 6.3, 0.01),
  coin('BCH', 'bitcoin-cash', 'Bitcoin Cash', 272.97, -3.16, 5.5, 0.1),
  coin('USDE', 'ethena-usde', 'Ethena USDe', 0.9992, -0.03, 4.7, 0.05),
  coin('LTC', 'litecoin', 'Litecoin', 59.51, -2.8, 4.6, 0.2),
  coin('DAI', 'dai', 'Dai', 1, -0.03, 4.5, 0.2),
  coin('UNI', 'uniswap', 'Uniswap', 7.21, -3.54, 4.5, 0.3),
  coin('AVAX', 'avalanche-2', 'Avalanche', 9.95, -3.37, 4.4, 0.3),
  coin('SUI', 'sui', 'Sui', 0.9993, -4.79, 4.1, 0.8),
  coin('CC', 'canton-network', 'Canton', 0.1031, -0.69, 4.1, 0.02),
  coin('USD1', 'usd1-wlfi', 'USD1', 0.9989, -0.03, 4, 0.8),
  coin('GRAM', 'the-open-network', 'Gram (prev. Toncoin)', 1.35, -3.11, 3.8, 0.05),
  coin('HBAR', 'hedera-hashgraph', 'Hedera', 0.08304, -4.43, 3.7, 0.1),
  coin('XAUT', 'tether-gold', 'Tether Gold', 4156.96, -0.33, 3.4, 0.1),
  coin('BTW', 'bitway', 'Bitway', 2.22, 32.09, 3.3, 0.02),
  coin('USDG', 'global-dollar', 'Global Dollar', 1, -0.03, 3.1, 0.5),
  coin('TAO', 'bittensor', 'Bittensor', 271.78, -5.32, 3.1, 0.1),
  coin('SHIB', 'shiba-inu', 'Shiba Inu', 0.00000504, -2.37, 3, 0.04),
  coin('QNT', 'quant-network', 'Quant', 203.69, -2.71, 3, 0.1),
  coin('CRO', 'crypto-com-chain', 'Cronos', 0.05772, -3.08, 2.9, 0.02),
  coin('PYUSD', 'paypal-usd', 'PayPal USD', 0.9995, -0.03, 2.8, 0.1),
  coin('ENA', 'ethena', 'Ethena', 0.1951, -5.27, 2.6, 0.2),
  coin('OKB', 'okb', 'OKB', 116.68, -2.15, 2.5, 0.02),
  coin('RLUSD', 'ripple-usd', 'Ripple USD', 0.9999, -0.03, 2.4, 0.1),
  coin('AAVE', 'aave', 'Aave', 154.65, -5.2, 2.4, 0.2),
  coin('USYC', 'hashnote-usyc', 'Circle USYC', 1.14, 0.03, 2.4, 0.01),
  coin('USDY', 'ondo-us-dollar-yield', 'Ondo US Dollar Yield', 1.15, -0.03, 2.4, 0.01),
  coin('BUIDL', 'blackrock-usd-institutional-digital-liquidity-fund', 'BlackRock USD Institutional Digital Liquidity Fund', 1, 0, 2.2, 0.01),
  coin('ONDO', 'ondo-finance', 'Ondo', 0.4488, -4.48, 2.2, 0.1),
  coin('PUMP', 'pump-fun', 'Pump.fun', 0.004529, 1.82, 2.1, 0.1),
  coin('WLD', 'worldcoin-wld', 'Worldcoin', 0.5111, -5.94, 2, 0.3),
];

const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

const WEEK_KEY_SQL = `to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IYYY')
  || '-' || to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IW')`;

/** Döviz kurları + piyasa cache'i (idempotent; her çağrıda cached_at/updated_at tazelenir). */
export async function seedMarketData(pool: Pool): Promise<void> {
  for (const c of CURRENCY_SEED) {
    await pool.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [c.code, c.name, c.buying, c.selling, c.change]
    );
  }
  for (const m of MARKET_SEED) {
    const prev = m.price / (1 + m.change_percent / 100);
    await pool.query(
      `INSERT INTO market_data_cache
         (asset_type, symbol, name, price, change, change_percent, volume, market_cap,
          previous_close, open_price, high_price, low_price, metadata, cached_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')
       ON CONFLICT (asset_type, symbol) DO UPDATE SET
         cached_at = CURRENT_TIMESTAMP,
         expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'`,
      [
        m.asset_type,
        m.symbol,
        m.name,
        m.price,
        m.price - prev,
        m.change_percent,
        m.volume,
        m.market_cap,
        prev,
        Math.max(m.price, prev) * 1.006,
        Math.min(m.price, prev) * 0.994,
        JSON.stringify(m.metadata),
      ]
    );
  }
}

/** tickMarket seçenekleri: LOCAL_LIVE_PRICES=1 iken canlı kaynaktan beslenen veri simülasyonla bozulmasın */
export interface TickMarketOptions {
  /** Hisse satırlarına dokunma (Finnhub canlı) */
  skipStocks?: boolean;
  /** Kripto satırlarına dokunma (CoinGecko canlı) */
  skipCrypto?: boolean;
  /** Döviz kurlarına dokunma (TCMB / Frankfurter) */
  skipCurrencies?: boolean;
  /** Bu emtia kodlarına dokunma (ör. gold-api.com'dan canlı gelen metaller) */
  skipCommodityCodes?: readonly string[];
}

/**
 * Fiyatları ±%0,4'lük rastgele adımlarla günceller ve tazelik zaman damgalarını yeniler.
 * (Gerçek piyasa verisi değildir; sadece çevrimdışı geliştirme içindir.) Gram altın (GAU) türetilmiş olduğundan
 * (ons × USD/TRY, bkz. providers/adapters/priceHistoryCommodity.ts) hiçbir zaman simüle edilmez.
 */
export async function tickMarket(pool: Pool, opts: TickMarketOptions = {}): Promise<void> {
  const types = [...(opts.skipStocks ? [] : ['stock']), ...(opts.skipCrypto ? [] : ['crypto'])];
  if (types.length > 0) {
    await pool.query(
      `UPDATE market_data_cache
          SET price = GREATEST(price * (1 + (random() - 0.5) * 0.008), 0.0001),
              cached_at = CURRENT_TIMESTAMP,
              expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'
        WHERE asset_type = ANY($1::text[])`,
      [types]
    );
    await pool.query(
      `UPDATE market_data_cache
          SET change = price - previous_close,
              change_percent = CASE WHEN previous_close > 0 THEN (price - previous_close) / previous_close * 100 ELSE 0 END,
              high_price = GREATEST(COALESCE(high_price, price), price),
              low_price = LEAST(COALESCE(low_price, price), price)
        WHERE previous_close IS NOT NULL AND asset_type = ANY($1::text[])`,
      [types]
    );
  }
  if (!opts.skipCurrencies) {
    await pool.query(
      `UPDATE currency_rates
          SET buying = buying * f, selling = selling * f, updated_at = CURRENT_TIMESTAMP
         FROM (SELECT 1 + (random() - 0.5) * 0.001 AS f) r`
    );
  }
  // Emtia: yerelde sağlayıcı yok; fiyat geçmişindeki son fiyattan güncel saatlik kova yazılır (Piyasalar > Emtia,
  // Sanal portföy / Haftalık Seçim / Arena emtiayı price_history'deki taze kayıttan okur — yoksa altın vb. "bayat" görünür).
  const skipCodes = ['GAU', ...(opts.skipCommodityCodes ?? [])].map((c) => c.toUpperCase());
  await pool.query(
    `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
     SELECT 'commodity', l.symbol, 'hour', date_trunc('hour', CURRENT_TIMESTAMP), l.price * (1 + (random() - 0.5) * 0.004), l.currency, CURRENT_TIMESTAMP
       FROM (SELECT DISTINCT ON (symbol) symbol, currency, price
               FROM price_history WHERE asset_type = 'commodity' AND price > 0 AND NOT (symbol = ANY($1::text[]))
              ORDER BY symbol, bucket_start DESC) l
     ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price, updated_at = EXCLUDED.updated_at`,
    [skipCodes]
  );
}

type Position = { symbol: string; asset_type: 'stock' | 'crypto'; quantity: number; /** ortalama maliyet = güncel × (1 − drift) */ drift: number; daysAgo: number };

const SAMPLE_USERS: { username: string; email: string; weekStartFactor: number; positions: Position[]; sells?: { symbol: string; quantity: number; gain: number; daysAgo: number }[] }[] = [
  {
    username: 'aylin_trader',
    email: 'aylin@portfoygo.local',
    weekStartFactor: 0.97,
    positions: [
      { symbol: 'NVDA', asset_type: 'stock', quantity: 4, drift: 0.22, daysAgo: 40 },
      { symbol: 'AAPL', asset_type: 'stock', quantity: 3, drift: 0.08, daysAgo: 25 },
      { symbol: 'ETH', asset_type: 'crypto', quantity: 0.15, drift: 0.15, daysAgo: 18 },
    ],
    sells: [{ symbol: 'TSLA', quantity: 2, gain: 0.12, daysAgo: 9 }],
  },
  {
    username: 'mert_kripto',
    email: 'mert@portfoygo.local',
    weekStartFactor: 1.04,
    positions: [
      { symbol: 'BTC', asset_type: 'crypto', quantity: 0.012, drift: 0.09, daysAgo: 33 },
      { symbol: 'SOL', asset_type: 'crypto', quantity: 2, drift: -0.06, daysAgo: 12 },
      { symbol: 'DOGE', asset_type: 'crypto', quantity: 1000, drift: -0.14, daysAgo: 5 },
    ],
  },
  {
    username: 'zeynep_uzun',
    email: 'zeynep@portfoygo.local',
    weekStartFactor: 0.995,
    positions: [
      { symbol: 'MSFT', asset_type: 'stock', quantity: 2, drift: 0.05, daysAgo: 60 },
      { symbol: 'JPM', asset_type: 'stock', quantity: 2, drift: 0.11, daysAgo: 52 },
      { symbol: 'GOOGL', asset_type: 'stock', quantity: 2, drift: 0.03, daysAgo: 21 },
    ],
  },
  {
    username: 'can_hisse',
    email: 'can@portfoygo.local',
    weekStartFactor: 1.01,
    positions: [
      { symbol: 'TSLA', asset_type: 'stock', quantity: 2, drift: -0.18, daysAgo: 14 },
      { symbol: 'AMD', asset_type: 'stock', quantity: 4, drift: 0.04, daysAgo: 7 },
    ],
    sells: [{ symbol: 'META', quantity: 1, gain: -0.07, daysAgo: 3 }],
  },
];

const DEMO_POSITIONS: Position[] = [
  { symbol: 'AAPL', asset_type: 'stock', quantity: 2, drift: 0.04, daysAgo: 6 },
  { symbol: 'BTC', asset_type: 'crypto', quantity: 0.004, drift: 0.02, daysAgo: 2 },
];

async function insertTx(
  client: PoolClient,
  userId: string,
  type: 'buy' | 'sell',
  m: MarketSeed,
  quantity: number,
  priceTRY: number,
  daysAgo: number
): Promise<number> {
  const total = type === 'buy' ? ceil2(quantity * priceTRY) : Math.floor(quantity * priceTRY * 100) / 100;
  const commission = ceil2(total * COMMISSION_RATE);
  const net = type === 'buy' ? round2(total + commission) : round2(total - commission);
  await client.query(
    `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP - ($11::int * INTERVAL '1 day') - (random() * INTERVAL '8 hours'))`,
    [userId, type, m.symbol, m.name, m.asset_type, quantity, priceTRY, total, commission, net, daysAgo]
  );
  return net;
}

async function createUserWithPortfolio(
  client: PoolClient,
  u: { username: string; email: string; passwordHash: string; isAdmin: boolean; weekStartFactor: number; positions: Position[]; sells?: { symbol: string; quantity: number; gain: number; daysAgo: number }[] },
  usdTry: number
): Promise<void> {
  const ins = await client.query(
    `INSERT INTO users (username, email, password_hash, email_verified, is_admin, balance,
                        week_baseline_equity, week_baseline_iso_key, created_at)
     VALUES ($1, $2, $3, true, $4, $5, $5, ${WEEK_KEY_SQL}, CURRENT_TIMESTAMP - INTERVAL '70 days')
     RETURNING id`,
    [u.username, u.email, u.passwordHash, u.isAdmin, INITIAL_BALANCE]
  );
  const userId: string = ins.rows[0].id;
  let balance = INITIAL_BALANCE;

  for (const s of u.sells ?? []) {
    const m = MARKET_SEED.find((x) => x.symbol === s.symbol)!;
    const buyPrice = m.price * usdTry * (1 - Math.max(s.gain, -0.5) - 0.02);
    const sellPrice = buyPrice * (1 + s.gain);
    balance -= await insertTx(client, userId, 'buy', m, s.quantity, buyPrice, s.daysAgo + 10);
    balance += await insertTx(client, userId, 'sell', m, s.quantity, sellPrice, s.daysAgo);
  }

  for (const p of u.positions) {
    const m = MARKET_SEED.find((x) => x.symbol === p.symbol)!;
    const current = m.price * usdTry;
    const avg = current * (1 - p.drift);
    balance -= await insertTx(client, userId, 'buy', m, p.quantity, avg, p.daysAgo);
    await client.query(
      `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP - ($8::int * INTERVAL '1 day'))`,
      [userId, m.symbol, m.name, m.asset_type, p.quantity, avg, current, p.daysAgo]
    );
  }

  if (balance < 0) {
    throw new Error(`Seed: ${u.username} için bakiye negatif (${balance.toFixed(2)})`);
  }
  await client.query('UPDATE users SET balance = $2 WHERE id = $1', [userId, round2(balance)]);

  // TransactionService.recalculateUserPortfolio ile aynı hesap
  await client.query(
    `UPDATE portfolio_items
        SET total_value = quantity * current_price,
            profit_loss = (current_price - average_price) * quantity,
            profit_loss_percent = CASE WHEN average_price > 0 THEN ((current_price - average_price) / average_price) * 100 ELSE 0 END
      WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `UPDATE users u
        SET portfolio_value = COALESCE(s.tv, 0), total_profit_loss = COALESCE(s.pl, 0),
            week_baseline_equity = ROUND((u.balance + COALESCE(s.tv, 0)) * $2, 2)
       FROM (SELECT SUM(total_value) AS tv, SUM(profit_loss) AS pl FROM portfolio_items WHERE user_id = $1) s
      WHERE u.id = $1`,
    [userId, u.weekStartFactor]
  );
}

export interface SeedUsersResult {
  created: boolean;
  /** Sadece ilk oluşturmada ve şifre üretildiyse dolu */
  generatedPassword?: string;
}

/** Demo yönetici + örnek kullanıcılar (demo kullanıcısı zaten varsa hiçbir şey yapmaz). */
export async function seedUsers(pool: Pool, demoPassword?: string): Promise<SeedUsersResult> {
  const exists = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [DEMO_EMAIL]);
  if (exists.rows.length > 0) {
    return { created: false };
  }

  const generated = demoPassword ? undefined : crypto.randomBytes(9).toString('base64url');
  const password = demoPassword || generated!;
  const usdRow = await pool.query(`SELECT selling FROM currency_rates WHERE code = 'USD'`);
  const usdTry = parseFloat(usdRow.rows[0]?.selling ?? CURRENCY_SEED[0].selling);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await createUserWithPortfolio(
      client,
      {
        username: DEMO_USERNAME,
        email: DEMO_EMAIL,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        isAdmin: true,
        weekStartFactor: 1,
        positions: DEMO_POSITIONS,
      },
      usdTry
    );
    for (const u of SAMPLE_USERS) {
      // Örnek kullanıcılar giriş yapmak için tasarlanmadı: rastgele, kimsenin bilmediği şifre
      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), BCRYPT_ROUNDS);
      await createUserWithPortfolio(client, { ...u, passwordHash, isAdmin: false }, usdTry);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  return { created: true, generatedPassword: generated };
}

// ---------------------------------------------------------------------------
// Sezonlar + ligler (örnek)
// ---------------------------------------------------------------------------

const SEED_EMAILS = {
  demo: DEMO_EMAIL,
  aylin: 'aylin@portfoygo.local',
  mert: 'mert@portfoygo.local',
  zeynep: 'zeynep@portfoygo.local',
  can: 'can@portfoygo.local',
} as const;
type SeedKey = keyof typeof SEED_EMAILS;

/** Geçen ayın (bitmiş) sezonu: sabit referans/kapanış değerleri → demo kullanıcısı 2. (Sezon Podyumu) */
const PREVIOUS_SEASON: { key: SeedKey; baseline: number; final: number; trades: number }[] = [
  { key: 'aylin', baseline: 98_000, final: 106_330, trades: 5 },
  { key: 'demo', baseline: 100_000, final: 104_210, trades: 3 },
  { key: 'mert', baseline: 101_500, final: 104_300, trades: 4 },
  { key: 'can', baseline: 99_000, final: 99_850, trades: 2 },
  { key: 'zeynep', baseline: 100_500, final: 99_200, trades: 1 },
];

/** Güncel sezon referansları (sabit → tekrar çalıştırmak aynı sonucu verir; getiriler farklılaşır) */
const CURRENT_SEASON_BASELINES: Record<SeedKey, number> = {
  demo: 99_200,
  aylin: 101_000,
  mert: 97_500,
  zeynep: 100_800,
  can: 98_600,
};

const OFFICE_LEAGUE: {
  name: string;
  description: string;
  members: { key: SeedKey; role: 'owner' | 'member'; baseline: number; daysAgo: number }[];
} = {
  name: 'Ofis Ligi',
  description: 'Ofisteki yatırımcılar arasında dostane rekabet',
  members: [
    { key: 'demo', role: 'owner', baseline: 99_500, daysAgo: 10 },
    { key: 'aylin', role: 'member', baseline: 100_200, daysAgo: 9 },
    { key: 'mert', role: 'member', baseline: 98_000, daysAgo: 8 },
  ],
};

export interface SeedCompetitionsResult {
  currentSeason: string;
  previousSeason: string | null;
  leagueCreated: boolean;
  /** Bu çalıştırmada oluşturulan v2 demo ligleri (seedDemoLeagues) */
  leaguesCreated: string[];
}

/**
 * Yerel demo için sezon/lig verisi (SADECE yerel PGlite). İdempotent: mevcut veriyi silmez;
 * sadece örnek kullanıcıların satırlarını ekler / sabit değerlere günceller.
 *  - Güncel ayın sezonu (aktif) + örnek kullanıcılar farklı referanslarla (getiriler farklılaşır)
 *  - Geçen ayın sezonu (bitmiş) + dondurulmuş değerler + ödüller (demo: Sezon Podyumu).
 *    Geçen ayın sezonu zaten ödüllüyse veya hâlâ aktifse (gerçek sezon) dokunulmaz.
 *  - demo'nun sahibi olduğu 3 üyeli "Ofis Ligi" (yoksa)
 */
export async function seedCompetitions(pool: Pool, now: Date = new Date()): Promise<SeedCompetitionsResult | null> {
  const ids = new Map<SeedKey, string>();
  for (const [key, email] of Object.entries(SEED_EMAILS) as [SeedKey, string][]) {
    const r = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (r.rows[0]) ids.set(key, r.rows[0].id);
  }
  const demoId = ids.get('demo');
  if (!demoId) return null;

  const currentSlug = seasonSlugFor(now);
  const prevSlug = previousSeasonSlug(currentSlug);
  let previousSeason: string | null = null;
  let leagueCreated = false;
  let leaguesCreated: string[] = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Geçen ay: bitmiş sezon ---
    await client.query(INSERT_SEASON_SQL, [prevSlug, seasonNameFor(prevSlug), 'finished']);
    const prev = (
      await client.query(
        `SELECT s.id, s.status, EXISTS (SELECT 1 FROM season_awards a WHERE a.season_id = s.id) AS has_awards
           FROM seasons s WHERE s.slug = $1`,
        [prevSlug]
      )
    ).rows[0];
    if (prev && prev.status === 'finished' && !prev.has_awards) {
      await client.query(`UPDATE seasons SET finalized_at = ends_at WHERE id = $1 AND finalized_at IS NULL`, [prev.id]);
      for (const p of PREVIOUS_SEASON) {
        const userId = ids.get(p.key);
        if (!userId) continue;
        await client.query(
          `INSERT INTO season_participants (season_id, user_id, baseline_equity, joined_at, final_equity, final_return_pct, trades_count)
           SELECT $1::uuid, $2::uuid, $3::numeric, s.starts_at, $4::numeric,
                  ROUND(($4::numeric - $3::numeric) / $3::numeric * 100, 4), $5::int
             FROM seasons s WHERE s.id = $1::uuid
           ON CONFLICT (season_id, user_id) DO UPDATE SET
             baseline_equity = EXCLUDED.baseline_equity, final_equity = EXCLUDED.final_equity,
             final_return_pct = EXCLUDED.final_return_pct, trades_count = EXCLUDED.trades_count`,
          [prev.id, userId, p.baseline, p.final, p.trades]
        );
      }
      await client.query(
        `UPDATE season_participants sp SET final_rank = r.rn
           FROM (SELECT user_id, ROW_NUMBER() OVER (ORDER BY final_return_pct DESC, joined_at ASC, user_id ASC) AS rn
                   FROM season_participants WHERE season_id = $1) r
          WHERE sp.season_id = $1 AND sp.user_id = r.user_id`,
        [prev.id]
      );
      await client.query(
        `INSERT INTO season_awards (season_id, user_id, rank, title, return_pct, awarded_at)
         SELECT x.season_id, x.user_id, x.rn, ${AWARD_TITLE_SQL}, x.final_return_pct, x.ends_at
           FROM (
             SELECT sp.season_id, sp.user_id, sp.final_return_pct, s.ends_at,
                    ROW_NUMBER() OVER (ORDER BY sp.final_rank ASC) AS rn
               FROM season_participants sp
               JOIN seasons s ON s.id = sp.season_id
              WHERE sp.season_id = $1 AND sp.trades_count >= 1 AND sp.final_rank IS NOT NULL
           ) x
          WHERE x.rn <= 10
         ON CONFLICT (season_id, user_id) DO NOTHING`,
        [prev.id]
      );
      previousSeason = prevSlug;
    }

    // --- Güncel ay: aktif sezon + örnek kullanıcılar sabit referanslarla ---
    await client.query(INSERT_SEASON_SQL, [currentSlug, seasonNameFor(currentSlug), 'active']);
    const cur = (await client.query(`SELECT id, status FROM seasons WHERE slug = $1`, [currentSlug])).rows[0];
    if (cur?.status === 'active') {
      for (const [key, baseline] of Object.entries(CURRENT_SEASON_BASELINES) as [SeedKey, number][]) {
        const userId = ids.get(key);
        if (!userId) continue;
        await client.query(
          `INSERT INTO season_participants (season_id, user_id, baseline_equity, joined_at)
           SELECT $1::uuid, $2::uuid, $3::numeric, s.starts_at FROM seasons s WHERE s.id = $1::uuid
           ON CONFLICT (season_id, user_id) DO UPDATE SET
             baseline_equity = EXCLUDED.baseline_equity, joined_at = EXCLUDED.joined_at`,
          [cur.id, userId, baseline]
        );
      }
    }

    // --- "Ofis Ligi" (demo sahibi, 3 üye) ---
    const existing = await client.query(`SELECT id FROM leagues WHERE owner_id = $1 AND name = $2`, [demoId, OFFICE_LEAGUE.name]);
    if (existing.rows.length === 0) {
      let leagueId: string | undefined;
      for (let i = 0; i < 8 && !leagueId; i++) {
        const ins = await client.query(
          `INSERT INTO leagues (name, description, owner_id, invite_code, created_at, starts_at, started_at)
           VALUES ($1, $2, $3, $4, now() - INTERVAL '10 days', now() - INTERVAL '10 days', now() - INTERVAL '10 days')
           ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
          [OFFICE_LEAGUE.name, OFFICE_LEAGUE.description, demoId, generateInviteCode()]
        );
        leagueId = ins.rows[0]?.id;
      }
      if (!leagueId) throw new Error('Seed: Ofis Ligi için davet kodu üretilemedi');
      for (const m of OFFICE_LEAGUE.members) {
        const userId = ids.get(m.key);
        if (!userId) continue;
        await client.query(
          `INSERT INTO league_members (league_id, user_id, role, baseline_equity, joined_at, baseline_set_at)
           VALUES ($1, $2, $3, $4, now() - ($5::int * INTERVAL '1 day'), now() - ($5::int * INTERVAL '1 day'))
           ON CONFLICT (league_id, user_id) DO NOTHING`,
          [leagueId, userId, m.role, m.baseline, m.daysAgo]
        );
      }
      leagueCreated = true;
    }

    // --- Ligler v2: herkese açık yaklaşan / aktif lig + biten lig (dondurulmuş sonuçlar) ---
    leaguesCreated = await seedDemoLeagues(client, ids, now);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  return { currentSeason: currentSlug, previousSeason, leagueCreated, leaguesCreated };
}

// ---------------------------------------------------------------------------
// Ligler v2 (örnek): herkese açık yaklaşan + aktif lig, biten lig (demo 1.)
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

interface DemoLeagueSpec {
  name: string;
  description: string;
  visibility: 'private' | 'public';
  owner: SeedKey;
  startsAt: Date;
  endsAt: Date;
  /** Başlamış mı (started_at = startsAt, referanslar yazılı) */
  started: boolean;
  /** Bitmiş mi (finalized_at = endsAt; dondurulmuş değerler `final` alanından) */
  finished: boolean;
  members: { key: SeedKey; baseline: number; final?: number; joinedHoursBeforeStart: number }[];
}

/** En son biten Eylül ayı (İstanbul, UTC+3): 1 Eylül 00:00 → 1 Ekim 00:00 */
function lastSeptember(now: Date): { start: Date; end: Date } {
  const year = now.getUTCMonth() > 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { start: new Date(Date.UTC(year, 8, 1) - 3 * HOUR_MS), end: new Date(Date.UTC(year, 9, 1) - 3 * HOUR_MS) };
}

function demoLeagueSpecs(now: Date): DemoLeagueSpec[] {
  const t = now.getTime();
  const sep = lastSeptember(now);
  return [
    {
      name: 'Hafta Sonu Kapışması',
      description: 'İki günlük herkese açık yarış: başlamadan katıl, başlangıçta varlığın kaydedilsin',
      visibility: 'public',
      owner: 'aylin',
      startsAt: new Date(t + 2 * HOUR_MS),
      endsAt: new Date(t + 2 * HOUR_MS + 48 * HOUR_MS),
      started: false,
      finished: false,
      members: [
        { key: 'aylin', baseline: 100_000, joinedHoursBeforeStart: 20 },
        { key: 'can', baseline: 100_000, joinedHoursBeforeStart: 6 },
      ],
    },
    {
      name: 'Hızlı Lig — 1 Gün',
      description: '24 saatlik herkese açık lig: en yüksek getiri kazanır',
      visibility: 'public',
      owner: 'zeynep',
      startsAt: new Date(t - 3 * HOUR_MS),
      endsAt: new Date(t + 21 * HOUR_MS),
      started: true,
      finished: false,
      members: [
        { key: 'zeynep', baseline: 100_400, joinedHoursBeforeStart: 12 },
        { key: 'aylin', baseline: 100_900, joinedHoursBeforeStart: 10 },
        { key: 'mert', baseline: 97_900, joinedHoursBeforeStart: 8 },
        { key: 'can', baseline: 98_800, joinedHoursBeforeStart: 2 },
      ],
    },
    {
      name: 'Eylül Kupası',
      description: 'Eylül ayı boyunca süren arkadaş ligi',
      visibility: 'private',
      owner: 'demo',
      startsAt: sep.start,
      endsAt: sep.end,
      started: true,
      finished: true,
      members: [
        { key: 'demo', baseline: 98_000, final: 104_000, joinedHoursBeforeStart: 72 },
        { key: 'aylin', baseline: 99_000, final: 102_960, joinedHoursBeforeStart: 60 },
        { key: 'mert', baseline: 101_000, final: 102_010, joinedHoursBeforeStart: 48 },
        { key: 'can', baseline: 100_000, final: 97_500, joinedHoursBeforeStart: 30 },
      ],
    },
  ];
}

/**
 * v2 demo liglerini ekler (aynı isimde lig varsa dokunmaz → idempotent). Çağıranın transaction'ında çalışır.
 * @returns oluşturulan liglerin adları
 */
export async function seedDemoLeagues(client: PoolClient, ids: Map<SeedKey, string>, now: Date = new Date()): Promise<string[]> {
  const created: string[] = [];
  for (const spec of demoLeagueSpecs(now)) {
    const ownerId = ids.get(spec.owner);
    if (!ownerId) continue;
    const exists = await client.query(`SELECT 1 FROM leagues WHERE name = $1`, [spec.name]);
    if (exists.rows.length > 0) continue;

    const startsAt = spec.startsAt.toISOString();
    const endsAt = spec.endsAt.toISOString();
    const firstJoinHours = Math.max(...spec.members.map((m) => m.joinedHoursBeforeStart));
    const createdAt = new Date(spec.startsAt.getTime() - (firstJoinHours + 1) * HOUR_MS).toISOString();
    let leagueId: string | undefined;
    for (let i = 0; i < 8 && !leagueId; i++) {
      const ins = await client.query(
        `INSERT INTO leagues (name, description, owner_id, invite_code, visibility, starts_at, started_at, ends_at, finalized_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz)
         ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
        [
          spec.name,
          spec.description,
          ownerId,
          generateInviteCode(),
          spec.visibility,
          startsAt,
          spec.started ? startsAt : null,
          endsAt,
          spec.finished ? endsAt : null,
          createdAt,
        ]
      );
      leagueId = ins.rows[0]?.id;
    }
    if (!leagueId) throw new Error(`Seed: ${spec.name} için davet kodu üretilemedi`);

    for (const m of spec.members) {
      const userId = ids.get(m.key);
      if (!userId) continue;
      const finalReturn =
        spec.finished && m.final !== undefined ? Math.round(((m.final - m.baseline) / m.baseline) * 100 * 10_000) / 10_000 : null;
      await client.query(
        `INSERT INTO league_members (league_id, user_id, role, baseline_equity, joined_at, baseline_set_at, final_equity, final_return_pct)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8)
         ON CONFLICT (league_id, user_id) DO NOTHING`,
        [
          leagueId,
          userId,
          m.key === spec.owner ? 'owner' : 'member',
          m.baseline,
          new Date(spec.startsAt.getTime() - m.joinedHoursBeforeStart * HOUR_MS).toISOString(),
          spec.started ? startsAt : null,
          spec.finished ? m.final ?? null : null,
          finalReturn,
        ]
      );
    }
    if (spec.finished) {
      await client.query(
        `UPDATE league_members lm SET final_rank = x.rn
           FROM (SELECT user_id, ROW_NUMBER() OVER (
                   ORDER BY (final_equity - baseline_equity) / baseline_equity DESC, joined_at ASC, user_id ASC) AS rn
                   FROM league_members WHERE league_id = $1 AND final_equity IS NOT NULL) x
          WHERE lm.league_id = $1 AND lm.user_id = x.user_id`,
        [leagueId]
      );
    }
    created.push(spec.name);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Fiyat geçmişi (sentetik, örnek)
// ---------------------------------------------------------------------------

type HistoryAssetType = 'stock' | 'crypto' | 'currency' | 'commodity';

/** Günlük oynaklık (log-getiri std) ve yıllık eğilim aralığı */
const HISTORY_PROFILE: Record<HistoryAssetType, { vol: number; driftMin: number; driftMax: number }> = {
  crypto: { vol: 0.03, driftMin: -0.35, driftMax: 0.6 },
  stock: { vol: 0.016, driftMin: -0.15, driftMax: 0.35 },
  // TL'nin değer kaybı: döviz kurları yıllık ~%10–30 yükselir
  currency: { vol: 0.004, driftMin: 0.1, driftMax: 0.3 },
  commodity: { vol: 0.01, driftMin: -0.08, driftMax: 0.25 },
};
const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDE', 'PYUSD']);

const HISTORY_DAYS = 400;
const HISTORY_HOUR_DAYS = 15;
const HISTORY_M15_DAYS = 3;
/** Bu kadar (veya daha fazla) günlük satırı olan varlık yeniden tohumlanmaz */
const HISTORY_MIN_DAY_ROWS = 300;

/** Deterministik PRNG (mulberry32) — sembol başına sabit tohum */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  return crypto.createHash('sha256').update(s).digest().readUInt32LE(0);
}

/** Standart normal (Box–Muller) */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticHistoryRow {
  granularity: 'm15' | 'hour' | 'day';
  bucketStart: Date;
  price: number;
}

/**
 * Bir varlık için sentetik fiyat geçmişi üretir (saf fonksiyon). Geometrik rastgele yürüyüş "şimdi"den
 * geriye doğru kurulur; böylece seri TAM OLARAK güncel fiyatta biter. Her kovanın değeri kapanıştır:
 * saatlik = saatin son m15 değeri, günlük = günün son değeri (aynı yol → yoğunluklar tutarlı).
 */
export function generateSyntheticHistory(
  type: HistoryAssetType,
  symbol: string,
  currentPrice: number,
  now: Date = new Date()
): SyntheticHistoryRow[] {
  const rand = mulberry32(seedFromString(`${type}:${symbol.toUpperCase()}`));
  const profile = HISTORY_PROFILE[type];
  const stable = type === 'crypto' && STABLECOINS.has(symbol.toUpperCase());
  const vol = stable ? 0.0005 : profile.vol;
  const annualDrift = stable ? 0 : profile.driftMin + (profile.driftMax - profile.driftMin) * rand();
  const dailyDrift = annualDrift / 365;
  const step = (dtDays: number) => dailyDrift * dtDays + vol * Math.sqrt(dtDays) * gaussian(rand);

  const M15 = GRANULARITY_MS.m15;
  const nowMs = now.getTime();
  const lastM15 = bucketStart('m15', now).getTime();
  const fineStart = bucketStart('m15', new Date(nowMs - HISTORY_HOUR_DAYS * DAY_MS)).getTime();

  // 1) İnce yol: son 15 günün m15 kapanışları (geriye doğru), son kova = güncel fiyat
  const fine = new Map<number, number>();
  let price = currentPrice;
  for (let b = lastM15; b >= fineStart; b -= M15) {
    fine.set(b, price);
    price = price / Math.exp(step(M15 / DAY_MS));
  }

  const rows: SyntheticHistoryRow[] = [];
  const m15From = nowMs - HISTORY_M15_DAYS * DAY_MS;
  const hourFrom = nowMs - HISTORY_HOUR_DAYS * DAY_MS;
  const hourClose = new Map<number, number>();
  const dayClose = new Map<number, number>();
  // Artan sırada: aynı saat/güne düşen sonraki m15 değeri öncekinin üzerine yazar → kapanış
  for (const b of [...fine.keys()].sort((x, y) => x - y)) {
    const v = fine.get(b)!;
    if (b >= m15From) rows.push({ granularity: 'm15', bucketStart: new Date(b), price: v });
    const hb = bucketStart('hour', new Date(b)).getTime();
    if (hb >= hourFrom) hourClose.set(hb, v);
    dayClose.set(istanbulDayStart(new Date(b)).getTime(), v);
  }
  for (const [hb, v] of hourClose) rows.push({ granularity: 'hour', bucketStart: new Date(hb), price: v });

  // 2) Daha eski günler: en eski ince günün kapanışından günlük adımlarla geriye
  const earliestDay = Math.min(...dayClose.keys());
  let dayPrice = dayClose.get(earliestDay)!;
  let cursor = earliestDay;
  const oldest = istanbulDayStart(new Date(nowMs - HISTORY_DAYS * DAY_MS)).getTime();
  while (cursor > oldest) {
    dayPrice = dayPrice / Math.exp(step(1));
    // Bir önceki İstanbul günü (gün ortasından geriye giderek DST'den bağımsız)
    cursor = istanbulDayStart(new Date(cursor - 12 * 3_600_000)).getTime();
    dayClose.set(cursor, dayPrice);
  }
  for (const [db, v] of dayClose) rows.push({ granularity: 'day', bucketStart: new Date(db), price: v });

  return rows.map((r) => ({ ...r, price: Math.max(Number(r.price.toPrecision(10)), 1e-8) }));
}

export interface SeedPriceHistoryResult {
  seeded: string[];
  skipped: number;
  rows: number;
}

/**
 * Yerel demo için sentetik fiyat geçmişi (SADECE yerel PGlite; localDb.ts ve yerel tek seferlik betik çağırır).
 * Kaynaklar: market_data_cache (hisse/kripto, USD), currency_rates (TL; TRY hariç) ve varsa GAU / GOLD
 * emtia satırları. Her seri güncel önbellek fiyatında biter.
 * İdempotent: ≥300 günlük satırı olan varlık atlanır; mevcut satırların üzerine yazılmaz (DO NOTHING).
 */
export async function seedPriceHistory(pool: Pool, now: Date = new Date()): Promise<SeedPriceHistoryResult> {
  const sources = await pool.query(
    `SELECT asset_type, sym, price, cur FROM (
       SELECT DISTINCT ON (asset_type, UPPER(symbol)) asset_type, UPPER(symbol) AS sym, price::numeric AS price, 'USD' AS cur
         FROM market_data_cache
        WHERE asset_type IN ('stock', 'crypto') AND price > 0 AND length(symbol) <= 20
        ORDER BY asset_type, UPPER(symbol), cached_at DESC
     ) m
     UNION ALL
     SELECT 'currency', UPPER(code), selling::numeric, 'TRY'
       FROM currency_rates
      WHERE selling > 0 AND UPPER(code) <> 'TRY' AND length(code) <= 20`
  );
  // Yerel tohumda emtia fiyatı yoktur (sağlayıcı kapalı); GAU / GOLD için kayıtlı bir fiyat varsa o da dahil edilir
  const commodities = await pool.query(
    `SELECT DISTINCT ON (symbol) 'commodity' AS asset_type, symbol AS sym, price, currency AS cur
       FROM price_history
      WHERE asset_type = 'commodity' AND symbol IN ('GAU', 'GOLD')
      ORDER BY symbol, bucket_start DESC`
  );
  const counts = await pool.query(
    `SELECT asset_type, symbol, count(*)::int AS n FROM price_history WHERE granularity = 'day' GROUP BY 1, 2`
  );
  const dayRows = new Map<string, number>(counts.rows.map((r: any) => [`${r.asset_type}:${r.symbol}`, r.n]));

  const result: SeedPriceHistoryResult = { seeded: [], skipped: 0, rows: 0 };
  for (const src of [...sources.rows, ...commodities.rows]) {
    const key = `${src.asset_type}:${src.sym}`;
    const current = parseFloat(src.price);
    if (!Number.isFinite(current) || current <= 0) continue;
    if ((dayRows.get(key) ?? 0) >= HISTORY_MIN_DAY_ROWS) {
      result.skipped++;
      continue;
    }
    const rows = generateSyntheticHistory(src.asset_type, src.sym, current, now);
    const ins = await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       SELECT $1, $2, r.g, r.bs, r.p, $3, $4::timestamptz
         FROM unnest($5::text[], $6::timestamptz[], $7::numeric[]) AS r(g, bs, p)
       ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO NOTHING`,
      [
        src.asset_type,
        src.sym,
        src.cur,
        now.toISOString(),
        rows.map((r) => r.granularity),
        rows.map((r) => r.bucketStart.toISOString()),
        rows.map((r) => r.price),
      ]
    );
    result.seeded.push(key);
    result.rows += ins.rowCount ?? 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Arena (örnek) — SADECE yerel PGlite
// ---------------------------------------------------------------------------

/** Arena emtiaları (USD): yerelde emtia sağlayıcısı kapalı olduğundan sentetik saatlik/günlük geçmiş */
/**
 * Emtia fiyat geçmişi tohumu (USD). Değerler 17.10.2026: değerli metaller gold-api.com, Brent EIA günlük spot
 * (14.10.2026). Yalnızca geçmişi olmayan kodlar için üretilir; yerelde fiyatı tickMarket taze tutar
 * (LOCAL_LIVE_PRICES=1 iken metaller gold-api.com'dan canlı gelir). Gram altın (GAU) onstan türetilir.
 */
const ARENA_COMMODITY_SEED: { symbol: string; price: number }[] = [
  { symbol: 'GOLD', price: 4166.1 },
  { symbol: 'BRENT_OIL', price: 126.55 },
  { symbol: 'SILVER', price: 57.12 },
  { symbol: 'PLATINUM', price: 1636 },
  { symbol: 'PALLADIUM', price: 1136 },
  { symbol: 'COPPER', price: 6.6167 },
];

const ARENA_CORE_CODES: ArenaInstrumentCode[] = ['EURUSD', 'XAUUSD', 'BRENT', 'BTCUSD'];
export const ARENA_UPCOMING_TITLE = 'Cuma Akşamı Kapışması';
export const ARENA_FINISHED_TITLE = 'Pazartesi Isınma Turu';

/** Bitmiş örnek meydan okuma: demo 2. */
const ARENA_FINISHED_RESULTS: { key: SeedKey; ret: number; trades: number }[] = [
  { key: 'aylin', ret: 6.42, trades: 7 },
  { key: 'demo', ret: 3.18, trades: 5 },
  { key: 'mert', ret: 1.05, trades: 9 },
  { key: 'zeynep', ret: -0.84, trades: 3 },
  { key: 'can', ret: -2.37, trades: 6 },
];

export interface SeedArenaResult {
  commodities: string[];
  upcomingCreated: boolean;
  finishedCreated: boolean;
}

/**
 * Arena örnek verisi (idempotent; SADECE yerel PGlite — localDb.ts ve src/dev/seedArenaLocal.ts çağırır):
 *  1) commodity:GOLD / BRENT_OIL / SILVER için USD saatlik + günlük sentetik geçmiş — son 14 günde 48'den az
 *     saatlik nokta varsa üretilir (son bilinen fiyatta biter; mevcut satırların üzerine yazılmaz).
 *  2) Yaklaşan "Cuma Akşamı Kapışması" (15 dk sonra, 5 dk, 4 enstrüman) — aynı başlıkta bitmemiş yoksa.
 *  3) Bitmiş "Pazartesi Isınma Turu" (dün) — örnek kullanıcılarla sonuçlar, demo 2. — yoksa.
 */
export async function seedArena(pool: Pool, now: Date = new Date()): Promise<SeedArenaResult> {
  const result: SeedArenaResult = { commodities: [], upcomingCreated: false, finishedCreated: false };

  // 1) Emtia geçmişi
  for (const c of ARENA_COMMODITY_SEED) {
    const recent = await pool.query(
      `SELECT COUNT(*)::int AS n FROM price_history
        WHERE asset_type = 'commodity' AND symbol = $1 AND granularity = 'hour' AND currency = 'USD'
          AND bucket_start >= $2::timestamptz`,
      [c.symbol, new Date(now.getTime() - 14 * DAY_MS).toISOString()]
    );
    if (Number(recent.rows[0]?.n ?? 0) >= 48) continue;
    const last = await pool.query(
      `SELECT price FROM price_history WHERE asset_type = 'commodity' AND symbol = $1 AND currency = 'USD'
        ORDER BY bucket_start DESC LIMIT 1`,
      [c.symbol]
    );
    const current = last.rows[0] ? parseFloat(last.rows[0].price) : c.price;
    const rows = generateSyntheticHistory('commodity', c.symbol, current, now);
    await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       SELECT 'commodity', $1, r.g, r.bs, r.p, 'USD', $2::timestamptz
         FROM unnest($3::text[], $4::timestamptz[], $5::numeric[]) AS r(g, bs, p)
       ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO NOTHING`,
      [
        c.symbol,
        now.toISOString(),
        rows.map((r) => r.granularity),
        rows.map((r) => r.bucketStart.toISOString()),
        rows.map((r) => r.price),
      ]
    );
    result.commodities.push(c.symbol);
  }

  const users = await pool.query('SELECT id, email FROM users WHERE email = ANY($1::text[])', [Object.values(SEED_EMAILS)]);
  const idByEmail = new Map<string, string>(users.rows.map((r: any) => [String(r.email).toLowerCase(), r.id]));
  const idOf = (key: SeedKey) => idByEmail.get(SEED_EMAILS[key].toLowerCase());
  const demoId = idOf('demo') ?? null;

  // 2) Yaklaşan meydan okuma
  const upcoming = await pool.query(
    `SELECT 1 FROM arena_challenges WHERE title = $1 AND status IN ('scheduled', 'running')
        AND starts_at + duration_s * INTERVAL '1 second' > $2::timestamptz`,
    [ARENA_UPCOMING_TITLE, now.toISOString()]
  );
  if (upcoming.rows.length === 0) {
    const startsAt = new Date(Math.ceil((now.getTime() + 15 * 60_000) / 60_000) * 60_000);
    await insertSeedChallenge(pool, {
      title: ARENA_UPCOMING_TITLE,
      description: 'Haftanın kapanışında 5 dakikalık hızlı kapışma: EUR/USD, altın, Brent ve Bitcoin. En yüksek getiri kazanır!',
      sponsor: 'PortfoyGo',
      prize_text: "İlk 3'e özel rozet",
      startsAt,
      durationS: 300,
      createdBy: demoId,
      status: 'scheduled',
      window: null,
      seed: randomSeed(),
    });
    result.upcomingCreated = true;
  }

  // 3) Bitmiş meydan okuma (sonuçlarla)
  const finished = await pool.query('SELECT 1 FROM arena_challenges WHERE title = $1', [ARENA_FINISHED_TITLE]);
  const participants = ARENA_FINISHED_RESULTS.filter((r) => idOf(r.key));
  if (finished.rows.length === 0 && participants.length > 0) {
    const startsAt = new Date(Math.floor((now.getTime() - DAY_MS) / 3_600_000) * 3_600_000 + 20 * 60_000);
    const seed = randomSeed();
    const series = await loadHourlySeries(ARENA_CORE_CODES, new Date(startsAt.getTime() - 14 * DAY_MS), completedHoursEnd(startsAt), pool);
    const window = pickWindows(series as Map<string, { t: number; p: number }[]>, seed);
    if (Object.keys(window).length > 0) {
      const { roundId } = await insertSeedChallenge(pool, {
        title: ARENA_FINISHED_TITLE,
        description: 'Haftaya ısınma: 5 dakikalık örnek meydan okuma.',
        sponsor: 'PortfoyGo',
        prize_text: 'Kazanana "Arena ustası" rozeti',
        startsAt,
        durationS: 300,
        createdBy: demoId,
        status: 'finished',
        window,
        seed,
      });
      let joined = startsAt.getTime() - 40 * 60_000;
      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const equity = Math.round(10_000 * (1 + p.ret / 100) * 100) / 100;
        joined += 3 * 60_000;
        await pool.query(
          `INSERT INTO arena_entries (round_id, user_id, cash, equity_final, return_pct, rank, trades_count, joined_at)
           VALUES ($1, $2, $3, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [roundId, idOf(p.key), equity, p.ret, i + 1, p.trades, new Date(joined).toISOString()]
        );
      }
      result.finishedCreated = true;
    }
  }
  return result;
}

async function insertSeedChallenge(
  pool: Pool,
  c: {
    title: string;
    description: string;
    sponsor: string;
    prize_text: string;
    startsAt: Date;
    durationS: number;
    createdBy: string | null;
    status: 'scheduled' | 'finished';
    window: Record<string, unknown> | null;
    seed: number;
  }
): Promise<{ challengeId: string; roundId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const instruments = c.window ? ARENA_CORE_CODES.filter((code) => c.window![code]) : ARENA_CORE_CODES;
    const ch = await client.query(
      `INSERT INTO arena_challenges (title, description, sponsor, prize_text, starts_at, duration_s, instruments, starting_cash, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 10000, $8, $9) RETURNING id`,
      [c.title, c.description, c.sponsor, c.prize_text, c.startsAt.toISOString(), c.durationS, JSON.stringify(instruments), c.status, c.createdBy]
    );
    const endsAt = new Date(c.startsAt.getTime() + c.durationS * 1000);
    const r = await client.query(
      `INSERT INTO arena_rounds (kind, challenge_id, status, starts_at, ends_at, duration_s, instruments, "window", seed, starting_cash, finished_at)
       VALUES ('challenge', $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 10000, $9) RETURNING id`,
      [
        ch.rows[0].id,
        c.status,
        c.startsAt.toISOString(),
        endsAt.toISOString(),
        c.durationS,
        JSON.stringify(instruments),
        c.window ? JSON.stringify(c.window) : null,
        c.seed,
        c.status === 'finished' ? endsAt.toISOString() : null,
      ]
    );
    await client.query('UPDATE arena_challenges SET round_id = $2 WHERE id = $1', [ch.rows[0].id, r.rows[0].id]);
    await client.query('COMMIT');
    return { challengeId: ch.rows[0].id, roundId: r.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Senaryo modu: SENTETİK "Ani Çöküş Tatbikatı" (yalnızca yerel)
// ---------------------------------------------------------------------------

export interface SeedScenariosResult {
  /** Bu çalıştırmada oluşturulan seriler */
  series: string[];
  scenarioCreated: boolean;
}

/**
 * Senaryo örnek verisi (idempotent; SADECE yerel PGlite — localDb.ts ve src/dev/seedScenariosLocal.ts çağırır):
 * açıkça SENTETİK 3 seri (SYN_CRASH_BTC / _BRENT / _XAU, USD, saatlik) + yayında "Ani Çöküş Tatbikatı (sentetik veri)"
 * senaryosu (synthetic = true). Seri zaten varsa noktalarına dokunulmaz; senaryo slug'ı varsa yeniden eklenmez.
 * 015_scenarios.sql uygulanmamışsa hiçbir şey yapmaz.
 */
export async function seedScenarios(pool: Pool): Promise<SeedScenariosResult> {
  if (process.env.NODE_ENV === 'production') throw new Error('seedScenarios yalnızca yerel geliştirme içindir');
  const result: SeedScenariosResult = { series: [], scenarioCreated: false };
  const ready = await pool.query(`SELECT to_regclass('scenarios') AS s, to_regclass('historical_series') AS h`);
  if (!ready.rows[0]?.s || !ready.rows[0]?.h) return result;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const spec of CRASH_DRILL_SERIES) {
      const ins = await client.query(
        `INSERT INTO historical_series_meta (series_code, label, currency, source, license_note)
         VALUES ($1, $2, 'USD', $3, $4) ON CONFLICT (series_code) DO NOTHING RETURNING series_code`,
        [spec.series_code, spec.series_label, SYNTHETIC_SOURCE, SYNTHETIC_LICENSE_NOTE]
      );
      if (ins.rows.length === 0) continue;
      const pts = generateCrashDrillSeries(spec);
      await client.query(
        `INSERT INTO historical_series (series_code, ts, price)
         SELECT $1, x.ts, x.p FROM unnest($2::timestamptz[], $3::numeric[]) AS x(ts, p)
         ON CONFLICT (series_code, ts) DO NOTHING`,
        [spec.series_code, pts.map((p) => new Date(p.ts).toISOString()), pts.map((p) => p.price)]
      );
      await client.query(
        `UPDATE historical_series_meta m SET points = s.n, from_ts = s.f, to_ts = s.l
           FROM (SELECT COUNT(*)::int AS n, MIN(ts) AS f, MAX(ts) AS l FROM historical_series WHERE series_code = $1) s
          WHERE m.series_code = $1`,
        [spec.series_code]
      );
      result.series.push(spec.series_code);
    }
    const sc = await client.query(
      `INSERT INTO scenarios (slug, title, description, briefing, debrief, difficulty, instruments, window_from, window_to, published, synthetic)
       VALUES ($1, $2, $3, $4, $5, 'kolay', $6::jsonb, $7, $8, true, true)
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [
        CRASH_DRILL_SLUG,
        CRASH_DRILL_TITLE,
        CRASH_DRILL_DESCRIPTION,
        CRASH_DRILL_BRIEFING,
        CRASH_DRILL_DEBRIEF,
        JSON.stringify(CRASH_DRILL_SERIES.map((s) => ({ code: s.code, label: s.label, series_code: s.series_code }))),
        CRASH_DRILL_FROM.toISOString(),
        CRASH_DRILL_TO.toISOString(),
      ]
    );
    result.scenarioCreated = sc.rows.length > 0;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return result;
}
