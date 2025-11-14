"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const transaction_1 = require("../services/transaction");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Alış işlemi
router.post('/buy', auth_1.authenticateToken, async (req, res) => {
    try {
        const { symbol, name, asset_type, quantity, price } = req.body;
        // Validasyon
        if (!symbol || !name || !asset_type || !quantity || !price) {
            return res.status(400).json({
                success: false,
                message: 'Tüm alanlar gerekli'
            });
        }
        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Miktar 0\'dan büyük olmalı'
            });
        }
        if (price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Fiyat 0\'dan büyük olmalı'
            });
        }
        if (!['crypto', 'stock'].includes(asset_type)) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz varlık tipi'
            });
        }
        const result = await transaction_1.TransactionService.buy(req.user.id, {
            symbol,
            name,
            asset_type,
            quantity,
            price
        });
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Buy route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Satış işlemi
router.post('/sell', auth_1.authenticateToken, async (req, res) => {
    try {
        const { symbol, quantity } = req.body;
        // Validasyon
        if (!symbol || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Sembol ve miktar gerekli'
            });
        }
        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Miktar 0\'dan büyük olmalı'
            });
        }
        const result = await transaction_1.TransactionService.sell(req.user.id, {
            symbol,
            quantity
        });
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Sell route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=transactions.js.map