import express from 'express';
import { LeaderboardService } from '../services/leaderboard';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, leaderboardQuerySchema } from '../utils/validation';

const router = express.Router();

// Liderlik tablosu — ?board=alltime|week&limit=1..100
// (Sıralar sorgu anında hesaplanır; bu endpoint veritabanına yazmaz.)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, board } = parseOrThrow(leaderboardQuerySchema, req.query);
    res.json(await LeaderboardService.getLeaderboard(limit, board));
  })
);

// Kullanıcının sırası: { rank: kümülatif, rankWeek: bu hafta }
router.get(
  '/my-rank',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const result = await LeaderboardService.getUserRank(requireUser(req).id);
    if (!result.success) {
      return res.status(404).json({ success: false, message: 'Rank bulunamadı' });
    }
    res.json(result);
  })
);

export default router;
