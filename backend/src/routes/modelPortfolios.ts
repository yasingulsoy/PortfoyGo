import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../infra/rateLimitStore';
import { authenticateToken, requireUser } from '../middleware/auth';
import { BACKTEST_DAYS, HISTORY_RANGES, MAX_TARGET_ASSETS, SANDBOX_ASSET_TYPES, Sandbox, SandboxPrices } from '../services/sandbox';
import { COMPARE_MAX, ModelPortfolios } from '../services/sandbox/model';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Model Portföy — "100.000 USD Model Portföy" (/api/model-portfolios) ve sanal portföy varlık araması (/api/sandbox).
 * Yanıtlar { success, data }. Çerezle gelen PUT/PATCH/POST/DELETE isteklerinde `X-Requested-With: PortfoyGo` (CSRF).
 *
 *  GET    /api/model-portfolios                       → {items, limit, starting_cash, commission_bps}
 *  POST   /api/model-portfolios  {name, weights?, cash_weight?}  → 201 {portfolio, rebalance}  (409 MODEL_LIMIT)
 *  POST   /api/model-portfolios/preview {weights, cash_weight}   → RebalancePlan (yeni 100.000 USD portföy için)
 *  GET    /api/model-portfolios/templates/advisor     → AdvisorTemplate  (404 NO_ADVISOR_PLAN)
 *  GET    /api/model-portfolios/compare?ids=a,b,c     → {items: CompareItem[]}  (≤ 3)
 *  GET    /api/model-portfolios/:id                   → {portfolio, valuation}
 *  PATCH  /api/model-portfolios/:id {name}            → portfolio
 *  DELETE /api/model-portfolios/:id                   → {deleted: true}
 *  PUT    /api/model-portfolios/:id/weights {weights, cash_weight, dry_run?} → {result, valuation}
 *  POST   /api/model-portfolios/:id/trade {side, asset_type, symbol, amount_usd | quantity}  → {result, valuation}
 *  GET    /api/model-portfolios/:id/history?range=1W|1M|3M|ALL
 *  GET    /api/model-portfolios/:id/metrics
 *  GET    /api/model-portfolios/:id/backtest?days=90
 *  GET    /api/model-portfolios/:id/trades?limit=50&offset=0
 *  GET    /api/sandbox/assets?q=&type=                → AssetSearchItem[] (yalnızca taze fiyatlılar, USD)
 *
 * Hata kodları: 404 SANDBOX_NOT_FOUND, 409 SANDBOX_FROZEN / MODEL_LIMIT, 503 PRICE_UNAVAILABLE {symbols},
 * 400 VALIDATION_ERROR / WEIGHTS_INVALID / INVALID_ASSET / INSUFFICIENT_CASH / INSUFFICIENT_QUANTITY / NO_POSITION / TRADE_TOO_SMALL.
 */

const router = express.Router();
export const sandboxAssetsRouter = express.Router();

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const assetTypeField = z.enum(SANDBOX_ASSET_TYPES, { message: 'Varlık tipi stock, crypto, currency veya commodity olmalı' });
const symbolField = z
  .string({ message: 'Sembol gerekli' })
  .trim()
  .min(1, 'Sembol gerekli')
  .max(20, 'Sembol çok uzun')
  .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
  .transform((s) => s.toUpperCase());
const percent = (label: string) =>
  z
    .number({ message: `${label} sayı olmalı` })
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, `${label} 0 ile 100 arasında olmalı`);
const nameField = z.string({ message: 'Portföy adı gerekli' }).trim().min(1, 'Portföy adı gerekli').max(60, 'Portföy adı en fazla 60 karakter olabilir');

const weightsShape = {
  weights: z
    .array(z.object({ asset_type: assetTypeField, symbol: symbolField, weight: percent('Ağırlık') }), { message: 'Ağırlık listesi gerekli' })
    .max(MAX_TARGET_ASSETS, `En fazla ${MAX_TARGET_ASSETS} varlık seçilebilir`),
  cash_weight: percent('Nakit ağırlığı'),
};
const weightsSchema = z.object(weightsShape);
const setWeightsSchema = z.object({ ...weightsShape, dry_run: z.boolean().optional() });

const createSchema = z.object({
  name: nameField,
  weights: weightsShape.weights.optional(),
  cash_weight: percent('Nakit ağırlığı').optional(),
});

const renameSchema = z.object({ name: nameField });

const tradeSchema = z
  .object({
    side: z.enum(['buy', 'sell'], { message: 'İşlem yönü buy veya sell olmalı' }),
    asset_type: assetTypeField,
    symbol: symbolField,
    amount_usd: z
      .number({ message: 'Tutar sayı olmalı' })
      .refine((n) => Number.isFinite(n) && n > 0 && n <= 1e9, 'Geçerli bir tutar girin')
      .optional(),
    quantity: z
      .union([z.literal('all'), z.number({ message: 'Miktar sayı olmalı' }).refine((n) => Number.isFinite(n) && n > 0 && n <= 1e12, 'Geçerli bir miktar girin')])
      .optional(),
  })
  .refine((v) => (v.amount_usd === undefined) !== (v.quantity === undefined), { message: 'Tutar (USD) veya miktardan yalnızca birini girin' });

const idParams = z.object({ id: z.string({ message: 'Portföy gerekli' }).trim().regex(UUID_RE, 'Geçersiz portföy') });

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

