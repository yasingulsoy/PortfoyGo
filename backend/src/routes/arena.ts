import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { openBroadcastStream } from '../services/arena/broadcastStream';
import { ArenaDuels, CODE_LENGTH, DUEL_DURATIONS, invitePath } from '../services/arena/duels';
import { ArenaError, ArenaService, SOLO_DURATIONS } from '../services/arena/service';
import { ArenaSocial, HOST_MESSAGE_MAX, REACTION_EMOJIS } from '../services/arena/social';
import { openRoundStream } from '../services/arena/stream';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Arena (/api/arena) — hızlı al/sat oyun modu. Yanıtlar { success, data }.
 * Çerezle gelen POST/PATCH isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 *
 *  GET    /instruments                                   (herkese açık)
 *  POST   /rounds                    {duration_s, instruments?}         → 201 RoundState (solo)
 *  POST   /rounds                    {duration_s, scenario_id}          → 201 RoundState (senaryo)
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
 *  POST   /rounds/:id/reactions      {emoji}                            → 204 (katılımcı; 2 sn'de bir)
 *
 *  Düellolar:
 *  POST   /duels                     {duration_s, instruments?}         → 201 {duel, code, invite_path}
 *  GET    /duels/mine                ?limit&offset                      → {items, record, total}
 *  GET    /duels/:code                                                  → Duel
 *  POST   /duels/:code/accept                                           → {round_id, starts_at, duel_id}
 *  POST   /duels/:id/cancel                                             → Duel (davet eden, bekleyen)
 *  POST   /duels/:id/rematch                                            → 201 {duel, code, invite_path}
 *  POST   /matchmaking               {duration_s}                       → {ticket, status:'searching'}
 *  GET    /matchmaking/:ticket                                          → {status, searching_for_s, duel_id?, round_id?, starts_at?, opponent?}
 *  DELETE /matchmaking/:ticket                                          → {ticket, status}
 *
 *  Yayın (herkese açık, IP başına sınırlı):
 *  GET    /broadcast/:token                                             → BroadcastState
 *  GET    /broadcast/:token/stream   SSE (state / trade / reaction / host_message / end)
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
  /** Senaryo turu: senaryo ID'si (veya kısa adı) */
  scenario_id: z
    .string({ message: 'Senaryo ID metin olmalı' })
    .trim()
    .min(1, 'Senaryo ID gerekli')
    .max(80, 'Geçersiz senaryo ID')
    .regex(/^[A-Za-z0-9_-]+$/, 'Geçersiz senaryo ID')
    .optional(),
});

const duelDurationField = z
  .number({ message: 'Süre saniye cinsinden sayı olmalı' })
  .refine((n) => (DUEL_DURATIONS as readonly number[]).includes(n), `Süre ${DUEL_DURATIONS.join(', ')} saniyeden biri olmalı`);

const createDuelSchema = z.object({
  duration_s: duelDurationField,
  instruments: z.array(codeField, { message: 'Enstrümanlar liste olmalı' }).max(4, 'En fazla 4 enstrüman seçilebilir').optional(),
});

const matchmakingSchema = z.object({ duration_s: duelDurationField });

const duelCodeParams = z.object({
  code: z
    .string({ message: 'Davet kodu gerekli' })
    .trim()
    .regex(new RegExp(`^[A-Za-z0-9]{${CODE_LENGTH}}$`), 'Geçersiz davet kodu')
    .transform((s) => s.toUpperCase()),
});
const duelIdParams = z.object({ id: uuid('düello ID') });
const ticketParams = z.object({ ticket: uuid('bilet') });

const reactionSchema = z.object({
  emoji: z.string({ message: 'Tepki gerekli' }).refine((v) => (REACTION_EMOJIS as readonly string[]).includes(v), `Tepki şunlardan biri olmalı: ${REACTION_EMOJIS.join(' ')}`),
});

