"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const finnhub_1 = require("../services/finnhub");
const marketCache_1 = require("../services/marketCache");
// Arka planda cache yenilemenin çok sık tetiklenmesini önlemek için basit throttle
// Her istekte değil, en az X dakikada bir arka plan yenilemesi yapalım
const MIN_BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 dakika
let lastBackgroundRefresh = 0;
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
// Cache'i zorla yenile
router.post('/refresh-cache', async (req, res) => {
    try {
        console.log('🔄 Cache zorla yenileniyor...');
        await marketCache_1.MarketCacheService.refreshCache(true); // Tam yenileme
        const stocks = await marketCache_1.MarketCacheService.getFromCache('stock');
        res.json({
            success: true,
            message: `Cache başarıyla yenilendi. ${stocks.length} adet hisse senedi cache'de.`,
            count: stocks.length
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Cache yenileme hatası',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Cache durumunu kontrol et
router.get('/cache-status', async (req, res) => {
    try {
        const status = await marketCache_1.MarketCacheService.getCacheStatus();
        const stocks = await marketCache_1.MarketCacheService.getFromCache('stock');
        res.json({
            success: true,
            data: {
                ...status,
                currentStocks: stocks.length
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Cache durumu alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Borsadaki toplam hisse senedi sayısını al
router.get('/count/:exchange?', async (req, res) => {
    try {
        const exchange = req.params.exchange || 'US';
        const count = await (0, finnhub_1.getStockCount)(exchange);
        res.json({
            success: true,
            data: {
                exchange,
                count,
                message: `${exchange} borsasında toplam ${count} adet hisse senedi bulunmaktadır.`
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Hisse senedi sayısı alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Tüm borsalar ve her birindeki hisse senedi sayısı
router.get('/counts/all', async (req, res) => {
    try {
        const counts = await (0, finnhub_1.getExchangeStockCounts)();
        const total = counts.reduce((sum, item) => sum + item.count, 0);
        res.json({
            success: true,
            data: {
                exchanges: counts,
                total,
                message: `Toplam ${counts.length} borsada ${total} adet hisse senedi bulunmaktadır.`
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Borsa sayıları alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Borsadaki tüm sembolleri listele
router.get('/symbols/:exchange?', async (req, res) => {
    try {
        const exchange = req.params.exchange || 'US';
        const symbols = await (0, finnhub_1.getStockSymbols)(exchange);
        res.json({
            success: true,
            data: {
                exchange,
                count: symbols.length,
                symbols: symbols.slice(0, 100), // İlk 100'ü göster (çok fazla olabilir)
                message: `${exchange} borsasında ${symbols.length} adet hisse senedi bulunmaktadır.`
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Hisse senedi sembolleri alınamadı',
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
                    id: cached.id || cached.symbol,
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
        res.json({
            success: true,
            data: {
                id: stockData.symbol,
                symbol: stockData.symbol,
                name: stockData.name,
                price: stockData.price,
                change: stockData.change,
                changePercent: stockData.changePercent,
                volume: 0,
                marketCap: stockData.marketCap,
                previousClose: stockData.previousClose,
                open: stockData.open,
                high: stockData.high,
                low: stockData.low
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Hisse senedi verisi alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Aktif/önemli hisse senetlerini çek (yeni endpoint)
router.get('/active', async (req, res) => {
    try {
        const exchange = req.query.exchange || 'US';
        const maxStocks = parseInt(req.query.maxStocks) || 500;
        const minMarketCap = parseInt(req.query.minMarketCap) || 0;
        console.log(`📊 Aktif hisse senetleri isteniyor: exchange=${exchange}, maxStocks=${maxStocks}, minMarketCap=${minMarketCap}`);
        const activeStocks = await (0, finnhub_1.getActiveStocks)(exchange, maxStocks, minMarketCap);
        res.json({
            success: true,
            data: {
                count: activeStocks.length,
                exchange,
                stocks: activeStocks.map(s => ({
                    id: s.symbol,
                    symbol: s.symbol,
                    name: s.name,
                    price: s.price,
                    change: s.change,
                    changePercent: s.changePercent,
                    volume: 0,
                    marketCap: s.marketCap,
                    previousClose: s.previousClose,
                    open: s.open,
                    high: s.high,
                    low: s.low,
                    logo: s.logo,
                    industry: s.industry
                }))
            }
        });
    }
    catch (error) {
        console.error('Active stocks route error:', error);
        res.status(500).json({
            success: false,
            message: 'Aktif hisse senetleri alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Popüler hisse senetleri (cache'den hızlıca döndür, arka planda güncelle)
router.get('/', async (req, res) => {
    try {
        // Query parametrelerini al
        const useActive = req.query.active === 'true' || req.query.active === '1';
        const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
        // Önce cache'den kontrol et (her zaman cache'den başla - hızlı yanıt için)
        let stocks = await marketCache_1.MarketCacheService.getFromCache('stock');
        // Cache'de yeterli veri varsa (10'dan fazla) hemen cache'den döndür
        if (stocks.length >= 10 && !forceRefresh) {
            // Arka planda cache'i güncelle (kullanıcıyı bekletmeden)
            // Fakat bunu HER istekte yapmak yerine, en az 5 dakikada bir kez yapalım
            if (!useActive) {
                const now = Date.now();
                const backgroundRefreshEnabled = process.env.ENABLE_BACKGROUND_STOCK_REFRESH !== 'false';
                if (backgroundRefreshEnabled && now - lastBackgroundRefresh > MIN_BACKGROUND_REFRESH_INTERVAL_MS) {
                    lastBackgroundRefresh = now;
                    marketCache_1.MarketCacheService.refreshCache(false).catch(err => {
                        console.error('Background cache refresh error:', err);
                    });
                }
            }
            return res.json({
                success: true,
                data: stocks.map(s => ({
                    id: s.id || s.symbol,
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
        // Cache'de az veri varsa veya zorla yenileme isteniyorsa
        if (stocks.length < 10 || forceRefresh || useActive) {
            // Kullanıcıya cache'den döndür (eğer varsa)
            if (stocks.length > 0 && !forceRefresh) {
                // Arka planda cache'i güncelle
                const hasEnoughCache = stocks.length >= 10;
                const now = Date.now();
                const backgroundRefreshEnabled = process.env.ENABLE_BACKGROUND_STOCK_REFRESH !== 'false';
                if (backgroundRefreshEnabled && now - lastBackgroundRefresh > MIN_BACKGROUND_REFRESH_INTERVAL_MS) {
                    lastBackgroundRefresh = now;
                    marketCache_1.MarketCacheService.refreshCache(!hasEnoughCache).catch(err => {
                        console.error('Background cache refresh error:', err);
                    });
                }
                return res.json({
                    success: true,
                    data: stocks.map(s => ({
                        id: s.id || s.symbol,
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
            // Cache boşsa veya zorla yenileme isteniyorsa, cache'i güncelle ve döndür
            console.log(`📊 Cache güncelleniyor... (${stocks.length} adet mevcut)`);
            await marketCache_1.MarketCacheService.refreshCache(true); // İlk yükleme veya zorla yenileme
            stocks = await marketCache_1.MarketCacheService.getFromCache('stock');
        }
        // Cache'den döndür
        res.json({
            success: true,
            data: stocks.map(s => ({
                id: s.id || s.symbol,
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
        // Son çare: Cache'den ne varsa onu döndür
        try {
            const cachedStocks = await marketCache_1.MarketCacheService.getFromCache('stock');
            if (cachedStocks.length > 0) {
                return res.json({
                    success: true,
                    data: cachedStocks.map(s => ({
                        id: s.id || s.symbol,
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
        }
        catch (cacheError) {
            console.error('Cache fallback error:', cacheError);
        }
        // En son çare: Hardcoded popüler hisse senetleri
        try {
            const apiStocks = await (0, finnhub_1.getPopularStocks)();
            return res.json({
                success: true,
                data: apiStocks.map(s => ({
                    id: s.symbol,
                    symbol: s.symbol,
                    name: s.name,
                    price: s.price,
                    change: s.change,
                    changePercent: s.changePercent,
                    volume: 0,
                    marketCap: s.marketCap,
                    previousClose: s.previousClose,
                    open: s.open,
                    high: s.high,
                    low: s.low
                }))
            });
        }
        catch (fallbackError) {
            res.status(500).json({
                success: false,
                message: 'Hisse senetleri listesi alınamadı',
                error: error instanceof Error ? error.message : 'Bilinmeyen hata'
            });
        }
    }
});
exports.default = router;
//# sourceMappingURL=stocks.js.map