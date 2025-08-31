import axios from 'axios';
import { Stock, MarketData } from '@/types';

// Ücretsiz finansal API'ler
const ALPHA_VANTAGE_API_KEY = 'demo'; // Ücretsiz demo key
const FINNHUB_API_KEY = 'demo'; // Ücretsiz demo key

// Mock data - gerçek API'ler için kullanılacak
const mockStocks: Stock[] = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 150.25,
    change: 2.15,
    changePercent: 1.45,
    volume: 45678900,
    marketCap: 2400000000000,
    previousClose: 148.10,
    open: 149.50,
    high: 151.80,
    low: 148.90
  },
  {
    id: '2',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    price: 320.80,
    change: -1.20,
    changePercent: -0.37,
    volume: 23456700,
    marketCap: 2400000000000,
    previousClose: 322.00,
    open: 321.50,
    high: 323.20,
    low: 319.80
  },
  {
    id: '3',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    price: 2750.50,
    change: 45.30,
    changePercent: 1.67,
    volume: 1234567,
    marketCap: 1800000000000,
    previousClose: 2705.20,
    open: 2710.00,
    high: 2760.80,
    low: 2700.50
  },
  {
    id: '4',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    price: 245.60,
    change: 8.40,
    changePercent: 3.54,
    volume: 56789000,
    marketCap: 780000000000,
    previousClose: 237.20,
    open: 238.50,
    high: 246.80,
    low: 237.00
  },
  {
    id: '5',
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    price: 3200.00,
    change: -25.50,
    changePercent: -0.79,
    volume: 3456789,
    marketCap: 1600000000000,
    previousClose: 3225.50,
    open: 3220.00,
    high: 3230.00,
    low: 3180.00
  },
  {
    id: '6',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    price: 450.75,
    change: 12.25,
    changePercent: 2.80,
    volume: 23456789,
    marketCap: 1100000000000,
    previousClose: 438.50,
    open: 440.00,
    high: 452.00,
    low: 438.00
  },
  {
    id: '7',
    symbol: 'META',
    name: 'Meta Platforms Inc.',
    price: 280.30,
    change: 5.20,
    changePercent: 1.89,
    volume: 34567890,
    marketCap: 700000000000,
    previousClose: 275.10,
    open: 276.00,
    high: 281.50,
    low: 275.00
  },
  {
    id: '8',
    symbol: 'NFLX',
    name: 'Netflix Inc.',
    price: 420.80,
    change: -8.90,
    changePercent: -2.07,
    volume: 12345678,
    marketCap: 190000000000,
    previousClose: 429.70,
    open: 428.00,
    high: 430.00,
    low: 418.00
  }
];

// Gerçek API çağrıları için fonksiyonlar
export const getMarketData = async (): Promise<MarketData> => {
  try {
    // Gerçek API kullanımı için:
    // const response = await axios.get(`https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_VANTAGE_API_KEY}`);
    
    // Şimdilik mock data kullanıyoruz
    return {
      stocks: mockStocks,
      lastUpdated: new Date()
    };
  } catch (error) {
    console.error('Market data fetch error:', error);
    return {
      stocks: mockStocks,
      lastUpdated: new Date()
    };
  }
};

export const getStockQuote = async (symbol: string): Promise<Stock | null> => {
  try {
    // Gerçek API kullanımı için:
    // const response = await axios.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`);
    
    const stock = mockStocks.find(s => s.symbol === symbol);
    return stock || null;
  } catch (error) {
    console.error('Stock quote fetch error:', error);
    return null;
  }
};

// Fiyat güncellemeleri için simülasyon
export const simulatePriceUpdates = (stocks: Stock[]): Stock[] => {
  return stocks.map(stock => {
    const changePercent = (Math.random() - 0.5) * 0.1; // ±5% değişim
    const change = stock.price * changePercent;
    const newPrice = stock.price + change;
    
    return {
      ...stock,
      price: Math.round(newPrice * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 10000) / 100
    };
  });
};
