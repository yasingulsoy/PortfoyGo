import express from 'express';
import { PricingService } from '../services/pricing';
import { asyncHandler } from '../utils/errors';

const router = express.Router();

/**
 * İşlemlerde kullanılan güncel USD/TRY kuru.
 * Yanıt: { success, data: { rate, updatedAt } } — kur yoksa 503.
 */
router.get(
  '/usd-try',
  asyncHandler(async (_req, res) => {
    const usd = await PricingService.getUsdTry();
    if (!usd) {
      return res.status(503).json({ success: false, message: 'Döviz kuru (USD/TRY) şu an mevcut değil' });
    }
    res.json({
      success: true,
      data: {
        rate: usd.rate,
        updatedAt: usd.updatedAt ? new Date(usd.updatedAt).toISOString() : null,
      },
    });
  })
);

export default router;
