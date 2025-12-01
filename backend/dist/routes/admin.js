"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const admin_1 = require("../services/admin");
const auth_1 = require("../middleware/auth");
const admin_2 = require("../middleware/admin");
const router = express_1.default.Router();
// Admin istatistikleri
router.get('/stats', auth_1.authenticateToken, admin_2.isAdmin, async (req, res) => {
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
router.get('/users', auth_1.authenticateToken, admin_2.isAdmin, async (req, res) => {
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
// Kullanıcıyı banla/unban yap
router.post('/users/:userId/ban', auth_1.authenticateToken, admin_2.isAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { ban } = req.body; // true = ban, false = unban
        if (typeof ban !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Ban değeri boolean olmalı'
            });
        }
        const result = await admin_1.AdminService.toggleUserBan(userId, ban);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: result.message || 'İşlem başarısız'
            });
        }
    }
    catch (error) {
        console.error('Admin ban route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map