"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const marketCache_1 = require("../services/marketCache");
const router = express_1.default.Router();
// Popüler kripto paralar (cache'den)
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 25;
        const cryptos = await marketCache_1.MarketCacheService.getFromCache('crypto');
        if (cryptos.length === 0) {
            // Cache boşsa, cache'i yenile ve tekrar dene
            try {
                await marketCache_1.MarketCacheService.refreshCache();
                const refreshedCryptos = await marketCache_1.MarketCacheService.getFromCache('crypto');
                return res.json({
                    success: true,
                    data: refreshedCryptos.slice(0, limit).map(c => ({
                        id: c.metadata?.id || c.symbol.toLowerCase(),
                        symbol: c.symbol.toLowerCase(),
                        name: c.name,
                        current_price: c.price,
                        price_change_percentage_24h: c.change_percent,
                        total_volume: c.volume,
                        market_cap: c.market_cap,
                        image: c.metadata?.image || ''
                    }))
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    message: 'Kripto paralar alınamadı'
                });
            }
        }
        res.json({
            success: true,
            data: cryptos.slice(0, limit).map(c => ({
                id: c.metadata?.id || c.symbol.toLowerCase(),
                symbol: c.symbol.toLowerCase(),
                name: c.name,
                current_price: c.price,
                price_change_percentage_24h: c.change_percent,
                total_volume: c.volume,
                market_cap: c.market_cap,
                image: c.metadata?.image || ''
            }))
        });
    }
    catch (error) {
        console.error('Cryptos route error:', error);
        res.status(500).json({
            success: false,
            message: 'Kripto paralar alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
// Tek kripto verisi (cache'den)
router.get('/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const cryptos = await marketCache_1.MarketCacheService.getFromCache('crypto', symbol);
        if (cryptos.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Kripto para bulunamadı'
            });
        }
        const crypto = cryptos[0];
        res.json({
            success: true,
            data: {
                symbol: crypto.symbol,
                name: crypto.name,
                price: crypto.price,
                change: crypto.change,
                changePercent: crypto.change_percent,
                volume: crypto.volume,
                marketCap: crypto.market_cap,
                previousClose: crypto.previous_close,
                open: crypto.open_price,
                high: crypto.high_price,
                low: crypto.low_price
            }
        });
    }
    catch (error) {
        console.error('Crypto route error:', error);
        res.status(500).json({
            success: false,
            message: 'Kripto para verisi alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
exports.default = router;
//# sourceMappingURL=cryptos.js.map