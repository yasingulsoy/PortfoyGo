import express from 'express';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { limitSchema, parseOrThrow, seasonLeaderboardQuerySchema, seasonSlugParamSchema } from '../utils/validation';
import { SeasonService } from '../services/seasons';

const router = express.Router();

// Güncel sezon (herkese açık; oturum varsa `me` dolu)
router.get(
  '/current',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const data = await SeasonService.getCurrent(optionalUserId(req));
    res.json({ success: true, data });
  })
);

// Kullanıcının sezon ödülleri
router.get(
  '/me/awards',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const data = await SeasonService.getAwards(requireUser(req).id);
    res.json({ success: true, data });
  })
);

// Sezon listesi (yeniden eskiye) + biten sezonların ilk 3'ü
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit } = parseOrThrow(limitSchema(12, 36), req.query);
    const data = await SeasonService.listSeasons(limit);
    res.json({ success: true, data });
  })
);

// Sezon sıralaması: ?limit=50&offset=0
router.get(
  '/:slug/leaderboard',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { slug } = parseOrThrow(seasonSlugParamSchema, req.params);
    const { limit, offset } = parseOrThrow(seasonLeaderboardQuerySchema, req.query);
    const data = await SeasonService.getLeaderboard(slug, limit, offset, optionalUserId(req));
    res.json({ success: true, data });
  })
);

export default router;