const broadcastParams = z.object({
  token: z
    .string({ message: 'Jeton gerekli' })
    .trim()
    .regex(/^[0-9a-fA-F]{32}$/, 'Geçersiz yayın jetonu')
    .transform((s) => s.toLowerCase()),
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

/** Arena sorgulama (düello / eşleştirme durumu yoklaması): kullanıcı başına dakikada 240 */
const arenaPollLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `arena-poll:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok sık istek gönderiliyor. Biraz yavaşla.', code: 'RATE_LIMITED' },
});

/** Herkese açık yayın durumu: IP başına dakikada 120 */
const broadcastLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.', code: 'RATE_LIMITED' },
});

/** Herkese açık yayın akışı bağlantısı: IP başına dakikada 20 (ayrıca eşzamanlı bağlantı sınırı var) */
const broadcastStreamLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Çok fazla yayın bağlantısı açıldı. Lütfen biraz sonra tekrar deneyin.', code: 'RATE_LIMITED' },
});

// ---------------------------------------------------------------------------
// Herkese açık
// ---------------------------------------------------------------------------

router.get(
  '/broadcast/:token',
  broadcastLimiter,
  asyncHandler(async (req, res) => {
    const { token } = parseOrThrow(broadcastParams, req.params);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await ArenaSocial.broadcastState(token) });
  })
);

router.get('/broadcast/:token/stream', broadcastStreamLimiter, (req: Request, res: Response, next: NextFunction) => {
  let token: string;
  try {
    token = parseOrThrow(broadcastParams, req.params).token;
  } catch (err) {
    return next(err);
  }
  openBroadcastStream(req, res, token).catch((err) => {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  });
});

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
    const userId = requireUser(req).id;
    const data = input.scenario_id
      ? await ArenaService.createScenarioRound(userId, { scenario_id: input.scenario_id, duration_s: input.duration_s })
      : await ArenaService.createSoloRound(userId, { duration_s: input.duration_s, instruments: input.instruments });
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

router.post(
  '/rounds/:id/reactions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(roundParams, req.params);
    const { emoji } = parseOrThrow(reactionSchema, req.body);
    await ArenaSocial.react(id, requireUser(req).id, emoji);
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// Düellolar
// ---------------------------------------------------------------------------

router.post(
  '/duels',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createDuelSchema, req.body);
    const duel = await ArenaDuels.createInvite(requireUser(req).id, input);
    res.status(201).json({ success: true, data: { duel, code: duel.code, invite_path: invitePath(duel.code) } });
  })
);

router.get(
  '/duels/mine',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(historyQuery, req.query);
    res.json({ success: true, data: await ArenaDuels.mine(requireUser(req).id, limit, offset) });
  })
);

router.get(
  '/duels/:code',
  authenticateToken,
  arenaPollLimiter,
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(duelCodeParams, req.params);
    res.json({ success: true, data: await ArenaDuels.getByCode(code, requireUser(req).id) });
  })
);

router.post(
  '/duels/:code/accept',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(duelCodeParams, req.params);
    res.json({ success: true, data: await ArenaDuels.accept(code, requireUser(req).id) });
  })
);

router.post(
  '/duels/:id/cancel',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(duelIdParams, req.params);
    res.json({ success: true, data: await ArenaDuels.cancel(id, requireUser(req).id) });
  })
);

router.post(
  '/duels/:id/rematch',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(duelIdParams, req.params);
    const { duel, created } = await ArenaDuels.rematch(id, requireUser(req).id);
    res.status(created ? 201 : 200).json({ success: true, data: { duel, code: duel.code, invite_path: invitePath(duel.code) } });
  })
);

// ---------------------------------------------------------------------------
// Eşleştirme
// ---------------------------------------------------------------------------

router.post(
  '/matchmaking',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { duration_s } = parseOrThrow(matchmakingSchema, req.body);
    res.json({ success: true, data: await ArenaDuels.joinMatchmaking(requireUser(req).id, duration_s) });
  })
);

router.get(
  '/matchmaking/:ticket',
  authenticateToken,
  arenaPollLimiter,
  asyncHandler(async (req, res) => {
    const { ticket } = parseOrThrow(ticketParams, req.params);
    res.json({ success: true, data: await ArenaDuels.getTicket(ticket, requireUser(req).id) });
  })
);

router.delete(
  '/matchmaking/:ticket',
  authenticateToken,
  arenaWriteLimiter,
  asyncHandler(async (req, res) => {
    const { ticket } = parseOrThrow(ticketParams, req.params);
    res.json({ success: true, data: await ArenaDuels.cancelTicket(ticket, requireUser(req).id) });
  })
);

/**
 * Ek alan taşıyan hatalar (ArenaError: round_id, retry_after, duel_id …; oyun modülünün GameError'u:
 * break_until, limit, resets_at …) yanıta eklenir; diğer hatalar genel işleyiciye gider.
 */
export function arenaErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const extra = err instanceof AppError ? (err as AppError & { extra?: unknown }).extra : undefined;
  if (err instanceof AppError && extra && typeof extra === 'object' && Object.keys(extra).length > 0 && !res.headersSent) {
    const ex = extra as Record<string, unknown>;
    if (typeof ex.retry_after === 'number') res.setHeader('Retry-After', String(ex.retry_after));
    res.status(err.status).json({ success: false, message: err.publicMessage, code: err.code, ...ex, data: ex });
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

const hostMessageSchema = z.object({
  text: z
    .string({ message: 'Mesaj gerekli' })
    .trim()
    .min(1, 'Mesaj gerekli')
    .max(HOST_MESSAGE_MAX, `Mesaj en fazla ${HOST_MESSAGE_MAX} karakter olabilir`),
});

adminArenaRouter.post(
  '/challenges/:id/broadcast-token',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(challengeParams, req.params);
    const { token, overlay_path, title } = await ArenaSocial.regenerateBroadcastToken(id);
    await AuditService.log(req, {
      action: 'arena.broadcast_token',
      targetType: 'arena_challenge',
      targetId: id,
      targetLabel: title,
      metadata: { regenerated: true },
    });
    res.json({ success: true, message: 'Yayın bağlantısı oluşturuldu', data: { token, overlay_path } });
  })
);

adminArenaRouter.post(
  '/challenges/:id/message',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(challengeParams, req.params);
    const { text } = parseOrThrow(hostMessageSchema, req.body);
    const data = await ArenaSocial.hostMessage(id, requireUser(req).id, text);
    await AuditService.log(req, {
      action: 'arena.host_message',
      targetType: 'arena_challenge',
      targetId: id,
      targetLabel: null,
      metadata: { text: data.text, message_id: data.id },
    });
    res.status(201).json({ success: true, message: 'Mesaj yayınlandı', data });
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
