import express from 'express';
import { z } from 'zod';
import { OrderService } from '../services/orders';
import { authenticateToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { ASSET_TYPES, MAX_PRICE, MAX_QUANTITY, MIN_QUANTITY, idParamSchema, parseOrThrow } from '../utils/validation';

const router = express.Router();

const positiveNumber = (label: string, max: number) =>
  z
    .number({ message: `${label} sayı olmalı` })
    .refine((n) => Number.isFinite(n), `${label} geçerli bir sayı olmalı`)
    .refine((n) => n > 0, `${label} 0'dan büyük olmalı`)
    .refine((n) => n <= max, `${label} çok büyük`);

const symbolField = z
  .string({ message: 'Sembol gerekli' })
  .trim()
  .min(1, 'Sembol gerekli')
  .max(20, 'Sembol çok uzun')
  .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
  .transform((s) => s.toUpperCase());

const assetTypeField = z.enum(ASSET_TYPES, { message: 'Geçersiz varlık tipi' });
const orderTypeField = z.enum(['limit', 'stop_loss', 'take_profit'] as const, { message: 'Geçersiz emir tipi' });

export const createOrderSchema = z
  .object({
    asset_type: assetTypeField,
    symbol: symbolField,
    side: z.enum(['buy', 'sell'] as const, { message: 'Geçersiz emir yönü' }),
    type: orderTypeField,
    quantity: positiveNumber('Miktar', MAX_QUANTITY).refine((n) => n >= MIN_QUANTITY, 'Miktar çok küçük'),
    trigger_price: positiveNumber('Tetikleme fiyatı', MAX_PRICE),
    expires_in_days: z
      .number({ message: 'Geçerlilik süresi sayı olmalı' })
      .int('Geçerlilik süresi tam sayı olmalı')
      .min(1, 'Geçerlilik süresi en az 1 gün olmalı')
      .max(90, 'Geçerlilik süresi en fazla 90 gün olabilir')
      .optional(),
  })
  .refine((d) => d.side === 'sell' || d.type === 'limit', { message: 'Alış tarafında sadece limit emri verilebilir' });

export const listOrdersQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s): 'active' | 'history' | 'all' => (s === 'history' ? 'history' : s === 'all' ? 'all' : 'active')),
  symbol: symbolField.optional(),
  asset_type: assetTypeField.optional(),
  type: orderTypeField.optional(),
});

/**
 * Bekleyen emir oluştur.
 * body: { asset_type, symbol, side: 'buy'|'sell', type: 'limit'|'stop_loss'|'take_profit', quantity, trigger_price, expires_in_days? }
 * Yanıt: { success, message, order }
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createOrderSchema, req.body);
    res.status(201).json(await OrderService.createOrder(requireUser(req).id, body));
  })
);

/** Emirler — ?status=active (varsayılan) | history | all, isteğe bağlı ?symbol=&asset_type=&type= */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { status, ...filter } = parseOrThrow(listOrdersQuerySchema, req.query);
    res.json(await OrderService.listOrders(requireUser(req).id, status, filter));
  })
);

/** Emri iptal et (limit alışta ayrılan tutar bakiyeye iade edilir) */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json(await OrderService.cancelOrder(requireUser(req).id, id));
  })
);

export default router;
