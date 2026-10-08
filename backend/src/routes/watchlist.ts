import express from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { ASSET_TYPES, parseOrThrow } from '../utils/validation';
import { WatchlistService, WATCHLIST_LIMIT } from '../services/watchlist';

const router = express.Router();

const watchSymbol = z
  .string({ message: 'Sembol gerekli' })
  .trim()
  .min(1, 'Sembol gerekli')
  .max(20, 'Sembol çok uzun')
  .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
  .transform((s) => s.toUpperCase());

const watchAssetType = z.enum(ASSET_TYPES, { message: 'Geçersiz varlık tipi' });

const addSchema = z.object({ asset_type: watchAssetType, symbol: watchSymbol });
const paramsSchema = z.object({ assetType: watchAssetType, symbol: watchSymbol });

// İzleme listesi
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const items = await WatchlistService.list(requireUser(req).id);
    res.json({ success: true, data: items, limit: WATCHLIST_LIMIT });
  })
);

// Ekle (idempotent: zaten varsa 200, yeni eklendiyse 201)
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { asset_type, symbol } = parseOrThrow(addSchema, req.body);
    const { item, created } = await WatchlistService.add(requireUser(req).id, asset_type, symbol);
    res.status(created ? 201 : 200).json({ success: true, data: item });
  })
);

// Çıkar (idempotent: listede olmasa da 200)
router.delete(
  '/:assetType/:symbol',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { assetType, symbol } = parseOrThrow(paramsSchema, req.params);
    const removed = await WatchlistService.remove(requireUser(req).id, assetType, symbol);
    res.json({ success: true, data: { asset_type: assetType, symbol, removed } });
  })
);

export default router;
