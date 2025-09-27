export interface User {
    id: string;
    username: string;
    email: string;
    email_verified: boolean;
    balance: number;
    portfolio_value: number;
    total_profit_loss: number;
    rank: number;
    created_at: Date;
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
    asset_type: 'crypto' | 'stock';
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
    asset_type: 'crypto' | 'stock';
    quantity: number;
    price: number;
    total_amount: number;
    commission: number;
    net_amount: number;
    created_at: Date;
}
//# sourceMappingURL=index.d.ts.map