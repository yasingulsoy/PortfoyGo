"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const admin_1 = require("../services/admin");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Basit admin kontrolü (gerçek uygulamada daha güvenli olmalı)
const isAdmin = (req, res, next) => {
    // Şimdilik tüm authenticated kullanıcılara izin ver
    // Gerçek uygulamada admin rolü kontrolü yapılmalı
    next();
};
// Admin istatistikleri
router.get('/stats', auth_1.authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await admin_1.AdminService.getStats();
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: 'İstatistikler alınamadı'
            });
        }
    }
    catch (error) {
        console.error('Admin stats route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Tüm kullanıcıları getir
router.get('/users', auth_1.authenticateToken, isAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const result = await admin_1.AdminService.getAllUsers(limit, offset);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Kullanıcılar alınamadı'
            });
        }
    }
    catch (error) {
        console.error('Admin users route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map