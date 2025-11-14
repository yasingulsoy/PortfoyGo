"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const leaderboard_1 = require("../services/leaderboard");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Liderlik tablosunu getir
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const result = await leaderboard_1.LeaderboardService.getLeaderboard(limit);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Liderlik tablosu alınamadı'
            });
        }
    }
    catch (error) {
        console.error('Leaderboard route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Kullanıcının rank'ini getir
router.get('/my-rank', auth_1.authenticateToken, async (req, res) => {
    try {
        const result = await leaderboard_1.LeaderboardService.getUserRank(req.user.id);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(404).json({
                success: false,
                message: 'Rank bulunamadı'
            });
        }
    }
    catch (error) {
        console.error('My rank route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=leaderboard.js.map