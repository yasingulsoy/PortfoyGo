export interface Stock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
}

export interface PortfolioItem {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  profitLoss: number;
  profitLossPercent: number;
}

export interface Transaction {
  id: string;
  type: 'buy' | 'sell';
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  totalAmount: number;
  commission: number;
  timestamp: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  balance: number;
  portfolioValue: number;
  totalProfitLoss: number;
  rank: number;
  joinDate: Date;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  portfolioValue: number;
  totalProfitLoss: number;
  profitLossPercent: number;
}

export interface MarketData {
  stocks: Stock[];
  lastUpdated: Date;
}
