import express from 'express';
import { AdminService } from '../services/admin';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Basit admin kontrolü (gerçek uygulamada daha güvenli olmalı)
const isAdmin = (req: any, res: express.Response, next: express.NextFunction) => {
  // Şimdilik tüm authenticated kullanıcılara izin ver
  // Gerçek uygulamada admin rolü kontrolü yapılmalı
  next();
};

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

export default router;

