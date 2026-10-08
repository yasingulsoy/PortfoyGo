import express from 'express';
import { PortfolioService } from '../services/portfolio';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, limitSchema } from '../utils/validation';
import { z } from 'zod';
import { HistoryService, HISTORY_RANGES } from '../services/history';

const router = express.Router();

const historyQuerySchema = z.object({
  range: z.enum(HISTORY_RANGES, { message: 'Geçersiz aralık (1W, 1M, 3M, 1Y, ALL)' }).optional().default('1M'),
});

// Portföy performans geçmişi (?range=1W|1M|3M|1Y|ALL)
router.get(
  '/history',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { range } = parseOrThrow(historyQuerySchema, req.query);
    const data = await HistoryService.getHistory(requireUser(req).id, range);
    res.json({ success: true, data });
  })
);

// Portföy bilgilerini getir
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const result = await PortfolioService.getPortfolio(requireUser(req).id);
    if (!result.success) {
      return res.status(404).json({ success: false, message: 'Portföy bulunamadı' });
    }
    res.json(result);
  })
);

// İşlem geçmişini getir (?limit=1..100)
router.get(
  '/transactions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit } = parseOrThrow(limitSchema(50, 100), req.query);
    const result = await PortfolioService.getTransactions(requireUser(req).id, limit);
    res.json(result);
  })
);

export default router;
