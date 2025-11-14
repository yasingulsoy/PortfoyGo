import express from 'express';
import { AdminService } from '../services/admin';
import { authenticateToken } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';

const router = express.Router();

// Admin istatistikleri
router.get('/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await AdminService.getStats();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: 'İstatistikler alınamadı'
      });
    }
  } catch (error) {
    console.error('Admin stats route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Tüm kullanıcıları getir
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await AdminService.getAllUsers(limit, offset);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: 'Kullanıcılar alınamadı'
      });
    }
  } catch (error) {
    console.error('Admin users route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Kullanıcıyı banla/unban yap
router.post('/users/:userId/ban', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { ban } = req.body; // true = ban, false = unban

    if (typeof ban !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Ban değeri boolean olmalı'
      });
    }

    const result = await AdminService.toggleUserBan(userId, ban);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: result.message || 'İşlem başarısız'
      });
    }
  } catch (error) {
    console.error('Admin ban route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

export default router;

