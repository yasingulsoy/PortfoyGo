"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stopLoss_1 = require("../services/stopLoss");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Stop-loss emri oluştur
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const { portfolio_item_id, trigger_price, quantity } = req.body;
        if (!portfolio_item_id || !trigger_price) {
            return res.status(400).json({
                success: false,
                message: 'Portföy öğesi ID ve tetikleme fiyatı gerekli'
            });
        }
        if (trigger_price <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Tetikleme fiyatı 0\'dan büyük olmalı'
            });
        }
        const result = await stopLoss_1.StopLossService.createStopLoss(req.user.id, {
            portfolio_item_id,
            trigger_price,
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
        console.error('Stop-loss create error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Sunucu hatası'
        });
    }
});
// Kullanıcının stop-loss emirlerini getir
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const result = await stopLoss_1.StopLossService.getStopLossOrders(req.user.id);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Stop-loss emirleri alınamadı'
            });
        }
    }
    catch (error) {
        console.error('Get stop-loss orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Stop-loss emrini iptal et
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await stopLoss_1.StopLossService.cancelStopLoss(req.user.id, id);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Cancel stop-loss error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=stopLoss.js.map