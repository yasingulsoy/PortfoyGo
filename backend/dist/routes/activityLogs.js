"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const activityLog_1 = require("../services/activityLog");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Kullanıcının aktivite loglarını getir
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const activityType = req.query.type;
        const result = await activityLog_1.ActivityLogService.getUserLogs(req.user.id, limit, offset, activityType);
        res.json({
            success: true,
            logs: result.logs,
            total: result.total,
            limit,
            offset
        });
    }
    catch (error) {
        console.error('Get activity logs error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Aktivite logları alınamadı'
        });
    }
});
// Aktivite tiplerini getir
router.get('/types', auth_1.authenticateToken, async (req, res) => {
    try {
        const types = await activityLog_1.ActivityLogService.getActivityTypes(req.user.id);
        res.json({
            success: true,
            types
        });
    }
    catch (error) {
        console.error('Get activity types error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Aktivite tipleri alınamadı'
        });
    }
});
exports.default = router;
//# sourceMappingURL=activityLogs.js.map