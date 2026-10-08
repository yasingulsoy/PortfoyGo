import type { AssetType } from '@portfoygo/shared/types';

export { ASSET_TYPE_LABELS, type AssetType } from '@portfoygo/shared/types';

/* ---------- Backend'den gelen ham piyasa verileri ---------- */

export interface StockQuote {
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

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  total_volume: number;
}

export interface RateQuote {
  code: string;
  name: string;
  buying: number;
  selling: number;
  price?: number;
  change_rate: number;
  datetime?: string;
}

/* ---------- UI'nin kullandığı normalize edilmiş varlık modeli ---------- */

export interface MarketAsset {
  /** `${type}:${symbol}` — listelerde benzersiz anahtar */
  key: string;
  type: AssetType;
  /** Her zaman büyük harf (BTC, AAPL, USD, GOLD) */
  symbol: string;
  name: string;
  /** Türk lirası birim fiyatı; kur bilinmiyorsa null */
  priceTRY: number | null;
  /** Varlığın kendi kotasyonu USD ise USD fiyatı */
  priceUSD: number | null;
  changePercent: number;
  image?: string;
  /** CoinGecko id (kripto grafiği için) */
  coinId?: string;
  volume?: number;
  marketCap?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
}

/* ---------- Kullanıcı / portföy ---------- */

export interface User {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  balance: number;
  portfolio_value: number;
  total_profit_loss: number;
  rank: number | null;
  created_at: string;
  is_admin?: boolean;
}

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
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
  assetType: AssetType;
  quantity: number;
  price: number;
  totalAmount: number;
  commission: number;
  netAmount: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id?: string;
  username: string;
  balance: number;
  portfolio_value: number;
  total_value?: number;
  total_profit_loss: number;
  profit_loss_percent: number;
  week_profit_loss_tl?: number;
  board?: 'alltime' | 'week';
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  categories: string[];
  description: string;
  image?: string;
  creator?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned?: boolean;
  earned_at?: string;
}

export interface StopLossOrder {
  id: string;
  portfolio_item_id: string;
  symbol: string;
  name?: string;
  trigger_price: number;
  quantity: number;
  status: string;
  created_at: string;
}
