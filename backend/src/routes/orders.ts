import express from 'express';
import { z } from 'zod';
import { ORDER_TYPES, OrderService, TRAIL_PERCENT_MAX, TRAIL_PERCENT_MIN, type OrderType } from '../services/orders';
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
const orderTypeField = z.enum(ORDER_TYPES as [OrderType, ...OrderType[]], { message: 'Geçersiz emir tipi' });

const trailPercentField = z
  .number({ message: 'Takip yüzdesi sayı olmalı' })
  .refine((n) => Number.isFinite(n), 'Takip yüzdesi geçerli bir sayı olmalı')
  .refine((n) => n >= TRAIL_PERCENT_MIN && n <= TRAIL_PERCENT_MAX, `Takip yüzdesi %${TRAIL_PERCENT_MIN} ile %${TRAIL_PERCENT_MAX} arasında olmalı`);
const trailAmountField = positiveNumber('Takip tutarı', MAX_PRICE);
const hasOne = (a: unknown, b: unknown) => (a !== undefined) !== (b !== undefined);

/**
 * type: limit | stop_loss | take_profit → trigger_price zorunlu
 *       trailing_stop (satış)           → trail_percent VEYA trail_amount
 *       market_on_open (yalnızca hisse; borsa kapalıyken) → yalnızca miktar
 */
export const createOrderSchema = z
  .object({
    asset_type: assetTypeField,
    symbol: symbolField,
    side: z.enum(['buy', 'sell'] as const, { message: 'Geçersiz emir yönü' }),
    type: orderTypeField,
    quantity: positiveNumber('Miktar', MAX_QUANTITY).refine((n) => n >= MIN_QUANTITY, 'Miktar çok küçük'),
    trigger_price: positiveNumber('Tetikleme fiyatı', MAX_PRICE).optional(),
    trail_percent: trailPercentField.optional(),
    trail_amount: trailAmountField.optional(),
    expires_in_days: z
      .number({ message: 'Geçerlilik süresi sayı olmalı' })
      .int('Geçerlilik süresi tam sayı olmalı')
      .min(1, 'Geçerlilik süresi en az 1 gün olmalı')
      .max(90, 'Geçerlilik süresi en fazla 90 gün olabilir')
      .optional(),
  })
  .refine((d) => d.side === 'sell' || d.type === 'limit' || d.type === 'market_on_open', {
    message: 'Alış tarafında sadece limit veya açılışta emri verilebilir',
  })
  .refine((d) => !['limit', 'stop_loss', 'take_profit'].includes(d.type) || d.trigger_price !== undefined, {
    message: 'Tetikleme fiyatı gerekli',
  })
  .refine((d) => d.type !== 'trailing_stop' || hasOne(d.trail_percent, d.trail_amount), {
    message: 'Takip mesafesini yüzde VEYA TL olarak girin',
  })
  .refine((d) => d.type !== 'market_on_open' || d.asset_type === 'stock', {
    message: 'Açılışta emri yalnızca ABD hisseleri için verilebilir',
  });

/** PATCH /:id — yalnızca takip eden stop: mesafe (yüzde VEYA TL) */
export const updateOrderSchema = z
  .object({
    trail_percent: trailPercentField.optional(),
    trail_amount: trailAmountField.optional(),
  })
  .refine((d) => hasOne(d.trail_percent, d.trail_amount), { message: 'Takip mesafesini yüzde VEYA TL olarak girin' });

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
 * body: { asset_type, symbol, side: 'buy'|'sell', type, quantity, trigger_price?, trail_percent?, trail_amount?, expires_in_days? }
 *   type: 'limit'|'stop_loss'|'take_profit' (trigger_price) · 'trailing_stop' (satış; trail_percent | trail_amount)
 *         · 'market_on_open' (hisse; ABD borsası kapalıyken — açıksa 409 MARKET_OPEN)
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

/** Takip eden stopun mesafesini değiştir (zirve korunur). body: { trail_percent } | { trail_amount } */
router.patch(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const body = parseOrThrow(updateOrderSchema, req.body);
    res.json(await OrderService.updateTrailingOrder(requireUser(req).id, id, body));
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
