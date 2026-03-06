"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const commodity_1 = require("../services/commodity");
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const prices = await commodity_1.CommodityService.getPopularPrices();
        res.json({
            success: true,
            data: prices.map(p => ({
                code: p.code,
                name: p.name,
                buying: p.buying,
                selling: p.selling,
                price: p.selling,
                change_rate: p.changeRate,
                datetime: p.datetime,
            })),
        });
    }
    catch (error) {
        console.error('Commodities route error:', error);
        res.status(500).json({
            success: false,
            message: 'Emtia verileri alinamadi',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata',
        });
    }
});
router.get('/list', async (req, res) => {
    try {
        const list = await commodity_1.CommodityService.getList();
        res.json({ success: true, data: list });
    }
    catch (error) {
        console.error('Commodities list error:', error);
        res.status(500).json({ success: false, message: 'Emtia listesi alinamadi' });
    }
});
router.get('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const price = await commodity_1.CommodityService.getPrice(code);
        if (!price) {
            return res.status(404).json({ success: false, message: 'Emtia bulunamadi' });
        }
        res.json({
            success: true,
            data: {
                code: price.code,
                name: price.name,
                buying: price.buying,
                selling: price.selling,
                price: price.selling,
                change_rate: price.changeRate,
                datetime: price.datetime,
            },
        });
    }
    catch (error) {
        console.error('Commodity route error:', error);
        res.status(500).json({
            success: false,
            message: 'Emtia verisi alinamadi',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata',
        });
    }
});
exports.default = router;
//# sourceMappingURL=commodities.js.map