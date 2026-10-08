import express from 'express';
import { PortfolioService } from '../services/portfolio';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, limitSchema } from '../utils/validation';

const router = express.Router();

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
