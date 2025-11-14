"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const badges_1 = require("../services/badges");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Kullanıcının rozetlerini getir
router.get('/my-badges', auth_1.authenticateToken, async (req, res) => {
    try {
        const result = await badges_1.BadgeService.getUserBadges(req.user.id);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Rozetler alınamadı'
            });
        }
    }
    catch (error) {
        console.error('My badges route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Tüm rozetleri getir
router.get('/', async (req, res) => {
    try {
        const result = await badges_1.BadgeService.getAllBadges();
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Rozetler alınamadı'
            });
        }
    }
    catch (error) {
        console.error('All badges route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=badges.js.map