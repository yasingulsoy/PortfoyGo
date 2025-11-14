"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const portfolio_1 = require("../services/portfolio");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Portföy bilgilerini getir
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const result = await portfolio_1.PortfolioService.getPortfolio(req.user.id);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(404).json({
                success: false,
                message: 'Portföy bulunamadı'
            });
        }
    }
    catch (error) {
        console.error('Portfolio route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// İşlem geçmişini getir
router.get('/transactions', auth_1.authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const result = await portfolio_1.PortfolioService.getTransactions(req.user.id, limit);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(404).json({
                success: false,
                message: 'İşlem geçmişi bulunamadı'
            });
        }
    }
    catch (error) {
        console.error('Transactions route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=portfolio.js.map