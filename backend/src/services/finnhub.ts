import axios from 'axios';

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

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';

export class FinnhubService {
  private static async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
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
      
      if ((data as any).error) {
        throw new Error((data as any).error);
      }
      
      return data as T;
    } catch (error) {
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

  // Popüler hisse senetleri listesi
  static async getPopularStocks(): Promise<StockData[]> {
    const popularSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'INTC'];
    
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
export const testFinnhubAPI = () => FinnhubService.testAPIKey();
