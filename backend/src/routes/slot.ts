import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { createRateLimiter } from '../infra/rateLimitStore';
import { AuditService } from '../services/audit';
import { GameError } from '../services/game/common';
import { SLOT } from '../services/game/config';
import { Slot } from '../services/game/slot';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';
import { gameErrorHandler } from './game';

/**
 * Slot Makinesi — "Olasılık dersi" (/api/game/slot). Yanıtlar { success, data }; hatalar { success:false, message, code, ...extra }.
 * Çerezle gelen POST isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 *
 *  GET  /api/game/slot        → { enabled, bets, paytable[{combo, multiplier, ways, total_ways, probability_pct}], rtp_pct,
 *                                 house_edge_pct, limits, today, lifetime{realized_rtp_pct}, session, history, … }
 *  POST /api/game/slot/spin   { bet: 5|10|25, request_id: uuid, reality_check_ack?: boolean }
 *                             → { reels:[s,s,s], combo, win, net, balance, stats, limits, reality_check, replayed }
 *
 * Hatalar: 410 SLOT_DISABLED (yönetici kapattı) · 400 INVALID_BET / INSUFFICIENT_COINS · 403 ADULT_CONFIRM_REQUIRED / ARENA_BREAK ·
 *          429 SLOT_COOLDOWN {retry_after_ms} / SLOT_DAILY_SPIN_LIMIT / SLOT_DAILY_LOSS_LIMIT {resets_at} ·
 *          409 SLOT_REALITY_CHECK {session} (her 25 çevirmede özet onayı) / SLOT_REQUEST_CONFLICT.
 *
 * Yönetici (/api/admin/game, authenticateToken + isAdmin):
 *  GET  /slot                 → { enabled, source, updated_at, updated_by_username, config, total, today, last_7d }
 *  PUT  /slot { enabled }     → aç/kapat (denetim: settings.slot_toggle)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const spinSchema = z.object({
  bet: z
    .number({ message: 'Bahis sayı olmalı' })
    .int('Bahis tam sayı olmalı')
    .refine((n) => SLOT.bets.includes(n), { message: `Bahis ${SLOT.bets.join(', ')} jetondan biri olmalı` }),
  request_id: z.string({ message: 'İstek kimliği gerekli' }).trim().regex(UUID_RE, 'Geçersiz istek kimliği'),
  reality_check_ack: z.boolean().optional(),
});

const toggleSchema = z.object({
  enabled: z.boolean({ message: '"enabled" true veya false olmalı' }),
});

/** Çevirme: kullanıcı başına dakikada 60 (sunucu ayrıca 1,5 sn bekleme süresini zorlar) */
const slotSpinLimiter = createRateLimiter('game-slot', {
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => `slot:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok hızlı işlem yapıyorsun. Biraz yavaşla ve tekrar dene.', code: 'RATE_LIMITED' },
});

/** 429'larda Retry-After (bekleme süresi / gece yarısı), sonra ortak oyun hata biçimi. */
export function slotErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof GameError && err.status === 429 && !res.headersSent) {
    const ms =
      typeof err.extra.retry_after_ms === 'number'
        ? err.extra.retry_after_ms
        : typeof err.extra.resets_at === 'string'
          ? Date.parse(err.extra.resets_at) - Date.now()
          : NaN;
    if (Number.isFinite(ms)) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(ms / 1000))));
  }
  gameErrorHandler(err, req, res, next);
}

/**
 * Önbelleğe alınmasın: 410 varsayılan olarak "önbelleklenebilir" bir durumdur; tarayıcı yönetici slotu yeniden açtıktan
 * sonra da eski 410'u gösterebilir. Yanıtlar ayrıca kişiye özeldir (bakiye, istatistik).
 */
const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

const router = express.Router();
router.use(noStore);

router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await Slot.info(requireUser(req).id) });
  })
);

router.post(
  '/spin',
  authenticateToken,
  slotSpinLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(spinSchema, req.body);
    res.json({ success: true, data: await Slot.spin(requireUser(req).id, body) });
  })
);

router.use(slotErrorHandler);

export default router;

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export const adminGameRouter = express.Router();
adminGameRouter.use(noStore, authenticateToken, isAdmin);

adminGameRouter.get(
  '/slot',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await Slot.adminSummary() });
  })
);

adminGameRouter.put(
  '/slot',
  asyncHandler(async (req, res) => {
    const { enabled } = parseOrThrow(toggleSchema, req.body);
    const out = await Slot.setEnabled(enabled, requireUser(req).id);
    await AuditService.log(req, {
      action: 'settings.slot_toggle',
      targetType: 'setting',
      targetId: SLOT.settingKey,
      targetLabel: `Slot Makinesi: ${enabled ? 'açık' : 'kapalı'}`,
      metadata: { enabled, previous: out.previous },
    });
    res.json({ success: true, data: await Slot.adminSummary() });
  })
);
