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
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';

export class FinnhubService {
  private static async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      // Rate limit kontrolü - gerekirse beklet
      await RateLimiter.waitIfNeeded();
      
      const url = `${FINNHUB_BASE}${endpoint}`;
      const queryParams = new URLSearchParams({
        token: FINNHUB_API_KEY,
        ...params
      });
      
      const { data } = await axios.get(`${url}?${queryParams}`, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      // API çağrısını kaydet
      RateLimiter.recordCall(1);
      
      if ((data as any).error) {
        throw new Error((data as any).error);
      }
      
      return data as T;
    } catch (error: any) {
      // 429 hatası geldiğinde özel işlem yap
      if (error.response?.status === 429 || error.status === 429) {
        RateLimiter.record429Error();
        // 429 hatasında çağrıyı kaydetme (zaten limit aşıldı)
      } else {
        // Diğer hatalarda çağrıyı kaydet
        RateLimiter.recordCall(1);
      }
      console.error('Finnhub API error:', error);
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
        marketCap: profile.marketCapitalization || 0,
        logo: profile.logo || '',
        industry: profile.finnhubIndustry || ''
      };
    } catch (error) {
      console.error(`Error fetching stock data for ${symbol}:`, error);
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

  // Aktif hisse senetlerini batch'ler halinde çek
  private static async fetchStocksInBatches(
    symbols: StockSymbol[], 
    batchSize: number = 30, // Rate limit için batch size'ı azalttık
    maxStocks: number = 500
  ): Promise<StockData[]> {
    const limitedSymbols = symbols.slice(0, maxStocks);
    const stocks: StockData[] = [];
    
    console.log(`📊 ${limitedSymbols.length} adet hisse senedi çekiliyor...`);
    RateLimiter.logStatus();
    
    // Her hisse senedi için 2 API çağrısı yapılıyor (quote + profile)
    // Bu yüzden batch size'ı daha küçük tutuyoruz
    const actualBatchSize = Math.min(batchSize, 30); // Maksimum 30 (60 çağrı/dakika / 2 = 30 hisse/dakika)
    
    for (let i = 0; i < limitedSymbols.length; i += actualBatchSize) {
      const batch = limitedSymbols.slice(i, i + actualBatchSize);
      
      // Her hisse senedi için sırayla çek (paralel çekmek rate limit'i aşabilir)
      for (const symbol of batch) {
        try {
          const stockData = await this.getStockData(symbol.symbol);
          if (stockData && stockData.price > 0) {
            stocks.push(stockData);
          }
        } catch (error) {
          console.error(`Error fetching ${symbol.symbol}:`, (error as Error).message);
        }
        
        // Her çağrıdan sonra rate limit durumunu kontrol et
        const status = RateLimiter.getStatus();
        if (status.remaining < 5) {
          console.log(`⚠️  Rate limit yaklaşıyor (${status.remaining} kaldı), bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekle
        }
      }
      
      const batchNum = Math.floor(i / actualBatchSize) + 1;
      const totalBatches = Math.ceil(limitedSymbols.length / actualBatchSize);
      console.log(`✅ Batch ${batchNum}/${totalBatches}: ${stocks.length} başarılı`);
      RateLimiter.logStatus();
      
      // Son batch değilse, rate limit için bekle
      if (i + actualBatchSize < limitedSymbols.length) {
        // Her hisse senedi 2 çağrı yapıyor, bu yüzden daha uzun bekle
        // 60 çağrı/dakika = 1 çağrı/saniye, 2 çağrı/hisse = 0.5 hisse/saniye
        // Güvenli olması için 1.5 saniye bekleyelim
        await new Promise(resolve => setTimeout(resolve, 1500));
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
        filteredStocks = stocks.filter(stock => stock.marketCap >= minMarketCap);
      }
      
      // Market cap'e göre sırala (büyükten küçüğe)
      filteredStocks.sort((a, b) => b.marketCap - a.marketCap);
      
      console.log(`🎉 ${filteredStocks.length} adet aktif hisse senedi başarıyla çekildi`);
      
      return filteredStocks;
    } catch (error) {
      console.error('Error fetching active stocks:', error);
      throw error;
    }
  }

  // Popüler hisse senetleri listesi (eski metod - geriye dönük uyumluluk için)
  static async getPopularStocks(): Promise<StockData[]> {
    // Önce aktif hisse senetlerini çekmeyi dene
    try {
      // Daha düşük market cap threshold ile daha fazla hisse çekmeyi dene
      const activeStocks = await this.getActiveStocks('US', 150, 500000000); // 500 milyon $ üzeri, 150 hisse
      if (activeStocks.length > 0) {
        // En popüler 50 tanesini döndür
        return activeStocks.slice(0, 50);
      }
    } catch (error) {
      console.warn('Active stocks fetch failed, falling back to hardcoded list:', error);
    }
    
    // Fallback: Genişletilmiş hardcoded liste (50+ popüler hisse senedi)
    const popularSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'INTC',
      'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC',
      'XOM', 'CVX', 'ABBV', 'PFE', 'KO', 'AVGO', 'PEP', 'TMO', 'COST', 'ABT',
      'MRK', 'ACN', 'CSCO', 'ADBE', 'CRM', 'NKE', 'TXN', 'CMCSA', 'NEE', 'LIN',
      'PM', 'RTX', 'HON', 'QCOM', 'UPS', 'AMGN', 'LOW', 'IBM', 'SPGI', 'INTU',
      'AMT', 'DE', 'CAT', 'GE', 'GS', 'AXP', 'BKNG', 'SBUX', 'MDT', 'ISRG'
    ];
    
    try {
      const stockPromises = popularSymbols.map(symbol => 
        this.getStockData(symbol).catch(error => {
          console.error(`Error fetching ${symbol}:`, error);
          return null;
        })
      );
      
      const stocks = await Promise.all(stockPromises);
      return stocks.filter(stock => stock !== null) as StockData[];
    } catch (error) {
      console.error('Error fetching popular stocks:', error);
      throw error;
    }
  }

  // Borsadaki tüm sembolleri al
  static async getStockSymbols(exchange: string = 'US'): Promise<StockSymbol[]> {
    return this.makeRequest<StockSymbol[]>('/stock/symbol', { exchange });
  }

  // Borsadaki toplam hisse senedi sayısını al
  static async getStockCount(exchange: string = 'US'): Promise<number> {
    try {
      const symbols = await this.getStockSymbols(exchange);
      return symbols.length;
    } catch (error) {
      console.error(`Error getting stock count for ${exchange}:`, error);
      throw error;
    }
  }

  // Tüm borsaları ve her birindeki hisse senedi sayısını al
  static async getExchangeStockCounts(): Promise<{ exchange: string; count: number }[]> {
    const exchanges = ['US', 'NASDAQ', 'NYSE', 'AMEX', 'LSE', 'XETR', 'XPAR', 'XAMS', 'XBRU', 'XMIL', 'XSTO', 'XHEL', 'XCOP', 'XOSL', 'XWAR', 'XIST'];
    const results: { exchange: string; count: number }[] = [];
    
    for (const exchange of exchanges) {
      try {
        const count = await this.getStockCount(exchange);
        results.push({ exchange, count });
        // Rate limiting için kısa bir bekleme
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error getting count for ${exchange}:`, error);
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
    } catch (error) {
      console.error('API Key test failed:', error);
      return false;
    }
  }
}

// Kolay kullanım için export edilen fonksiyonlar
export const getStockQuote = (symbol: string) => FinnhubService.getQuote(symbol);
export const getStockProfile = (symbol: string) => FinnhubService.getProfile(symbol);
export const getStockData = (symbol: string) => FinnhubService.getStockData(symbol);
export const getPopularStocks = () => FinnhubService.getPopularStocks();
export const getActiveStocks = (exchange?: string, maxStocks?: number, minMarketCap?: number) => 
  FinnhubService.getActiveStocks(exchange, maxStocks, minMarketCap);
export const getStockSymbols = (exchange?: string) => FinnhubService.getStockSymbols(exchange);
export const getStockCount = (exchange?: string) => FinnhubService.getStockCount(exchange);
export const getExchangeStockCounts = () => FinnhubService.getExchangeStockCounts();
export const testFinnhubAPI = () => FinnhubService.testAPIKey();
