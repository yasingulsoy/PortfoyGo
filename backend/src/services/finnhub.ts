import axios from 'axios';
import { RateLimiter } from './rateLimiter';

export interface FinnhubQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
  t: number;  // Timestamp
}

export interface FinnhubProfile {
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  logo: string;
  finnhubIndustry: string;
}

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap: number;
  logo: string;
  industry: string;
}

export interface StockSymbol {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
  currency?: string;
  figi?: string;
  mic?: string;
}

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Çoklu API key desteği — anahtarlar SADECE ortam değişkenlerinden okunur.
// FINNHUB_API_KEYS (virgülle ayrılmış) veya FINNHUB_API_KEY
function getApiKeys(): string[] {
  const keysEnv = process.env.FINNHUB_API_KEYS;
  if (keysEnv && keysEnv.trim()) {
    return keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }
  const single = process.env.FINNHUB_API_KEY?.trim();
  return single ? [single] : [];
}

/** Finnhub anahtarı yokken fırlatılır; çağıranlar cache'ten servis etmelidir. */
export class FinnhubNotConfiguredError extends Error {
  constructor() {
    super('Finnhub API key is not configured');
  }
}

let missingKeyWarned = false;

/** Hata nesnesinden sadece güvenli alanları (URL/token içermeyen) çıkarır. */
export function describeHttpError(error: any): string {
  const status = error?.response?.status ?? error?.status;
  const msg = error?.message || 'unknown error';
  // axios hata mesajları URL içermez; yine de token parametresini maskele
  return `${status ? `HTTP ${status} - ` : ''}${String(msg).replace(/token=[^&\s]+/gi, 'token=***')}`;
}

export class FinnhubService {
  private static apiKeys: string[] = getApiKeys();
  private static currentKeyIndex = 0;

  static isConfigured(): boolean {
    if (this.apiKeys.length === 0 && !missingKeyWarned) {
      missingKeyWarned = true;
      console.warn('[finnhub] FINNHUB_API_KEY(S) tanımlı değil; hisse verileri sadece mevcut cache içeriğinden sunulacak.');
    }
    return this.apiKeys.length > 0;
  }
  
  /**
   * Kullanılabilir bir API key seç (round-robin, rate limit'e göre)
   */
  private static getAvailableApiKey(): string {
    // Önce kullanılabilir key'leri bul
    const availableKeys = this.apiKeys.filter(key => {
      const status = RateLimiter.getStatus(key);
      return status.isAvailable && status.remaining > 0;
    });
    
    if (availableKeys.length === 0) {
      // Hiç kullanılabilir key yoksa, en az kullanılan key'i seç
      let minUsed = Infinity;
      let bestKey = this.apiKeys[0];
      
      for (const key of this.apiKeys) {
        const status = RateLimiter.getStatus(key);
        if (status.remaining > minUsed) {
          minUsed = status.remaining;
          bestKey = key;
        }
      }
      return bestKey;
    }
    
    // Round-robin ile sıradaki key'i seç
    const selectedKey = availableKeys[this.currentKeyIndex % availableKeys.length];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % availableKeys.length;
    
    return selectedKey;
  }

