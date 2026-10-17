/**
 * Varsayılan hisse evreni: sektörlere yayılmış büyük ABD şirketleri (en fazla 50 — Finnhub ücretsiz katmanı
 * 60 çağrı/dk; bkz. adapters/finnhubCached.ts). STOCK_SYMBOLS (virgülle ayrılmış) ile değiştirilebilir.
 *
 * Saf modül (veritabanı / ağ yok): yerel tohum verisi (dev/seed.ts) ve yerel ortam (dev/localEnv.ts) da kullanır.
 * Ad ve sektör, sağlayıcının şirket profili henüz alınmadıysa gösterilir.
 */
export interface UniverseStock {
  symbol: string;
  name: string;
  /** Finnhub "finnhubIndustry" ile aynı adlandırma */
  industry: string;
}

const s = (symbol: string, name: string, industry: string): UniverseStock => ({ symbol, name, industry });

export const STOCK_UNIVERSE: readonly UniverseStock[] = [
  // Teknoloji, yarı iletken, internet
  s('AAPL', 'Apple Inc', 'Technology'),
  s('MSFT', 'Microsoft Corp', 'Technology'),
  s('NVDA', 'NVIDIA Corp', 'Semiconductors'),
  s('GOOGL', 'Alphabet Inc', 'Media'),
  s('AMZN', 'Amazon.com Inc', 'Retail'),
  s('META', 'Meta Platforms Inc', 'Media'),
  s('TSLA', 'Tesla Inc', 'Automobiles'),
  s('AVGO', 'Broadcom Inc', 'Semiconductors'),
  s('ORCL', 'Oracle Corp', 'Technology'),
  s('AMD', 'Advanced Micro Devices', 'Semiconductors'),
  s('NFLX', 'Netflix Inc', 'Media'),
  s('CRM', 'Salesforce Inc', 'Technology'),
  s('ADBE', 'Adobe Inc', 'Technology'),
  s('INTC', 'Intel Corp', 'Semiconductors'),
  s('CSCO', 'Cisco Systems Inc', 'Communications'),
  s('QCOM', 'Qualcomm Inc', 'Semiconductors'),
  s('IBM', 'International Business Machines', 'Technology'),
  s('PLTR', 'Palantir Technologies', 'Technology'),
  s('UBER', 'Uber Technologies Inc', 'Road & Rail'),
  // Finans
  s('JPM', 'JPMorgan Chase & Co', 'Banking'),
  s('V', 'Visa Inc', 'Financial Services'),
  s('MA', 'Mastercard Inc', 'Financial Services'),
  s('BAC', 'Bank of America Corp', 'Banking'),
  s('GS', 'Goldman Sachs Group Inc', 'Financial Services'),
  s('MS', 'Morgan Stanley', 'Financial Services'),
  s('PYPL', 'PayPal Holdings Inc', 'Financial Services'),
  // Enerji
  s('XOM', 'Exxon Mobil Corp', 'Energy'),
  s('CVX', 'Chevron Corp', 'Energy'),
  // Tüketim
  s('WMT', 'Walmart Inc', 'Retail'),
  s('COST', 'Costco Wholesale Corp', 'Retail'),
  s('HD', 'Home Depot Inc', 'Retail'),
  s('KO', 'Coca-Cola Co', 'Beverages'),
  s('PEP', 'PepsiCo Inc', 'Beverages'),
  s('MCD', "McDonald's Corp", 'Hotels, Restaurants & Leisure'),
  s('SBUX', 'Starbucks Corp', 'Hotels, Restaurants & Leisure'),
  s('NKE', 'Nike Inc', 'Textiles, Apparel & Luxury Goods'),
  s('DIS', 'Walt Disney Co', 'Media'),
  // Sağlık
  s('LLY', 'Eli Lilly and Co', 'Pharmaceuticals'),
  s('UNH', 'UnitedHealth Group Inc', 'Health Care'),
  s('JNJ', 'Johnson & Johnson', 'Pharmaceuticals'),
  s('ABBV', 'AbbVie Inc', 'Pharmaceuticals'),
  s('MRK', 'Merck & Co Inc', 'Pharmaceuticals'),
  s('PFE', 'Pfizer Inc', 'Pharmaceuticals'),
  // Sanayi, telekom
  s('BA', 'Boeing Co', 'Aerospace & Defense'),
  s('CAT', 'Caterpillar Inc', 'Machinery'),
  s('GE', 'GE Aerospace', 'Aerospace & Defense'),
  s('T', 'AT&T Inc', 'Telecommunication'),
  s('VZ', 'Verizon Communications Inc', 'Telecommunication'),
];

export const MAX_TRACKED_STOCKS = 50;

/** STOCK_SYMBOLS (virgülle ayrılmış; en fazla 50) ya da varsayılan evren */
export function trackedStockSymbols(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = (env.STOCK_SYMBOLS || '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z0-9.\-]{1,20}$/.test(x));
  const list = fromEnv.length > 0 ? fromEnv : STOCK_UNIVERSE.map((u) => u.symbol);
  return [...new Set(list)].slice(0, MAX_TRACKED_STOCKS);
}

export function universeInfo(symbol: string): UniverseStock | undefined {
  const sym = symbol.toUpperCase();
  return STOCK_UNIVERSE.find((u) => u.symbol === sym);
}
