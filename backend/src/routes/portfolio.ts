import express from 'express';
import { PortfolioService } from '../services/portfolio';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Portföy bilgilerini getir
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const result = await PortfolioService.getPortfolio(req.user.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({
        success: false,
        message: 'Portföy bulunamadı'
      });
    }
  } catch (error) {
    console.error('Portfolio route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// İşlem geçmişini getir
router.get('/transactions', authenticateToken, async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await PortfolioService.getTransactions(req.user.id, limit);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({
        success: false,
        message: 'İşlem geçmişi bulunamadı'
      });
    }
  } catch (error) {
    console.error('Transactions route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

export default router;

