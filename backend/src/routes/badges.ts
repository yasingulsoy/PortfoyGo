import express from 'express';
import { BadgeService } from '../services/badges';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';

const router = express.Router();

// Kullanıcının rozetleri
router.get(
  '/my-badges',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const result = await BadgeService.getUserBadges(requireUser(req).id);
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Rozetler alınamadı' });
    }
    res.json(result);
  })
);

// Tüm rozetler
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await BadgeService.getAllBadges();
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Rozetler alınamadı' });
    }
    res.json(result);
  })
);

export default router;
