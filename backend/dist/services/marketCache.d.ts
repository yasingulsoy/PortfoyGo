export interface CachedMarketData {
    id: string;
    asset_type: 'stock' | 'crypto';
    symbol: string;
    name: string;
    price: number;
    change: number;
    change_percent: number;
    volume: number;
    market_cap: number;
    previous_close?: number;
    open_price?: number;
    high_price?: number;
    low_price?: number;
    metadata?: any;
    cached_at: Date;
    expires_at: Date;
}
export declare class MarketCacheService {
    static getFromCache(assetType: 'stock' | 'crypto', symbol?: string): Promise<CachedMarketData[]>;
    static saveToCache(data: Omit<CachedMarketData, 'id' | 'cached_at' | 'expires_at'>[]): Promise<void>;
    static refreshCache(): Promise<void>;
    static getCacheStatus(): Promise<{
        stocks: number;
        cryptos: number;
        oldestCache: Date | null;
        newestCache: Date | null;
    }>;
}
//# sourceMappingURL=marketCache.d.ts.map