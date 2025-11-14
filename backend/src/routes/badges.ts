import express from 'express';
import { BadgeService } from '../services/badges';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Kullanıcının rozetlerini getir
router.get('/my-badges', authenticateToken, async (req: any, res) => {
  try {
    const result = await BadgeService.getUserBadges(req.user.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: 'Rozetler alınamadı'
      });
    }
  } catch (error) {
    console.error('My badges route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Tüm rozetleri getir
router.get('/', async (req, res) => {
  try {
    const result = await BadgeService.getAllBadges();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: 'Rozetler alınamadı'
      });
    }
  } catch (error) {
    console.error('All badges route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

export default router;

