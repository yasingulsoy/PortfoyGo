// Finnhub → StockProvider. Yalnızca mevcut FinnhubService'e yönlendirir; mantık services/finnhub.ts içindedir.
import { FinnhubService } from '../../services/finnhub';
import type { StockProvider } from '../types';

export const finnhubStockProvider: StockProvider = {
  id: 'finnhub',
  isConfigured: () => FinnhubService.isConfigured(),
  getTrackedSymbols: () => FinnhubService.getTrackedSymbols(),
  getPopularStocks: () => FinnhubService.getPopularStocks(),
  getStockData: (symbol) => FinnhubService.getStockData(symbol),
  listSymbols: (exchange) => FinnhubService.getStockSymbols(exchange),
  countSymbols: (exchange) => FinnhubService.getStockCount(exchange),
  exchangeCounts: () => FinnhubService.getExchangeStockCounts(),
  activeStocks: (exchange, maxStocks, minMarketCap) => FinnhubService.getActiveStocks(exchange, maxStocks, minMarketCap),
  testConnection: () => FinnhubService.testAPIKey(),
};
