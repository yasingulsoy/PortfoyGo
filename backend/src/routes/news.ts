import express from 'express';
import { NewsService } from '../services/news';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const news = await NewsService.getNews(limit);

    res.json({
      success: true,
      data: news,
      count: news.length,
    });
  } catch (error) {
    console.error('News route error:', error);
    res.status(500).json({
      success: false,
      message: 'Haberler alınamadı',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    });
  }
});

export default router;
