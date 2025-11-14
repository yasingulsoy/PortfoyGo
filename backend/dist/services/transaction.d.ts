import { PortfolioItem, Transaction } from '../types';
export interface BuyRequest {
    symbol: string;
    name: string;
    asset_type: 'crypto' | 'stock';
    quantity: number;
    price: number;
}
export interface SellRequest {
    symbol: string;
    quantity: number;
}
export declare class TransactionService {
    static buy(userId: string, data: BuyRequest): Promise<{
        success: boolean;
        message?: string;
        transaction?: Transaction;
        portfolioItem?: PortfolioItem;
    }>;
    static sell(userId: string, data: SellRequest): Promise<{
        success: boolean;
        message?: string;
        transaction?: Transaction;
        portfolioItem?: PortfolioItem;
    }>;
    private static updatePortfolioValue;
}
//# sourceMappingURL=transaction.d.ts.map