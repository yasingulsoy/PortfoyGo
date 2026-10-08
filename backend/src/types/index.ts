export type AssetType = 'crypto' | 'stock' | 'commodity' | 'currency';

export interface User {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  balance: number;
  portfolio_value: number;
  total_profit_loss: number;
  rank: number | null;
  created_at: Date;
  is_admin?: boolean;
  is_banned?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface PortfolioItem {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  average_price: number;
  current_price: number;
  total_value: number;
  profit_loss: number;
  profit_loss_percent: number;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'buy' | 'sell';
  symbol: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  price: number;
  total_amount: number;
  commission: number;
  net_amount: number;
  created_at: Date;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** DB satırını (NUMERIC'ler string gelir) JS sayılarına çevirir. */
export function mapPortfolioRow(row: any): PortfolioItem {
  return {
    id: row.id,
    user_id: row.user_id,
    symbol: row.symbol,
    name: row.name,
    asset_type: row.asset_type,
    quantity: num(row.quantity),
    average_price: num(row.average_price),
    current_price: num(row.current_price),
    total_value: num(row.total_value),
    profit_loss: num(row.profit_loss),
    profit_loss_percent: num(row.profit_loss_percent),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapTransactionRow(row: any): Transaction {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    symbol: row.symbol,
    name: row.name,
    asset_type: row.asset_type,
    quantity: num(row.quantity),
    price: num(row.price),
    total_amount: num(row.total_amount),
    commission: num(row.commission),
    net_amount: num(row.net_amount),
    created_at: row.created_at,
  };
}

export function mapUserRow(row: any, rankOverride?: number | null): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    email_verified: !!row.email_verified,
    balance: num(row.balance),
    portfolio_value: num(row.portfolio_value),
    total_profit_loss: num(row.total_profit_loss),
    rank: rankOverride !== undefined ? rankOverride : row.rank ?? null,
    created_at: row.created_at,
    is_admin: !!row.is_admin,
  };
}

export { num as toNumber };
