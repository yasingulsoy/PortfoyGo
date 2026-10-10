import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { ArenaError, ArenaService, SOLO_DURATIONS } from '../services/arena/service';
import { openRoundStream } from '../services/arena/stream';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Arena (/api/arena) — hızlı al/sat oyun modu. Yanıtlar { success, data }.
 * Çerezle gelen POST/PATCH isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 *
 *  GET    /instruments                                   (herkese açık)
 *  POST   /rounds                    {duration_s, instruments?}         → 201 RoundState
 *  GET    /rounds/active                                                → RoundState | null
 *  GET    /rounds/:id                                                   → RoundState
 *  GET    /rounds/:id/stream         SSE
 *  POST   /rounds/:id/positions      {instrument, side, amount, stop_loss?, take_profit?} → {position, me}
 *  POST   /rounds/:id/positions/:pid/close                              → {position, me}
 *  PATCH  /rounds/:id/positions/:pid {stop_loss?, take_profit?}         → {position}
 *  POST   /rounds/:id/close-all                                         → {closed, me}
 *  GET    /me/history                ?limit&offset
 *  GET    /leaderboard               ?period=day|week                   (herkese açık; oturum varsa me)
 *  GET    /challenges                ?status=upcoming|live|finished     (herkese açık; oturum varsa joined)
 *  POST   /challenges/:id/join                                          → {round_id}
 *  GET    /challenges/:id/leaderboard                                   (herkese açık)
 *
 * Yönetici uçları: adminArenaRouter → /api/admin/arena/* (routes/admin.ts bağlar).
 */

const router = express.Router();

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuid = (label: string) => z.string({ message: `${label} gerekli` }).trim().regex(UUID_RE, `Geçersiz ${label}`);

const roundParams = z.object({ id: uuid('tur ID') });
const positionParams = z.object({ id: uuid('tur ID'), pid: uuid('pozisyon ID') });
const challengeParams = z.object({ id: uuid('meydan okuma ID') });

const codeField = z
  .string({ message: 'Enstrüman gerekli' })
  .trim()
  .min(1, 'Enstrüman gerekli')
  .max(12, 'Geçersiz enstrüman')
  .regex(/^[A-Za-z]+$/, 'Geçersiz enstrüman')
  .transform((s) => s.toUpperCase());

const createRoundSchema = z.object({
  duration_s: z
    .number({ message: 'Süre saniye cinsinden sayı olmalı' })
    .refine((n) => (SOLO_DURATIONS as readonly number[]).includes(n), `Süre ${SOLO_DURATIONS.join(', ')} saniyeden biri olmalı`),
  instruments: z.array(codeField, { message: 'Enstrümanlar liste olmalı' }).max(4, 'En fazla 4 enstrüman seçilebilir').optional(),
});

const priceField = (label: string) =>
  z
    .number({ message: `${label} sayı olmalı` })
    .refine((n) => Number.isFinite(n) && n > 0 && n < 1e12, `${label} geçerli bir pozitif sayı olmalı`);

const openSchema = z.object({
  instrument: codeField,
  side: z.enum(['long', 'short'], { message: 'Yön "long" veya "short" olmalı' }),
  amount: z
    .number({ message: 'Tutar sayı olmalı' })
    .refine((n) => Number.isFinite(n) && n > 0 && n <= 1e9, 'Tutar geçerli bir pozitif sayı olmalı'),
  stop_loss: priceField('Zarar durdur').nullish(),
  take_profit: priceField('Kâr al').nullish(),
});

const patchSchema = z
  .object({
    stop_loss: priceField('Zarar durdur').nullable().optional(),
    take_profit: priceField('Kâr al').nullable().optional(),
  })
  .refine((v) => v.stop_loss !== undefined || v.take_profit !== undefined, 'stop_loss veya take_profit gönderin');

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

const historyQuery = z.object({ limit: clampedInt(20, 1, 50), offset: clampedInt(0, 0, 100_000) });

const leaderboardQuery = z.object({
  period: z
    .string()
    .optional()
    .transform((v, ctx): 'day' | 'week' => {
      if (!v || v === 'day') return 'day';
      if (v === 'week') return 'week';
      ctx.addIssue({ code: 'custom', message: 'Dönem "day" veya "week" olmalı' });
      return z.NEVER;
    }),
});

const challengesQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((v, ctx): 'upcoming' | 'live' | 'finished' | undefined => {
      if (!v) return undefined;
      if (v === 'upcoming' || v === 'live' || v === 'finished') return v;
      ctx.addIssue({ code: 'custom', message: 'Durum "upcoming", "live" veya "finished" olmalı' });
      return z.NEVER;
    }),
});

// ---------------------------------------------------------------------------
// Sınırlar
// ---------------------------------------------------------------------------

/** Arena yazma işlemleri: kullanıcı başına dakikada 120 (tur oluşturma ayrıca saatlik sınırla korunur) */
const arenaWriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `arena:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok hızlı işlem yapıyorsun. Biraz yavaşla ve tekrar dene.', code: 'RATE_LIMITED' },
});

// ---------------------------------------------------------------------------
// Herkese açık
// ---------------------------------------------------------------------------

router.get(
  '/instruments',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await ArenaService.instruments() });
  })
);

router.get(
  '/leaderboard',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { period } = parseOrThrow(leaderboardQuery, req.query);
    res.json({ success: true, data: await ArenaService.leaderboard(period, optionalUserId(req)) });
  })
);

router.get(
  '/challenges',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { status } = parseOrThrow(challengesQuery, req.query);
    res.json({ success: true, data: await ArenaService.listChallenges(status, optionalUserId(req)) });
  })
);

router.get(
  '/challenges/:id/leaderboard',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(challengeParams, req.params);
    res.json({ success: true, data: await ArenaService.challengeLeaderboard(id, optionalUserId(req)) });
  })
);

// ---------------------------------------------------------------------------
// Oturum gerekli
// ---------------------------------------------------------------------------

router.post(
  '/challenges/:id/join',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(challengeParams, req.params);
    res.json({ success: true, data: await ArenaService.joinChallenge(id, requireUser(req).id) });
  })
);

router.get(
  '/me/history',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(historyQuery, req.query);
    res.json({ success: true, data: await ArenaService.myHistory(requireUser(req).id, limit, offset) });
  })
);

router.post(
  '/rounds',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createRoundSchema, req.body);
    const data = await ArenaService.createSoloRound(requireUser(req).id, input);
    res.status(201).json({ success: true, data });
  })
);

router.get(
  '/rounds/active',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await ArenaService.activeSoloRound(requireUser(req).id) });
  })
);

router.get('/rounds/:id/stream', authenticateToken, (req: Request, res: Response, next: NextFunction) => {
  let id: string;
  try {
    id = parseOrThrow(roundParams, req.params).id;
  } catch (err) {
    return next(err);
  }
  openRoundStream(req, res, id, requireUser(req).id).catch((err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });
});

router.get(
  '/rounds/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(roundParams, req.params);
    res.json({ success: true, data: await ArenaService.getRoundState(id, requireUser(req).id) });
  })
);

router.post(
  '/rounds/:id/positions',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(roundParams, req.params);
    const input = parseOrThrow(openSchema, req.body);
    res.json({ success: true, data: await ArenaService.openPosition(id, requireUser(req).id, input) });
  })
);

router.post(
  '/rounds/:id/positions/:pid/close',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id, pid } = parseOrThrow(positionParams, req.params);
    res.json({ success: true, data: await ArenaService.closePosition(id, requireUser(req).id, pid) });
  })
);

router.patch(
  '/rounds/:id/positions/:pid',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id, pid } = parseOrThrow(positionParams, req.params);
    const patch = parseOrThrow(patchSchema, req.body);
    res.json({ success: true, data: await ArenaService.updateStops(id, requireUser(req).id, pid, patch) });
  })
);

router.post(
  '/rounds/:id/close-all',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(roundParams, req.params);
    res.json({ success: true, data: await ArenaService.closeAll(id, requireUser(req).id) });
  })
);

/** ArenaError'daki ek alanları (round_id, retry_after) yanıta ekler; diğer hatalar genel işleyiciye gider. */
export function arenaErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ArenaError && Object.keys(err.extra).length > 0 && !res.headersSent) {
    if (typeof err.extra.retry_after === 'number') res.setHeader('Retry-After', String(err.extra.retry_after));
    res.status(err.status).json({ success: false, message: err.publicMessage, code: err.code, ...err.extra, data: err.extra });
    return;
  }
  next(err);
}

router.use(arenaErrorHandler);

// ---------------------------------------------------------------------------
// Yönetici: /api/admin/arena/* (authenticateToken + isAdmin admin router'ında)
// ---------------------------------------------------------------------------

export const adminArenaRouter = express.Router();

const optionalText = (label: string, max: number) =>
  z
    .string({ message: `${label} metin olmalı` })
    .trim()
    .max(max, `${label} en fazla ${max} karakter olabilir`)
    .nullish()
    .transform((v) => (v ? v : null));

const START_MIN_AHEAD_MS = 55_000; // "en erken 1 dk sonra" (5 sn saat toleransı)
const START_MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

const createChallengeSchema = z.object({
  title: z
    .string({ message: 'Başlık gerekli' })
    .trim()
    .min(3, 'Başlık en az 3 karakter olmalı')
    .max(80, 'Başlık en fazla 80 karakter olabilir'),
  description: optionalText('Açıklama', 300),
  sponsor: optionalText('Sponsor', 80),
  prize_text: optionalText('Ödül metni', 160),
  starts_at: z
    .string({ message: 'Başlangıç zamanı gerekli' })
    .trim()
    .transform((v, ctx) => {
      const d = new Date(v);
      if (!v || Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Başlangıç zamanı geçerli bir tarih olmalı' });
        return z.NEVER;
      }
      if (d.getTime() < Date.now() + START_MIN_AHEAD_MS) {
        ctx.addIssue({ code: 'custom', message: 'Başlangıç en erken 1 dakika sonrası olabilir' });
        return z.NEVER;
      }
      if (d.getTime() > Date.now() + START_MAX_AHEAD_MS) {
        ctx.addIssue({ code: 'custom', message: 'Başlangıç en fazla 30 gün sonrası olabilir' });
        return z.NEVER;
      }
      return d;
    }),
  duration_s: z
    .number({ message: 'Süre saniye cinsinden sayı olmalı' })
    .int('Süre tam sayı olmalı')
    .min(60, 'Süre en az 60 saniye olmalı')
    .max(3600, 'Süre en fazla 3600 saniye olabilir'),
  instruments: z
    .array(codeField, { message: 'Enstrümanlar liste olmalı' })
    .min(2, 'En az 2 enstrüman seçin')
    .max(5, 'En fazla 5 enstrüman seçilebilir'),
  starting_cash: z
    .number({ message: 'Başlangıç nakdi sayı olmalı' })
    .min(1000, 'Başlangıç nakdi en az 1.000 olmalı')
    .max(100_000, 'Başlangıç nakdi en fazla 100.000 olabilir')
    .optional(),
});

const adminListQuery = z.object({ limit: clampedInt(50, 1, 100), offset: clampedInt(0, 0, 1_000_000) });

adminArenaRouter.post(
  '/challenges',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createChallengeSchema, req.body);
    const data = await ArenaService.createChallenge(requireUser(req).id, input);
    await AuditService.log(req, {
      action: 'arena.challenge_create',
      targetType: 'arena_challenge',
      targetId: data.id,
      targetLabel: data.title,
      metadata: { starts_at: data.starts_at, duration_s: data.duration_s, instruments: data.instruments, sponsor: data.sponsor },
    });
    res.status(201).json({ success: true, message: 'Meydan okuma oluşturuldu', data });
  })
);

adminArenaRouter.get(
  '/challenges',
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(adminListQuery, req.query);
    res.json({ success: true, data: await ArenaService.adminListChallenges(limit, offset) });
  })
);

adminArenaRouter.post(
  '/challenges/:id/cancel',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(challengeParams, req.params);
    const data = await ArenaService.cancelChallenge(id);
    await AuditService.log(req, {
      action: 'arena.challenge_cancel',
      targetType: 'arena_challenge',
      targetId: id,
      targetLabel: data.title,
      metadata: { starts_at: data.starts_at, participants: data.participants },
    });
    res.json({ success: true, message: 'Meydan okuma iptal edildi', data });
  })
);

export default router;
