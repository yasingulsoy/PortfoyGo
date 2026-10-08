/**
 * Dış veri sağlayıcı sözleşmeleri.
 *
 * Uygulamanın geri kalanı (rotalar, fiyatlama, önbellek, cron) dış API'leri doğrudan değil,
 * yalnızca bu arayüzler üzerinden kullanır. Yeni bir sağlayıcı eklemek için:
 *   1. `src/providers/adapters/<ad>.ts` içinde ilgili arayüzü uygulayın,
 *   2. `src/providers/index.ts` içindeki kayda ekleyin,
 *   3. `.env` içinde ilgili seçiciyi ayarlayın (ör. STOCK_PROVIDER=<ad>).
 *
 * Tipler sağlayıcıdan bağımsızdır; adaptör, sağlayıcının ham yanıtını bu şekle çevirmekten sorumludur.
 * Fiyat birimleri: hisse ve kripto USD; döviz TL; emtia `quoteCurrency` alanına göre.
 */

/* ---------------------------------- Hisse ---------------------------------- */

export interface StockQuote {
  symbol: string;
  name: string;
  /** USD */
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  /** USD (tam değer) */
  marketCap: number;
  logo: string;
  industry: string;
}

export interface StockSymbolInfo {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
  currency?: string;
  figi?: string;
  mic?: string;
}

export interface StockProvider {
  readonly id: string;
  /** Gerekli anahtarlar tanımlı mı? Değilse önbellek servis edilmeye devam eder. */
  isConfigured(): boolean;
  /** Takip edilen semboller (önbelleğe alınan liste) */
  getTrackedSymbols(): string[];
  /** Takip edilen sembollerin güncel kotasyonları */
  getPopularStocks(): Promise<StockQuote[]>;
  getStockData(symbol: string): Promise<StockQuote>;

  /* İsteğe bağlı keşif/yönetim yetenekleri (admin uçları); sağlayıcı desteklemiyorsa tanımlanmaz */
  listSymbols?(exchange?: string): Promise<StockSymbolInfo[]>;
  countSymbols?(exchange?: string): Promise<number>;
  exchangeCounts?(): Promise<{ exchange: string; count: number }[]>;
  activeStocks?(exchange?: string, maxStocks?: number, minMarketCap?: number): Promise<StockQuote[]>;
  testConnection?(): Promise<boolean>;
}

/* ---------------------------------- Kripto --------------------------------- */

export interface CryptoCoinQuote {
  /** Sağlayıcıdaki kimlik (ör. CoinGecko id: "bitcoin"); grafik geçmişi için kullanılır */
  id: string;
  symbol: string;
  name: string;
  image: string;
  /** USD */
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
}

export interface CryptoProvider {
  readonly id: string;
  /** Piyasa değerine göre ilk `limit` coin; hata durumunda boş dizi döner */
  getTopCoins(limit: number): Promise<CryptoCoinQuote[]>;
}

/* ---------------------------------- Döviz ---------------------------------- */

export interface FxRate {
  code: string;
  name: string;
  /** TL */
  buying: number;
  /** TL */
  selling: number;
  changeRate: number;
  datetime: string;
}

export interface FxProvider {
  readonly id: string;
  getList(): Promise<{ code: string; name: string }[]>;
  /** Sağlayıcıdan güncel kurları çekip `currency_rates` tablosuna yazar; yazılan kayıt sayısını döner */
  refreshRates(): Promise<number>;
  /** Saklanan (son bilinen) kurlar */
  getStoredRates(): Promise<FxRate[]>;
  getStoredRate(code: string): Promise<FxRate | null>;
}

/* ---------------------------------- Emtia ---------------------------------- */

export interface CommodityQuote {
  code: string;
  name: string;
  buying: number;
  selling: number;
  changeRate: number;
  datetime: string;
  quoteCurrency: 'TRY' | 'USD';
  /** Fiyatın sağlayıcıdan çekildiği an (ms) */
  fetchedAt: number;
}

export interface CommodityProvider {
  readonly id: string;
  isConfigured(): boolean;
  getList(): Promise<{ code: string; name: string }[]>;
  /** Öne çıkan emtiaların (önbellekli) fiyatları */
  getPopularPrices(): Promise<CommodityQuote[]>;
  /**
   * Tek emtia fiyatı; `refreshAfterMs`'den eskiyse yenilemeyi dener,
   * başarısızsa `maxAgeMs`'den genç son bilinen değeri döner, yoksa null.
   */
  getPrice(code: string, refreshAfterMs?: number, maxAgeMs?: number): Promise<CommodityQuote | null>;
  /** Fiyatı TL cinsinden mi kote ediliyor? (aksi halde USD) */
  isTryQuoted(code: string): boolean;
}

/* ---------------------------------- Haber ---------------------------------- */

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  creator?: string;
  categories: string[];
  description: string;
  content?: string;
  image?: string | null;
}

export interface NewsProvider {
  readonly id: string;
  getNews(limit: number): Promise<NewsArticle[]>;
}
