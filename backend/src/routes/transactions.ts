import express from 'express';
import { TransactionService } from '../services/transaction';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, buySchema, sellSchema } from '../utils/validation';

const router = express.Router();

/**
 * Alış — body: { symbol, asset_type, quantity }
 * (price / name geriye dönük uyumluluk için kabul edilir ama YOK SAYILIR; fiyatı sunucu belirler)
 * Yanıt: { success, message, transaction, portfolioItem, executedPrice }
 */
router.post(
  '/buy',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { symbol, asset_type, quantity } = parseOrThrow(buySchema, req.body);
    const { postCommit: _ignored, ...result } = await TransactionService.buy(requireUser(req).id, {
      symbol,
      asset_type,
      quantity,
    });
    res.json(result);
  })
);

/**
 * Satış — body: { symbol, asset_type, quantity }
 * (asset_type eski istemciler için opsiyonel: sembolle eşleşen tek varlık varsa o kullanılır)
 */
router.post(
  '/sell',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { symbol, asset_type, quantity } = parseOrThrow(sellSchema, req.body);
    const { postCommit: _ignored, ...result } = await TransactionService.sell(requireUser(req).id, {
      symbol,
      asset_type,
      quantity,
    });
    res.json(result);
  })
);

export default router;
