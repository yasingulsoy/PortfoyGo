import { PortfolioItem, Transaction } from '../types';
export declare class PortfolioService {
    static getPortfolio(userId: string): Promise<{
        success: boolean;
        portfolio?: PortfolioItem[];
        balance?: number;
        portfolioValue?: number;
        totalProfitLoss?: number;
    }>;
    static getTransactions(userId: string, limit?: number): Promise<{
        success: boolean;
        transactions?: Transaction[];
    }>;
    static updatePortfolioPrices(userId: string, priceUpdates: {
        symbol: string;
        asset_type: string;
        price: number;
    }[]): Promise<void>;
}
//# sourceMappingURL=portfolio.d.ts.map