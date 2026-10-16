import express, { NextFunction, Request, Response } from 'express';
import { createRateLimiter } from '../infra/rateLimitStore';
import { z } from 'zod';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { GameError } from '../services/game/common';
import { QUEST_KEYS, RESPONSIBLE } from '../services/game/config';
import { Ledger } from '../services/game/ledger';
import { GameListeners } from '../services/game/listeners';
import { Quests } from '../services/game/quests';
import { ResponsiblePlay } from '../services/game/responsible';
import { GameService } from '../services/game/service';
import { Shop } from '../services/game/shop';
import { Wheel } from '../services/game/wheel';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Oyun ekonomisi (/api/game). Yanıtlar { success, data }. Hatalar { success:false, message, code, ...extra }.
 * Çerezle gelen POST/PUT isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 *
 *  GET  /profile
 *  GET  /quests                       POST /quests/:key/claim
 *  GET  /wheel                        POST /wheel/spin
 *  GET  /shop                         POST /shop/:id/buy          POST /cosmetics/equip {avatar_id?, frame_id?, title_id?}
 *  GET  /leaderboard?type=rating|level&limit=50                   (herkese açık; oturum varsa me)
 *  GET  /ledger?limit&offset
 *  GET  /rewards/round/:id                                         (bu turdan kazanılan jeton/XP + reyting farkı)
 *  GET  /responsible                  PUT  /responsible {daily_round_limit?, session_reminder_minutes?}
 *  POST /responsible/confirm-adult {confirm:true}
 *  POST /responsible/break {duration:'24h'|'7d'}                   (mola kısaltılamaz)
 *  GET  /public-profile/:username                                  (herkese açık)
 *
 * Arena olay dinleyicileri (reyting, tur ödülleri, görev ilerlemesi) bu modül yüklenince kaydedilir.
 */

GameListeners.register();

const router = express.Router();

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

const questParams = z.object({
  key: z.enum(QUEST_KEYS, { message: 'Geçersiz görev' }),
});

const itemParams = z.object({
  id: z
    .string({ message: 'Ürün gerekli' })
    .trim()
    .min(1, 'Ürün gerekli')
    .max(32, 'Geçersiz ürün')
    .regex(/^[a-z0-9-]+$/, 'Geçersiz ürün'),
});

const itemIdField = z
  .string({ message: 'Geçersiz kozmetik seçimi' })
  .trim()
  .max(32, 'Geçersiz kozmetik seçimi')
  .regex(/^[a-z0-9-]+$/, 'Geçersiz kozmetik seçimi');

const equipSchema = z
  .object({
    avatar_id: itemIdField.optional(),
    frame_id: itemIdField.nullable().optional(),
    title_id: itemIdField.nullable().optional(),
  })
  .refine((v) => v.avatar_id !== undefined || v.frame_id !== undefined || v.title_id !== undefined, {
    message: 'Değiştirilecek bir alan gönderin',
  });

const leaderboardQuery = z.object({
  type: z
    .string()
    .optional()
    .transform((v, ctx): 'rating' | 'level' => {
      if (!v || v === 'rating') return 'rating';
      if (v === 'level') return 'level';
      ctx.addIssue({ code: 'custom', message: 'Tür "rating" veya "level" olmalı' });
      return z.NEVER;
    }),
  limit: clampedInt(50, 1, 100),
});

const ledgerQuery = z.object({ limit: clampedInt(20, 1, 100), offset: clampedInt(0, 0, 1_000_000) });

const responsibleSchema = z
  .object({
    daily_round_limit: z
      .number({ message: 'Günlük tur sınırı sayı olmalı' })
      .int('Günlük tur sınırı tam sayı olmalı')
      .min(RESPONSIBLE.dailyRoundLimit.min, `Günlük tur sınırı en az ${RESPONSIBLE.dailyRoundLimit.min} olmalı`)
      .max(RESPONSIBLE.dailyRoundLimit.max, `Günlük tur sınırı en fazla ${RESPONSIBLE.dailyRoundLimit.max} olabilir`)
      .nullable()
      .optional(),
    session_reminder_minutes: z
      .number({ message: 'Hatırlatıcı süresi sayı olmalı' })
      .refine((n) => (RESPONSIBLE.reminderMinutes as readonly number[]).includes(n), {
        message: `Hatırlatıcı ${RESPONSIBLE.reminderMinutes.join(', ')} dakikadan biri olmalı`,
      })
      .nullable()
      .optional(),
  })
  .refine((v) => v.daily_round_limit !== undefined || v.session_reminder_minutes !== undefined, {
    message: 'Güncellenecek bir alan gönderin',
  });

const confirmAdultSchema = z.object({
  confirm: z.literal(true, { message: '18 yaşından büyük olduğunu onaylaman gerekiyor' }),
});

const breakSchema = z.object({
  duration: z.enum(['24h', '7d'], { message: 'Mola süresi "24h" veya "7d" olmalı' }),
});

const usernameParams = z.object({
  username: z
    .string({ message: 'Kullanıcı adı gerekli' })
    .trim()
    .min(1, 'Kullanıcı adı gerekli')
    .max(50, 'Geçersiz kullanıcı adı')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Geçersiz kullanıcı adı'),
});

// ---------------------------------------------------------------------------
// Sınırlar
// ---------------------------------------------------------------------------

