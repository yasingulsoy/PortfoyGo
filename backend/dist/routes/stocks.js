"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const finnhub_1 = require("../services/finnhub");
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
// Tek hisse senedi verisi
router.get('/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
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
// Popüler hisse senetleri
router.get('/', async (req, res) => {
    try {
        const stocks = await (0, finnhub_1.getPopularStocks)();
        res.json({ success: true, data: stocks });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Hisse senetleri listesi alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
    }
});
exports.default = router;
//# sourceMappingURL=stocks.js.map