const historyQuery = z.object({
  range: z
    .string()
    .optional()
    .transform((r, ctx) => {
      const v = (r || '1M').toUpperCase();
      if (!(HISTORY_RANGES as readonly string[]).includes(v)) {
        ctx.addIssue({ code: 'custom', message: 'Geçersiz aralık (1W, 1M, 3M, ALL)' });
        return z.NEVER;
      }
      return v as (typeof HISTORY_RANGES)[number];
    }),
});
const tradesQuery = z.object({ limit: clampedInt(50, 1, 200), offset: clampedInt(0, 0, 1_000_000) });
const backtestQuery = z.object({ days: clampedInt(BACKTEST_DAYS, 7, 365) });
const compareQuery = z.object({
  ids: z
    .string({ message: 'Portföy listesi gerekli' })
    .trim()
    .transform((s, ctx) => {
      const ids = [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];
      if (ids.length < 1 || ids.length > COMPARE_MAX || ids.some((x) => !UUID_RE.test(x))) {
        ctx.addIssue({ code: 'custom', message: `Karşılaştırma için 1–${COMPARE_MAX} geçerli portföy seçin` });
        return z.NEVER;
      }
      return ids;
    }),
});
const assetsQuery = z.object({
  q: z
    .string()
    .trim()
    .max(40, 'Arama en fazla 40 karakter olabilir')
    .optional()
    .transform((v) => (v ? v : undefined)),
  type: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx): (typeof SANDBOX_ASSET_TYPES)[number] | undefined => {
      if (!v) return undefined;
      if ((SANDBOX_ASSET_TYPES as readonly string[]).includes(v)) return v as (typeof SANDBOX_ASSET_TYPES)[number];
      ctx.addIssue({ code: 'custom', message: 'Varlık tipi stock, crypto, currency veya commodity olmalı' });
      return z.NEVER;
    }),
});

const writeLimiter = createRateLimiter('model-portfolios-write', {
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => `mp:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok hızlı işlem yapıyorsun. Biraz yavaşla ve tekrar dene.', code: 'RATE_LIMITED' },
});

const noStore = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'no-store');
  next();
};

router.use(authenticateToken, noStore);
sandboxAssetsRouter.use(authenticateToken, noStore);

// ---------------------------------------------------------------------------
// Liste / oluşturma / şablonlar / karşılaştırma
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await ModelPortfolios.list(requireUser(req).id) });
  })
);

router.post(
  '/',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createSchema, req.body);
    const weights = body.weights || body.cash_weight !== undefined ? { weights: body.weights ?? [], cash_weight: body.cash_weight ?? 0 } : null;
    const data = await ModelPortfolios.create(requireUser(req).id, { name: body.name, weights });
    res.status(201).json({ success: true, data });
  })
);

router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(weightsSchema, req.body);
    res.json({ success: true, data: await ModelPortfolios.previewNew(body) });
  })
);

router.get(
  '/templates/advisor',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await ModelPortfolios.advisorTemplate(requireUser(req).id) });
  })
);

router.get(
  '/compare',
  asyncHandler(async (req, res) => {
    const { ids } = parseOrThrow(compareQuery, req.query);
    res.json({ success: true, data: await ModelPortfolios.compare(requireUser(req).id, ids) });
  })
);

// ---------------------------------------------------------------------------
// Tek portföy
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    res.json({ success: true, data: await ModelPortfolios.detail(requireUser(req).id, id) });
  })
);

router.patch(
  '/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const { name } = parseOrThrow(renameSchema, req.body);
    res.json({ success: true, data: await ModelPortfolios.rename(requireUser(req).id, id, name) });
  })
);

router.delete(
  '/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    await ModelPortfolios.remove(requireUser(req).id, id);
    res.json({ success: true, data: { deleted: true } });
  })
);

router.put(
  '/:id/weights',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const body = parseOrThrow(setWeightsSchema, req.body);
    const userId = requireUser(req).id;
    const result = await ModelPortfolios.setWeights(userId, id, { weights: body.weights, cash_weight: body.cash_weight }, !!body.dry_run);
    res.json({ success: true, data: { result, valuation: result.executed ? await Sandbox.valuation(id) : null } });
  })
);

router.post(
  '/:id/trade',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const body = parseOrThrow(tradeSchema, req.body);
    const userId = requireUser(req).id;
    const result = await ModelPortfolios.trade(userId, id, body);
    res.json({ success: true, data: { result, valuation: await Sandbox.valuation(id) } });
  })
);

router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const { range } = parseOrThrow(historyQuery, req.query);
    await ModelPortfolios.owned(requireUser(req).id, id);
    res.json({ success: true, data: await Sandbox.history(id, range) });
  })
);

router.get(
  '/:id/metrics',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    await ModelPortfolios.owned(requireUser(req).id, id);
    res.json({ success: true, data: await Sandbox.metrics(id) });
  })
);

router.get(
  '/:id/backtest',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const { days } = parseOrThrow(backtestQuery, req.query);
    await ModelPortfolios.owned(requireUser(req).id, id);
    res.json({ success: true, data: await Sandbox.backtest(id, days) });
  })
);

router.get(
  '/:id/trades',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const { limit, offset } = parseOrThrow(tradesQuery, req.query);
    await ModelPortfolios.owned(requireUser(req).id, id);
    res.json({ success: true, data: await Sandbox.trades(id, { limit, offset }) });
  })
);

// ---------------------------------------------------------------------------
// Varlık arama (Model Portföy + Portföy Ligi ortak)
// ---------------------------------------------------------------------------

sandboxAssetsRouter.get(
  '/assets',
  asyncHandler(async (req, res) => {
    const { q, type } = parseOrThrow(assetsQuery, req.query);
    res.json({ success: true, data: await SandboxPrices.searchAssets(q, type) });
  })
);

export default router;
