import express from 'express';
import { providers } from '../providers';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, limitSchema } from '../utils/validation';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit } = parseOrThrow(limitSchema(10, 50), req.query);
    try {
      const news = await providers.news.getNews(limit);
      res.json({ success: true, data: news, count: news.length });
    } catch (error: any) {
      console.error('[news] RSS alınamadı:', error?.message);
      res.status(502).json({ success: false, message: 'Haberler alınamadı' });
    }
  })
);

export default router;
