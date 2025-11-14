import express from 'express';
import { TransactionService } from '../services/transaction';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Alış işlemi
router.post('/buy', authenticateToken, async (req: any, res) => {
  try {
    const { symbol, name, asset_type, quantity, price } = req.body;

    // Validasyon
    if (!symbol || !name || !asset_type || !quantity || !price) {
      return res.status(400).json({
        success: false,
        message: 'Tüm alanlar gerekli'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Miktar 0\'dan büyük olmalı'
      });
    }

    if (price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Fiyat 0\'dan büyük olmalı'
      });
    }

    if (!['crypto', 'stock'].includes(asset_type)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz varlık tipi'
      });
    }

    const result = await TransactionService.buy(req.user.id, {
      symbol,
      name,
      asset_type,
      quantity,
      price
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Buy route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Satış işlemi
router.post('/sell', authenticateToken, async (req: any, res) => {
  try {
    const { symbol, quantity } = req.body;

    // Validasyon
    if (!symbol || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Sembol ve miktar gerekli'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Miktar 0\'dan büyük olmalı'
      });
    }

    const result = await TransactionService.sell(req.user.id, {
      symbol,
      quantity
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Sell route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

export default router;

