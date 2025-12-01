export interface FinnhubQuote {
    c: number;
    d: number;
    dp: number;
    h: number;
    l: number;
    o: number;
    pc: number;
    t: number;
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
export interface StockSymbol {
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
    currency?: string;
    figi?: string;
    mic?: string;
}
export declare class FinnhubService {
    private static apiKeys;
    private static currentKeyIndex;
    /**
     * Kullanılabilir bir API key seç (round-robin, rate limit'e göre)
     */
    private static getAvailableApiKey;
    private static makeRequest;
    static getQuote(symbol: string): Promise<FinnhubQuote>;
    static getProfile(symbol: string): Promise<FinnhubProfile>;
    static getStockData(symbol: string): Promise<StockData>;
    private static filterActiveStocks;
    private static processWithConcurrencyLimit;
    private static fetchStocksInBatches;
    static getActiveStocks(exchange?: string, maxStocks?: number, minMarketCap?: number): Promise<StockData[]>;
    static getPopularStocks(): Promise<StockData[]>;
    static getStockSymbols(exchange?: string): Promise<StockSymbol[]>;
    static getStockCount(exchange?: string): Promise<number>;
    static getExchangeStockCounts(): Promise<{
        exchange: string;
        count: number;
    }[]>;
    static testAPIKey(): Promise<boolean>;
}
export declare const getStockQuote: (symbol: string) => Promise<FinnhubQuote>;
export declare const getStockProfile: (symbol: string) => Promise<FinnhubProfile>;
export declare const getStockData: (symbol: string) => Promise<StockData>;
export declare const getPopularStocks: () => Promise<StockData[]>;
export declare const getActiveStocks: (exchange?: string, maxStocks?: number, minMarketCap?: number) => Promise<StockData[]>;
export declare const getStockSymbols: (exchange?: string) => Promise<StockSymbol[]>;
export declare const getStockCount: (exchange?: string) => Promise<number>;
export declare const getExchangeStockCounts: () => Promise<{
    exchange: string;
    count: number;
}[]>;
export declare const testFinnhubAPI: () => Promise<boolean>;
//# sourceMappingURL=finnhub.d.ts.map