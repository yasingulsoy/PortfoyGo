"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testFinnhubAPI = exports.getPopularStocks = exports.getStockData = exports.getStockProfile = exports.getStockQuote = exports.FinnhubService = void 0;
const axios_1 = __importDefault(require("axios"));
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';
class FinnhubService {
    static async makeRequest(endpoint, params = {}) {
        try {
            const url = `${FINNHUB_BASE}${endpoint}`;
            const queryParams = new URLSearchParams({
                token: FINNHUB_API_KEY,
                ...params
            });
            const { data } = await axios_1.default.get(`${url}?${queryParams}`, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });
            if (data.error) {
                throw new Error(data.error);
            }
            return data;
        }
        catch (error) {
            console.error('Finnhub API error:', error);
            throw error;
        }
    }
    // Hisse senedi fiyatı al
    static async getQuote(symbol) {
        return this.makeRequest('/quote', { symbol });
    }
    // Hisse senedi profili al
    static async getProfile(symbol) {
        return this.makeRequest('/stock/profile2', { symbol });
    }
    // Hisse senedi detaylı verisi al (fiyat + profil)
    static async getStockData(symbol) {
        try {
            const [quote, profile] = await Promise.all([
                this.getQuote(symbol),
                this.getProfile(symbol)
            ]);
            return {
                symbol: symbol.toUpperCase(),
                name: profile.name || symbol,
                price: quote.c,
                change: quote.d,
                changePercent: quote.dp,
                high: quote.h,
                low: quote.l,
                open: quote.o,
                previousClose: quote.pc,
                marketCap: profile.marketCapitalization || 0,
                logo: profile.logo || '',
                industry: profile.finnhubIndustry || ''
            };
        }
        catch (error) {
            console.error(`Error fetching stock data for ${symbol}:`, error);
            throw error;
        }
    }
    // Popüler hisse senetleri listesi
    static async getPopularStocks() {
        const popularSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'INTC'];
        try {
            const stockPromises = popularSymbols.map(symbol => this.getStockData(symbol).catch(error => {
                console.error(`Error fetching ${symbol}:`, error);
                return null;
            }));
            const stocks = await Promise.all(stockPromises);
            return stocks.filter(stock => stock !== null);
        }
        catch (error) {
            console.error('Error fetching popular stocks:', error);
            throw error;
        }
    }
    // API key testi
    static async testAPIKey() {
        try {
            await this.getQuote('AAPL');
            return true;
        }
        catch (error) {
            console.error('API Key test failed:', error);
            return false;
        }
    }
}
exports.FinnhubService = FinnhubService;
// Kolay kullanım için export edilen fonksiyonlar
const getStockQuote = (symbol) => FinnhubService.getQuote(symbol);
exports.getStockQuote = getStockQuote;
const getStockProfile = (symbol) => FinnhubService.getProfile(symbol);
exports.getStockProfile = getStockProfile;
const getStockData = (symbol) => FinnhubService.getStockData(symbol);
exports.getStockData = getStockData;
const getPopularStocks = () => FinnhubService.getPopularStocks();
exports.getPopularStocks = getPopularStocks;
const testFinnhubAPI = () => FinnhubService.testAPIKey();
exports.testFinnhubAPI = testFinnhubAPI;
//# sourceMappingURL=finnhub.js.map