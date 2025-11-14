"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const finnhub_1 = require("../services/finnhub");
const marketCache_1 = require("../services/marketCache");
const router = express_1.default.Router();
// API key testi
router.get('/test', async (req, res) => {
    try {
        const isWorking = await (0, finnhub_1.testFinnhubAPI)();
        res.json({
            success: isWorking,
            message: isWorking ? 'Finnhub API çalışıyor' : 'Finnhub API çalışmıyor'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'API test hatası',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Tek hisse senedi verisi (cache'den)
router.get('/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        // Önce cache'den kontrol et
        const cachedStocks = await marketCache_1.MarketCacheService.getFromCache('stock', symbol);
        if (cachedStocks.length > 0) {
            const cached = cachedStocks[0];
            return res.json({
                success: true,
                data: {
                    symbol: cached.symbol,
                    name: cached.name,
                    price: cached.price,
                    change: cached.change,
                    changePercent: cached.change_percent,
                    volume: cached.volume,
                    marketCap: cached.market_cap,
                    previousClose: cached.previous_close,
                    open: cached.open_price,
                    high: cached.high_price,
                    low: cached.low_price
                }
            });
        }
        // Cache'de yoksa API'den çek
        const stockData = await (0, finnhub_1.getStockData)(symbol.toUpperCase());
        res.json({ success: true, data: stockData });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Hisse senedi verisi alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Popüler hisse senetleri (cache'den)
router.get('/', async (req, res) => {
    try {
        // Önce cache'den kontrol et
        let stocks = await marketCache_1.MarketCacheService.getFromCache('stock');
        if (stocks.length === 0) {
            // Cache boşsa, cache'i yenile ve tekrar dene
            try {
                await marketCache_1.MarketCacheService.refreshCache();
                stocks = await marketCache_1.MarketCacheService.getFromCache('stock');
            }
            catch (error) {
                console.error('Cache refresh error, falling back to API:', error);
                // Fallback: API'den direkt çek
                const apiStocks = await (0, finnhub_1.getPopularStocks)();
                return res.json({ success: true, data: apiStocks });
            }
        }
        res.json({
            success: true,
            data: stocks.map(s => ({
                symbol: s.symbol,
                name: s.name,
                price: s.price,
                change: s.change,
                changePercent: s.change_percent,
                volume: s.volume,
                marketCap: s.market_cap,
                previousClose: s.previous_close,
                open: s.open_price,
                high: s.high_price,
                low: s.low_price
            }))
        });
    }
    catch (error) {
        console.error('Stocks route error:', error);
        res.status(500).json({
            success: false,
            message: 'Hisse senetleri listesi alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
exports.default = router;
//# sourceMappingURL=stocks.js.map