/** Oyun yazma işlemleri: kullanıcı başına dakikada 60 */
const gameWriteLimiter = createRateLimiter('game-write', {
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `game:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok hızlı işlem yapıyorsun. Biraz yavaşla ve tekrar dene.', code: 'RATE_LIMITED' },
});

const profileOf = (userId: string) => GameService.getProfile(userId);

// ---------------------------------------------------------------------------
// Herkese açık
// ---------------------------------------------------------------------------

router.get(
  '/leaderboard',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(leaderboardQuery, req.query);
    res.json({ success: true, data: await GameService.leaderboard(q.type, q.limit, optionalUserId(req)) });
  })
);

router.get(
  '/public-profile/:username',
  asyncHandler(async (req, res) => {
    const { username } = parseOrThrow(usernameParams, req.params);
    res.json({ success: true, data: await GameService.publicProfile(username) });
  })
);

// ---------------------------------------------------------------------------
// Profil / defter
// ---------------------------------------------------------------------------

router.get(
  '/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await profileOf(requireUser(req).id) });
  })
);

router.get(
  '/ledger',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(ledgerQuery, req.query);
    res.json({ success: true, data: await Ledger.list(requireUser(req).id, q.limit, q.offset) });
  })
);

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const roundParams = z.object({ id: z.string({ message: 'Tur gerekli' }).trim().regex(UUID_RE, 'Geçersiz tur') });

router.get(
  '/rewards/round/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(roundParams, req.params);
    res.json({ success: true, data: await Ledger.roundRewards(requireUser(req).id, id) });
  })
);

// ---------------------------------------------------------------------------
// Görevler
// ---------------------------------------------------------------------------

router.get(
  '/quests',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await Quests.list(requireUser(req).id) });
  })
);

router.post(
  '/quests/:key/claim',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    const { key } = parseOrThrow(questParams, req.params);
    const userId = requireUser(req).id;
    const { reward } = await Quests.claim(userId, key);
    res.json({ success: true, data: { reward, profile: await profileOf(userId) } });
  })
);

// ---------------------------------------------------------------------------
// Şans çarkı
// ---------------------------------------------------------------------------

router.get(
  '/wheel',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await Wheel.info(requireUser(req).id) });
  })
);

router.post(
  '/wheel/spin',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    const userId = requireUser(req).id;
    const out = await Wheel.spin(userId);
    res.json({
      success: true,
      data: { segment_index: out.segment_index, segment: out.segment, reward: out.reward, free: out.free, profile: await profileOf(userId) },
    });
  })
);

// ---------------------------------------------------------------------------
// Mağaza / kozmetikler
// ---------------------------------------------------------------------------

router.get(
  '/shop',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await Shop.list(requireUser(req).id) });
  })
);

router.post(
  '/shop/:id/buy',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(itemParams, req.params);
    const userId = requireUser(req).id;
    const { item } = await Shop.buy(userId, id);
    res.json({ success: true, data: { item, profile: await profileOf(userId) } });
  })
);

router.post(
  '/cosmetics/equip',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(equipSchema, req.body);
    const userId = requireUser(req).id;
    await Shop.equip(userId, body);
    res.json({ success: true, data: { profile: await profileOf(userId) } });
  })
);

// ---------------------------------------------------------------------------
// Sorumlu oyun
// ---------------------------------------------------------------------------

const responsibleOptions = {
  daily_round_limit: { min: RESPONSIBLE.dailyRoundLimit.min, max: RESPONSIBLE.dailyRoundLimit.max },
  session_reminder_minutes: RESPONSIBLE.reminderMinutes,
  break_durations: Object.keys(RESPONSIBLE.breakDurations),
  loss_streak_hint: RESPONSIBLE.lossStreakHint,
};

router.get(
  '/responsible',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { ...(await ResponsiblePlay.getSettings(requireUser(req).id)), options: responsibleOptions } });
  })
);

router.put(
  '/responsible',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(responsibleSchema, req.body);
    const settings = await ResponsiblePlay.update(requireUser(req).id, body);
    res.json({ success: true, data: { ...settings, options: responsibleOptions } });
  })
);

router.post(
  '/responsible/confirm-adult',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    parseOrThrow(confirmAdultSchema, req.body);
    const settings = await ResponsiblePlay.confirmAdult(requireUser(req).id);
    res.json({ success: true, data: { ...settings, options: responsibleOptions } });
  })
);

router.post(
  '/responsible/break',
  authenticateToken,
  gameWriteLimiter,
  asyncHandler(async (req, res) => {
    const { duration } = parseOrThrow(breakSchema, req.body);
    const settings = await ResponsiblePlay.startBreak(requireUser(req).id, duration);
    res.json({ success: true, data: { ...settings, options: responsibleOptions } });
  })
);

/** GameError'daki ek alanları (break_until, next_free_at …) yanıta ekler; diğerleri genel işleyiciye gider. */
export function gameErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof GameError && !res.headersSent) {
    if (err.status === 429 && typeof err.extra.next_free_at === 'string') {
      const secs = Math.max(1, Math.ceil((Date.parse(err.extra.next_free_at) - Date.now()) / 1000));
      res.setHeader('Retry-After', String(secs));
    }
    res.status(err.status).json({
      success: false,
      message: err.publicMessage,
      code: err.code,
      ...err.extra,
      ...(Object.keys(err.extra).length > 0 ? { data: err.extra } : {}),
    });
    return;
  }
  next(err);
}

router.use(gameErrorHandler);

export default router;
