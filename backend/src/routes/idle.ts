import express, { Request } from 'express';
import { createRateLimiter } from '../infra/rateLimitStore';
import { z } from 'zod';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { BUILDING_IDS, TAP } from '../services/idle/config';
import { UPGRADE_IDS } from '../services/idle/math';
import { IdleService } from '../services/idle/service';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Yatırım İmparatorluğu (/api/idle) — idle / tycoon oyunu. Yanıtlar { success, data }.
 * Çerezle gelen POST isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 * Tüm tutarlar JS number (double). Gelir sunucuda hesaplanır; istemci server_now + income_per_sec ile
 * sayacı canlandırır ve periyodik olarak GET /state ile eşitler.
 *
 *  GET  /state                                        → IdleState (çevrimdışı kazancı toplar)
 *  POST /buy      {building_id, quantity: 1|10|'max'} → IdleState
 *  POST /upgrade  {upgrade_id}                        → IdleState
 *  POST /tap      {count: 1..20}                      → {cash, gained, accepted, tap_value, ...}
 *  POST /prestige                                     → IdleState (Halka Arz)
 *  GET  /leaderboard ?limit=20                        (herkese açık; oturum varsa me) → {items, me}
 */

const router = express.Router();

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const buySchema = z.object({
  building_id: z.enum(BUILDING_IDS, { message: 'Geçersiz bina' }),
  quantity: z
    .union([z.literal(1), z.literal(10), z.literal('max')], { message: "Adet 1, 10 veya 'max' olmalı" })
    .optional()
    .transform((q) => q ?? 1),
});

const upgradeSchema = z.object({
  upgrade_id: z.enum(UPGRADE_IDS as [string, ...string[]], { message: 'Geçersiz yükseltme' }),
});

const tapSchema = z.object({
  count: z
    .number({ message: 'Dokunuş sayısı gerekli' })
    .int('Dokunuş sayısı tam sayı olmalı')
    .min(1, `Dokunuş sayısı 1–${TAP.maxPerRequest} arasında olmalı`)
    .max(TAP.maxPerRequest, `Dokunuş sayısı 1–${TAP.maxPerRequest} arasında olmalı`)
    .optional()
    .transform((n) => n ?? 1),
});

const leaderboardQuery = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(100, Math.max(1, Math.trunc(n))) : 20;
    }),
});

// ---------------------------------------------------------------------------
// Sınırlar (kullanıcı başına)
// ---------------------------------------------------------------------------

const userKey = (prefix: string) => (req: Request) => `${prefix}:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`;
const limitMessage = { success: false, message: 'Çok fazla istek gönderdin. Lütfen biraz yavaşla.', code: 'RATE_LIMITED' };

/** Dokunuş istekleri: saniyede 10 istek (dokunuş adedi ayrıca servis içinde sınırlanır: 10/sn, 1500/dk) */
const tapRequestLimiter = createRateLimiter('idle-tap', {
  windowMs: 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey('idle-tap'),
  message: limitMessage,
});

/** Satın alma / yükseltme / halka arz: dakikada 240 */
const writeLimiter = createRateLimiter('idle-write', {
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey('idle-write'),
  message: limitMessage,
});

// ---------------------------------------------------------------------------
// Uçlar
// ---------------------------------------------------------------------------

router.get(
  '/state',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await IdleService.getState(requireUser(req).id) });
  })
);

router.post(
  '/buy',
  authenticateToken,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { building_id, quantity } = parseOrThrow(buySchema, req.body);
    res.json({ success: true, data: await IdleService.buy(requireUser(req).id, building_id, quantity) });
  })
);

router.post(
  '/upgrade',
  authenticateToken,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { upgrade_id } = parseOrThrow(upgradeSchema, req.body);
    res.json({ success: true, data: await IdleService.upgrade(requireUser(req).id, upgrade_id) });
  })
);

router.post(
  '/tap',
  authenticateToken,
  tapRequestLimiter,
  asyncHandler(async (req, res) => {
    const { count } = parseOrThrow(tapSchema, req.body);
    res.json({ success: true, data: await IdleService.tap(requireUser(req).id, count) });
  })
);

router.post(
  '/prestige',
  authenticateToken,
  writeLimiter,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await IdleService.prestige(requireUser(req).id) });
  })
);

router.get(
  '/leaderboard',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { limit } = parseOrThrow(leaderboardQuery, req.query);
    res.json({ success: true, data: await IdleService.leaderboard(limit, optionalUserId(req)) });
  })
);

export default router;
