import express from 'express';
import { z } from 'zod';
import { marketDataLimiter } from '../middleware/rateLimits';
import { asyncHandler } from '../utils/errors';
import { ASSET_TYPES, parseOrThrow } from '../utils/validation';
import {
  PRICE_RANGES,
  PriceHistoryService,
  SPARKLINE_MAX_ITEMS,
  sparklineKey,
  type SparklineItem,
} from '../services/priceHistory';

/**
 * Herkese açık fiyat geçmişi uçları (/api/market altında). Yanıtlar 60 sn önbelleklenebilir.
 *
 *   GET /history?type=&symbol=&range=      → { success, data: PriceHistoryData }
 *   GET /performance?type=&symbol=         → { success, data: { '1W', '1M', '3M', '6M', 'YTD', '1Y' } }
 *   GET /sparklines?items=stock:AAPL,crypto:BTC → { success, data: { 'stock:AAPL': number[], ... } }
 */
const router = express.Router();

const SYMBOL_RE = /^[A-Z0-9._-]{1,20}$/;

const assetTypeField = z.enum(ASSET_TYPES, { message: 'Geçersiz varlık tipi' });

const symbolField = z
  .string({ message: 'Sembol gerekli' })
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => SYMBOL_RE.test(s), 'Geçersiz sembol');

const rangeField = z
  .string({ message: 'Geçersiz aralık' })
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(PRICE_RANGES, { message: 'Geçersiz aralık' }))
  .optional()
  .transform((r) => r ?? '1M');

const historyQuerySchema = z.object({ type: assetTypeField, symbol: symbolField, range: rangeField });
const performanceQuerySchema = z.object({ type: assetTypeField, symbol: symbolField });

const sparklinesQuerySchema = z.object({
  items: z
    .string({ message: 'items gerekli' })
    .max(SPARKLINE_MAX_ITEMS * 40, 'Çok fazla varlık')
    .transform((raw, ctx): SparklineItem[] => {
      const seen = new Map<string, SparklineItem>();
      for (const part of raw.split(',')) {
        const token = part.trim();
        if (!token) continue;
        const idx = token.indexOf(':');
        const type = idx > 0 ? token.slice(0, idx).trim().toLowerCase() : '';
        const symbol = idx > 0 ? token.slice(idx + 1).trim().toUpperCase() : '';
        if (!(ASSET_TYPES as readonly string[]).includes(type) || !SYMBOL_RE.test(symbol)) {
          ctx.addIssue({ code: 'custom', message: `Geçersiz varlık: ${token.slice(0, 32)}` });
          return z.NEVER;
        }
        seen.set(sparklineKey(type, symbol), { type: type as SparklineItem['type'], symbol });
      }
      if (seen.size === 0) {
        ctx.addIssue({ code: 'custom', message: 'En az bir varlık gerekli (ör. stock:AAPL)' });
        return z.NEVER;
      }
      if (seen.size > SPARKLINE_MAX_ITEMS) {
        ctx.addIssue({ code: 'custom', message: `En fazla ${SPARKLINE_MAX_ITEMS} varlık istenebilir` });
        return z.NEVER;
      }
      return [...seen.values()];
    }),
});

const cachePublic = (res: express.Response) => res.set('Cache-Control', 'public, max-age=60');

router.get(
  '/history',
  marketDataLimiter,
  asyncHandler(async (req, res) => {
    const { type, symbol, range } = parseOrThrow(historyQuerySchema, req.query);
    const data = await PriceHistoryService.getHistory(type, symbol, range);
    cachePublic(res).json({ success: true, data });
  })
);

router.get(
  '/performance',
  marketDataLimiter,
  asyncHandler(async (req, res) => {
    const { type, symbol } = parseOrThrow(performanceQuerySchema, req.query);
    const data = await PriceHistoryService.getPerformance(type, symbol);
    cachePublic(res).json({ success: true, data });
  })
);

router.get(
  '/sparklines',
  marketDataLimiter,
  asyncHandler(async (req, res) => {
    const { items } = parseOrThrow(sparklinesQuerySchema, req.query);
    const data = await PriceHistoryService.getSparklines(items);
    cachePublic(res).json({ success: true, data });
  })
);

export default router;
