import express from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { AuditService } from '../services/audit';
import { SubscriptionService, type AdminStatusFilter } from '../services/subscriptions/service';
import { MAX_GRANT_DAYS } from '../services/subscriptions/config';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, userIdParamSchema } from '../utils/validation';

/**
 * Yönetici: abonelikler — /api/admin/subscriptions (authenticateToken + isAdmin). Yanıtlar { success, data }.
 *
 *   GET  /                       ?status=current|trial|active|canceled|expired|all&search&limit&offset
 *                                → { items, total, limit, offset, summary }
 *   GET  /plans                  → planlar
 *   GET  /users/:userId          → { user, state, history }
 *   POST /users/:userId/grant    { days: 1..3650 | null (süresiz), note: 3..500, mode?: 'grant' | 'extend' }
 *   POST /users/:userId/revoke   { note: 3..500 }
 *
 * Denetim kaydı: subscription.grant (metadata.mode: grant | extend), subscription.revoke.
 */
const router = express.Router();
router.use(authenticateToken, isAdmin);

const STATUS_FILTERS = ['current', 'trial', 'active', 'canceled', 'expired', 'all'] as const;

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

const listSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => ((STATUS_FILTERS as readonly string[]).includes(v ?? '') ? (v as AdminStatusFilter) : 'all')),
  search: z
    .string()
    .trim()
    .max(100, 'Arama metni çok uzun')
    .optional()
    .transform((v) => (v ? v : undefined)),
  limit: clampedInt(25, 1, 100),
  offset: clampedInt(0, 0, 1_000_000),
});

const noteField = z
  .string({ message: 'Not gerekli' })
  .trim()
  .min(3, 'Not en az 3 karakter olmalı')
  .max(500, 'Not en fazla 500 karakter olabilir');

const grantSchema = z.object({
  days: z
    .union([z.number(), z.null()], { message: 'Süre sayı veya null (süresiz) olmalı' })
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= MAX_GRANT_DAYS), `Süre 1–${MAX_GRANT_DAYS} gün olmalı`),
  note: noteField,
  mode: z.enum(['grant', 'extend'], { message: 'mode "grant" veya "extend" olmalı' }).optional().default('grant'),
});

const revokeSchema = z.object({ note: noteField });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = parseOrThrow(listSchema, req.query);
    res.json({ success: true, data: await SubscriptionService.adminList(f) });
  })
);

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await SubscriptionService.plans() });
  })
);

router.get(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    res.json({ success: true, data: await SubscriptionService.adminUser(userId) });
  })
);

router.post(
  '/users/:userId/grant',
  asyncHandler(async (req, res) => {
    const admin = requireUser(req);
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const body = parseOrThrow(grantSchema, req.body);
    const result = await SubscriptionService.adminGrant(admin.id, userId, { days: body.days, note: body.note, mode: body.mode });
    await AuditService.log(req, {
      action: 'subscription.grant',
      targetType: 'user',
      targetId: userId,
      targetLabel: result.username,
      metadata: { mode: body.mode, days: body.days, ends_at: result.ends_at, previous: result.previous, note: body.note, subscription_id: result.subscription_id },
    });
    res.json({
      success: true,
      message: body.mode === 'extend' ? 'Premium süresi uzatıldı' : 'Premium tanımlandı',
      data: await SubscriptionService.adminUser(userId),
    });
  })
);

router.post(
  '/users/:userId/revoke',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const body = parseOrThrow(revokeSchema, req.body);
    const result = await SubscriptionService.adminRevoke(userId, body.note);
    await AuditService.log(req, {
      action: 'subscription.revoke',
      targetType: 'user',
      targetId: userId,
      targetLabel: result.username,
      metadata: { previous: result.previous, note: body.note, subscription_id: result.subscription_id },
    });
    res.json({ success: true, message: 'Premium erişim sonlandırıldı', data: await SubscriptionService.adminUser(userId) });
  })
);

export default router;