  private static async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.isConfigured()) {
      throw new FinnhubNotConfiguredError();
    }
    const apiKey = this.getAvailableApiKey();
    
    try {
      // Rate limit kontrolü - gerekirse beklet
      await RateLimiter.waitIfNeeded(apiKey);
      
      const url = `${FINNHUB_BASE}${endpoint}`;
      const queryParams = new URLSearchParams({
        token: apiKey,
        ...params
      });
      
      const { data } = await axios.get(`${url}?${queryParams}`, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      // API çağrısını kaydet
      RateLimiter.recordCall(apiKey, 1);
      
      if ((data as any).error) {
        throw new Error((data as any).error);
      }
      
      return data as T;
    } catch (error: any) {
      // 429 hatası geldiğinde özel işlem yap
      if (error.response?.status === 429 || error.status === 429) {
        RateLimiter.record429Error(apiKey);
        // 429 hatasında çağrıyı kaydetme (zaten limit aşıldı)
      } else {
        // Diğer hatalarda çağrıyı kaydet
        RateLimiter.recordCall(apiKey, 1);
      }
      console.error(`[finnhub] ${endpoint} error: ${describeHttpError(error)}`);
      throw error;
    }
  }

  // Hisse senedi fiyatı al
  static async getQuote(symbol: string): Promise<FinnhubQuote> {
    return this.makeRequest<FinnhubQuote>('/quote', { symbol });
  }

  // Hisse senedi profili al
  static async getProfile(symbol: string): Promise<FinnhubProfile> {
    return this.makeRequest<FinnhubProfile>('/stock/profile2', { symbol });
  }

  // Hisse senedi detaylı verisi al (fiyat + profil)
  static async getStockData(symbol: string): Promise<StockData> {
    try {
      const [quote, profile] = await Promise.all([
        this.getQuote(symbol),
        this.getProfile(symbol)
      ]);

      return {
        symbol: symbol.toUpperCase(),
        name: profile.name || symbol,
        price: quote.c,
        change: quote.d,
        changePercent: quote.dp,
        high: quote.h,
        low: quote.l,
        open: quote.o,
        previousClose: quote.pc,
        // Finnhub marketCapitalization MİLYON USD cinsindendir → USD'ye çevir
        marketCap: (Number(profile.marketCapitalization) || 0) * 1_000_000,
        logo: profile.logo || '',
        industry: profile.finnhubIndustry || ''
      };
    } catch (error) {
      if (!(error instanceof FinnhubNotConfiguredError)) {
        console.error(`[finnhub] ${symbol} verisi alınamadı: ${describeHttpError(error)}`);
      }
      throw error;
    }
  }

  // Aktif/önemli hisse senetlerini filtrele
  private static filterActiveStocks(symbols: StockSymbol[]): StockSymbol[] {
    return symbols.filter(symbol => {
      // Sadece Common Stock olanları al (ETF, Warrant, vb. hariç)
      const type = symbol.type?.toUpperCase() || '';
      const isCommonStock = type === 'COMMON STOCK' || type === 'CS' || type === 'EQ';
      
      // Description'ı olanları al (boş olmayan)
      const hasDescription = symbol.description && symbol.description.trim().length > 0;
      
      // Symbol'ü olanları al
      const hasSymbol = symbol.symbol && symbol.symbol.trim().length > 0;
      
      // OTC, Pink Sheet gibi düşük kaliteli piyasaları filtrele (opsiyonel)
      const isNotOTC = !symbol.mic?.includes('OTC') && !symbol.mic?.includes('PINK');
      
      return isCommonStock && hasDescription && hasSymbol;
    });
  }

  // Concurrency limit ile paralel işlem yap (rate limit'i aşmamak için)
  private static async processWithConcurrencyLimit<T, R>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    let index = 0;
    
    const processNext = async (): Promise<void> => {
      while (index < items.length) {
        const currentIndex = index++;
        try {
          const result = await processor(items[currentIndex]);
          results[currentIndex] = result;
        } catch (error) {
          results[currentIndex] = null as any;
        }
      }
    };
    
    // Concurrency kadar paralel işlem başlat
    const workers = Array(Math.min(concurrency, items.length))
      .fill(null)
      .map(() => processNext());
    
    await Promise.all(workers);
    return results.filter(r => r !== null);
  }

  // Aktif hisse senetlerini batch'ler halinde çek (rate limit'e uygun)
  private static async fetchStocksInBatches(
    symbols: StockSymbol[], 
    batchSize: number = 30,
    maxStocks: number = 500
  ): Promise<StockData[]> {
    const limitedSymbols = symbols.slice(0, maxStocks);
    const stocks: StockData[] = [];
    const numKeys = this.apiKeys.length;
    
    console.log(`📊 ${limitedSymbols.length} adet hisse senedi çekiliyor (${numKeys} API key ile)...`);
    RateLimiter.logStatus();
    
    // Her hisse senedi için 2 API çağrısı yapılıyor (quote + profile)
    // 2 key = 120 çağrı/dakika = 60 hisse/dakika potansiyel
    // Güvenli olması için: her key için aynı anda max 5 hisse (10 çağrı)
    // 2 key = aynı anda max 10 hisse (20 çağrı) - güvenli
    const concurrencyPerKey = 5; // Her key için aynı anda max 5 hisse
    const totalConcurrency = numKeys > 1 ? concurrencyPerKey * numKeys : concurrencyPerKey;
    const actualBatchSize = Math.min(batchSize, 30); // Batch size'ı küçük tut
    
    for (let i = 0; i < limitedSymbols.length; i += actualBatchSize) {
      const batch = limitedSymbols.slice(i, i + actualBatchSize);
      const batchNum = Math.floor(i / actualBatchSize) + 1;
      const totalBatches = Math.ceil(limitedSymbols.length / actualBatchSize);
      
      // Batch içinde concurrency limit ile işle
      const batchStocks = await this.processWithConcurrencyLimit(
        batch,
        totalConcurrency,
        async (symbol) => {
          try {
            const stockData = await this.getStockData(symbol.symbol);
            if (stockData && stockData.price > 0) {
              return stockData;
            }
            return null;
          } catch (error) {
            console.error(`[finnhub] ${symbol.symbol}: ${describeHttpError(error)}`);
            return null;
          }
        }
      );
      
      stocks.push(...batchStocks.filter((s): s is StockData => s !== null));
      
      console.log(`✅ Batch ${batchNum}/${totalBatches}: ${batchStocks.filter(s => s !== null).length}/${batch.length} başarılı`);
      RateLimiter.logStatus();
      
      // Batch'ler arası bekleme - rate limit için
      if (i + actualBatchSize < limitedSymbols.length) {
        // Her batch'te ~30 hisse * 2 çağrı = 60 çağrı
        // Rate limiter her key için ayrı takip yapıyor, bu yüzden daha kısa bekleme yeterli
        // 2 key ile: her key için 30 çağrı = 30/60 = 0.5 dakika = 30 saniye
        // Güvenli olması için biraz daha fazla bekleyelim
        const waitTime = numKeys > 1 ? 20000 : 40000; // 2 key: 20s, 1 key: 40s
        console.log(`⏳ Rate limit için ${waitTime / 1000} saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    console.log(`🎉 Toplam ${stocks.length} adet hisse senedi başarıyla çekildi`);
    return stocks;
  }

  // Aktif/önemli hisse senetlerini çek (API'den gerçek veriler)
  static async getActiveStocks(
    exchange: string = 'US',
    maxStocks: number = 500,
    minMarketCap: number = 0
  ): Promise<StockData[]> {
    try {
      console.log(`🔍 ${exchange} borsasından aktif hisse senetleri çekiliyor...`);
      
      // 1. Tüm sembolleri çek
      const allSymbols = await this.getStockSymbols(exchange);
      console.log(`📋 Toplam ${allSymbols.length} sembol bulundu`);
      
      // 2. Aktif olanları filtrele
      const activeSymbols = this.filterActiveStocks(allSymbols);
      console.log(`✅ ${activeSymbols.length} aktif hisse senedi filtrelendi`);
      
      // 3. Detaylarını batch'ler halinde çek
      const stocks = await this.fetchStocksInBatches(activeSymbols, 50, maxStocks);
      
      // 4. Market cap'e göre filtrele ve sırala
      let filteredStocks = stocks;
      if (minMarketCap > 0) {
        // marketCap getStockData'da USD'ye çevrildi; minMarketCap de USD
        filteredStocks = stocks.filter(stock => stock.marketCap >= minMarketCap);
      }
      
      // Market cap'e göre sırala (büyükten küçüğe)
      filteredStocks.sort((a, b) => b.marketCap - a.marketCap);
      
      console.log(`🎉 ${filteredStocks.length} adet aktif hisse senedi başarıyla çekildi`);
      
      return filteredStocks;
    } catch (error) {
      console.error(`[finnhub] Aktif hisseler alınamadı: ${describeHttpError(error)}`);
      throw error;
    }
  }

  /**
   * Takip edilen hisse listesi. STOCK_SYMBOLS env (virgülle ayrılmış) ile değiştirilebilir.
   * (Eskiden önce tüm borsa sembolleri çekilip filtreleniyordu; market cap birim hatası
   * yüzünden bu yol hiçbir zaman sonuç vermiyor ve her seferinde bu listeye düşüyordu.)
   */
  static getTrackedSymbols(): string[] {
    const fromEnv = (process.env.STOCK_SYMBOLS || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9.\-]{1,20}$/.test(s));
    return fromEnv.length > 0
      ? fromEnv.slice(0, 50)
      : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'INTC'];
  }

  // Takip edilen (popüler) hisse senetlerinin güncel verisi
  static async getPopularStocks(): Promise<StockData[]> {
    if (!this.isConfigured()) {
      return [];
    }
    const symbols = this.getTrackedSymbols();
    const stocks = await this.processWithConcurrencyLimit(symbols, 5, async (symbol) => {
      try {
        const data = await this.getStockData(symbol);
        return data && data.price > 0 ? data : null;
      } catch {
        return null;
      }
    });
    return stocks.filter((s): s is StockData => s !== null);
  }

  // Borsadaki tüm sembolleri al
  static async getStockSymbols(exchange: string = 'US'): Promise<StockSymbol[]> {
    return this.makeRequest<StockSymbol[]>('/stock/symbol', { exchange });
  }

  // Borsadaki toplam hisse senedi sayısını al
  static async getStockCount(exchange: string = 'US'): Promise<number> {
    const symbols = await this.getStockSymbols(exchange);
    return symbols.length;
  }

  // Tüm borsaları ve her birindeki hisse senedi sayısını al (admin)
  static async getExchangeStockCounts(): Promise<{ exchange: string; count: number }[]> {
    const exchanges = ['US', 'NASDAQ', 'NYSE', 'AMEX', 'LSE', 'XETR', 'XPAR', 'XAMS', 'XBRU', 'XMIL', 'XSTO', 'XHEL', 'XCOP', 'XOSL', 'XWAR', 'XIST'];
    const results: { exchange: string; count: number }[] = [];

    for (const exchange of exchanges) {
      try {
        const count = await this.getStockCount(exchange);
        results.push({ exchange, count });
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch {
        results.push({ exchange, count: 0 });
      }
    }

    return results;
  }

  // API key testi
  static async testAPIKey(): Promise<boolean> {
    try {
      await this.getQuote('AAPL');
      return true;
    } catch {
      return false;
    }
  }
}

// Kolay kullanım için export edilen fonksiyonlar
export const getActiveStocks = (exchange?: string, maxStocks?: number, minMarketCap?: number) => 
  FinnhubService.getActiveStocks(exchange, maxStocks, minMarketCap);
export const getStockSymbols = (exchange?: string) => FinnhubService.getStockSymbols(exchange);
export const getStockCount = (exchange?: string) => FinnhubService.getStockCount(exchange);
export const getExchangeStockCounts = () => FinnhubService.getExchangeStockCounts();
export const testFinnhubAPI = () => FinnhubService.testAPIKey();
