import express from 'express';
import { TransactionService } from '../services/transaction';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Alış işlemi
router.post('/buy', authenticateToken, async (req: any, res) => {
  try {
    const { symbol, name, asset_type, quantity, price } = req.body;
    
    console.log('🛒 Alış isteği alındı:', {
      userId: req.user.id,
      symbol,
      name,
      asset_type,
      quantity,
      price
    });

    // Validasyon
    if (!symbol || !name || !asset_type || !quantity || !price) {
      console.log('❌ Validasyon hatası: Tüm alanlar gerekli');
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

    if (!['crypto', 'stock', 'commodity', 'currency'].includes(asset_type)) {
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
      console.log('✅ Alış işlemi başarılı:', result.transaction?.id);
      res.json(result);
    } else {
      console.log('❌ Alış işlemi başarısız:', result.message);
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('❌ Buy route error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Sunucu hatası'
    });
  }
});

// Satış işlemi
router.post('/sell', authenticateToken, async (req: any, res) => {
  try {
    const { symbol, quantity } = req.body;
    
    console.log('💰 Satış isteği alındı:', {
      userId: req.user.id,
      symbol,
      quantity
    });

    // Validasyon
    if (!symbol || !quantity) {
      console.log('❌ Validasyon hatası: Sembol ve miktar gerekli');
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
      console.log('✅ Satış işlemi başarılı:', result.transaction?.id);
      res.json(result);
    } else {
      console.log('❌ Satış işlemi başarısız:', result.message);
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('❌ Sell route error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Sunucu hatası'
    });
  }
});

export default router;

