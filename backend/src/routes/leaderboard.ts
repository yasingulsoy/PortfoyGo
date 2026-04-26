import express from 'express';
import { LeaderboardService } from '../services/leaderboard';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Liderlik tablosunu getir
// ?board=alltime | week — alltime: başlangıç 100.000 TL’e göre kümülatif; week: bu ISO haftası getirisi
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const board =
      (req.query.board as string) === 'week' ? 'week' : 'alltime';
    const result = await LeaderboardService.getLeaderboard(limit, board);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: 'Liderlik tablosu alınamadı'
      });
    }
  } catch (error) {
    console.error('Leaderboard route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Kullanıcının rank'ini getir
router.get('/my-rank', authenticateToken, async (req: any, res) => {
  try {
    const result = await LeaderboardService.getUserRank(req.user.id);
    // { rank: kümülatif, rankWeek: bu hafta (doğrulanmış kullanıcılar) }
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({
        success: false,
        message: 'Rank bulunamadı'
      });
    }
  } catch (error) {
    console.error('My rank route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

export default router;

