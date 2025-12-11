import express from 'express';
import { StopLossService } from '../services/stopLoss';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Stop-loss emri oluştur
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { portfolio_item_id, trigger_price, quantity } = req.body;

    if (!portfolio_item_id || !trigger_price) {
      return res.status(400).json({
        success: false,
        message: 'Portföy öğesi ID ve tetikleme fiyatı gerekli'
      });
    }

    if (trigger_price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Tetikleme fiyatı 0\'dan büyük olmalı'
      });
    }

    const result = await StopLossService.createStopLoss(req.user.id, {
      portfolio_item_id,
      trigger_price,
      quantity
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Stop-loss create error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Sunucu hatası'
    });
  }
});

// Kullanıcının stop-loss emirlerini getir
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const result = await StopLossService.getStopLossOrders(req.user.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: 'Stop-loss emirleri alınamadı'
      });
    }
  } catch (error: any) {
    console.error('Get stop-loss orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Stop-loss emrini iptal et
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    const result = await StopLossService.cancelStopLoss(req.user.id, id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Cancel stop-loss error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

export default router;

