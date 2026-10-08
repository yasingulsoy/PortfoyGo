import express from 'express';
import { StopLossService } from '../services/stopLoss';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, createStopLossSchema, idParamSchema } from '../utils/validation';

const router = express.Router();

// Stop-loss emri oluştur — body: { portfolio_item_id, trigger_price, quantity? }
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createStopLossSchema, req.body);
    const result = await StopLossService.createStopLoss(requireUser(req).id, body);
    res.json(result);
  })
);

// Kullanıcının stop-loss emirleri
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(await StopLossService.getStopLossOrders(requireUser(req).id));
  })
);

// Stop-loss emrini iptal et
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const result = await StopLossService.cancelStopLoss(requireUser(req).id, id);
    res.status(result.success ? 200 : 400).json(result);
  })
);

export default router;
