"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const news_1 = require("../services/news");
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const news = await news_1.NewsService.getNews(limit);
        res.json({
            success: true,
            data: news,
            count: news.length,
        });
    }
    catch (error) {
        console.error('News route error:', error);
        res.status(500).json({
            success: false,
            message: 'Haberler alınamadı',
            error: error instanceof Error ? error.message : 'Bilinmeyen hata',
        });
    }
});
exports.default = router;
//# sourceMappingURL=news.js.map