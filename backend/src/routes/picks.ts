import express, { NextFunction, Request, Response } from 'express';
import { createRateLimiter } from '../infra/rateLimitStore';
import { z } from 'zod';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { picksClock } from '../services/picks/clock';
import { PICK_ASSET_TYPES, PICK_DIRECTIONS, PICK_LIMITS } from '../services/picks/config';
import { PicksService } from '../services/picks/service';
import { isValidWeekId } from '../services/picks/timeline';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';
import { isDevLoginEnabled } from './devLogin';

/**
 * Haftalık Seçim — "Kitlelerin Bilgeliği" (/api/picks). Yanıtlar { success, data }.
 * Hatalar { success:false, message, code, ...extra, data: extra }. Çerezle gelen PUT/POST/DELETE isteklerinde
 * `X-Requested-With: PortfoyGo` zorunludur (CSRF). Tüm GET yanıtları `Cache-Control: no-store`.
 *
 *  GET    /current                              → {server_now, active: WeekView, previous: WeekView|null}   (oturum isteğe bağlı)
 *  GET    /weeks?limit=20&offset=0              → {items, total}                                          (oturum isteğe bağlı)
 *  GET    /weeks/:weekId                        → WeekView                                                (oturum isteğe bağlı)
 *  PUT    /weeks/:weekId/pick  {asset_type, symbol, direction, note?} → {pick, week}
 *  DELETE /weeks/:weekId/pick                   → {deleted, week}
 *  GET    /assets?q=&type=                      → [{asset_type, symbol, name, price, quote_currency, change_24h_pct}] (≤ 50)
 *  GET    /weeks/:weekId/comments?limit=50&before=  → {items, has_more}   (409 PICKS_HIDDEN açıklanmadan önce)
 *  POST   /weeks/:weekId/comments {text}        → 201 Comment
 *  DELETE /comments/:id                         → {id, deleted}   (yalnızca yazarı)
 *
 * Hata kodları: 409 PICKS_CLOSED, 409 PICKS_HIDDEN, 400 ASSET_UNAVAILABLE, 400 VALIDATION_ERROR,
 * 403 ADULT_CONFIRM_REQUIRED / ARENA_BREAK {break_until}, 404 WEEK_NOT_FOUND / COMMENT_NOT_FOUND,
 * 429 RATE_LIMITED / COMMENT_DAILY_LIMIT {retry_after}.
 *
 * Yönetici: adminPicksRouter → /api/admin/picks/* (routes/admin.ts bağlar).
 * Geliştirme saati: devPicksRouter → /api/dev/picks/clock (yalnızca isDevLoginEnabled(); aksi halde 404).
 */

const router = express.Router();

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

const weekParams = z.object({
  weekId: z
    .string({ message: 'Hafta gerekli' })
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => isValidWeekId(s), 'Geçersiz hafta (ör. 2026-W43)'),
});

const idParams = (label: string) => z.object({ id: z.string({ message: `${label} gerekli` }).trim().regex(UUID_RE, `Geçersiz ${label}`) });
const commentParams = idParams('yorum ID');
const pickParams = idParams('seçim ID');

const pickSchema = z.object({
  asset_type: z.enum(PICK_ASSET_TYPES, { message: 'Varlık tipi stock, crypto, currency veya commodity olmalı' }),
  symbol: z
    .string({ message: 'Sembol gerekli' })
    .trim()
    .min(1, 'Sembol gerekli')
    .max(20, 'Sembol çok uzun')
    .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
    .transform((s) => s.toUpperCase()),
  direction: z.enum(PICK_DIRECTIONS, { message: 'Yön "up" veya "down" olmalı' }),
  note: z
    .string({ message: 'Not metin olmalı' })
    .trim()
    .max(PICK_LIMITS.noteMax, `Not en fazla ${PICK_LIMITS.noteMax} karakter olabilir`)
    .nullish()
    .transform((v) => (v ? v : null)),
});

const commentSchema = z.object({
  text: z
    .string({ message: 'Yorum gerekli' })
    .trim()
    .min(1, 'Yorum gerekli')
    .max(PICK_LIMITS.commentMax, `Yorum en fazla ${PICK_LIMITS.commentMax} karakter olabilir`),
});

const listQuery = z.object({ limit: clampedInt(20, 1, 50), offset: clampedInt(0, 0, 100_000) });

const commentsQuery = z.object({
  limit: clampedInt(50, 1, 100),
  before: z
    .string()
    .trim()
    .max(64, 'Geçersiz imleç')
    .optional()
    .transform((v) => (v ? v : undefined)),
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
    .transform((v, ctx): (typeof PICK_ASSET_TYPES)[number] | undefined => {
      if (!v) return undefined;
      if ((PICK_ASSET_TYPES as readonly string[]).includes(v)) return v as (typeof PICK_ASSET_TYPES)[number];
      ctx.addIssue({ code: 'custom', message: 'Varlık tipi stock, crypto, currency veya commodity olmalı' });
      return z.NEVER;
    }),
});

// ---------------------------------------------------------------------------
// Sınırlar
// ---------------------------------------------------------------------------

/** Seçim / yorum yazma: kullanıcı başına dakikada 30 (yorumlar ayrıca 15 sn + günlük 40 ile sınırlı) */
const picksWriteLimiter = createRateLimiter('picks-write', {
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `picks:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok hızlı işlem yapıyorsun. Biraz yavaşla ve tekrar dene.', code: 'RATE_LIMITED' },
});

/** Görünürlük zamana bağlı: ara katman önbelleklerine yazılmasın */
const noStore = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'no-store');
  next();
};

router.use(noStore);

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

router.get(
  '/current',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await PicksService.current(optionalUserId(req)) });
  })
);

router.get(
  '/weeks',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(listQuery, req.query);
    res.json({ success: true, data: await PicksService.listWeeks(optionalUserId(req), limit, offset) });
  })
);

router.get(
  '/assets',
  asyncHandler(async (req, res) => {
    const { q, type } = parseOrThrow(assetsQuery, req.query);
    res.json({ success: true, data: await PicksService.assets(q, type) });
  })
);

router.get(
  '/weeks/:weekId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { weekId } = parseOrThrow(weekParams, req.params);
    res.json({ success: true, data: await PicksService.week(weekId, optionalUserId(req)) });
  })
);

router.get(
  '/weeks/:weekId/comments',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { weekId } = parseOrThrow(weekParams, req.params);
    const { limit, before } = parseOrThrow(commentsQuery, req.query);
    res.json({ success: true, data: await PicksService.listComments(weekId, optionalUserId(req), limit, before) });
  })
);

// ---------------------------------------------------------------------------
// Yazma (oturum gerekli)
// ---------------------------------------------------------------------------

router.put(
  '/weeks/:weekId/pick',
  authenticateToken,
  picksWriteLimiter,
  asyncHandler(async (req, res) => {
    const { weekId } = parseOrThrow(weekParams, req.params);
    const body = parseOrThrow(pickSchema, req.body);
    res.json({ success: true, data: await PicksService.upsertPick(requireUser(req).id, weekId, body) });
  })
);

router.delete(
  '/weeks/:weekId/pick',
  authenticateToken,
  picksWriteLimiter,
  asyncHandler(async (req, res) => {
    const { weekId } = parseOrThrow(weekParams, req.params);
    res.json({ success: true, data: await PicksService.withdrawPick(requireUser(req).id, weekId) });
  })
);

router.post(
  '/weeks/:weekId/comments',
  authenticateToken,
  picksWriteLimiter,
  asyncHandler(async (req, res) => {
    const { weekId } = parseOrThrow(weekParams, req.params);
    const { text } = parseOrThrow(commentSchema, req.body);
    res.status(201).json({ success: true, data: await PicksService.postComment(requireUser(req).id, weekId, text) });
  })
);

router.delete(
  '/comments/:id',
  authenticateToken,
  picksWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(commentParams, req.params);
    res.json({ success: true, data: await PicksService.deleteOwnComment(requireUser(req).id, id) });
  })
);

/** Ek alan taşıyan hatalar (break_until, retry_after, reveal_at …) yanıta eklenir; diğerleri genel işleyiciye. */
export function picksErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const extra = err instanceof AppError ? (err as AppError & { extra?: unknown }).extra : undefined;
  if (err instanceof AppError && extra && typeof extra === 'object' && Object.keys(extra).length > 0 && !res.headersSent) {
    const ex = extra as Record<string, unknown>;
    if (typeof ex.retry_after === 'number') res.setHeader('Retry-After', String(ex.retry_after));
    res.status(err.status).json({ success: false, message: err.publicMessage, code: err.code, ...ex, data: ex });
    return;
  }
  next(err);
}

router.use(picksErrorHandler);

export default router;

// ---------------------------------------------------------------------------
// Yönetici: /api/admin/picks/* (authenticateToken + isAdmin admin router'ında)
// ---------------------------------------------------------------------------

export const adminPicksRouter = express.Router();

const adminListQuery = z.object({ limit: clampedInt(50, 1, 100), offset: clampedInt(0, 0, 1_000_000) });
const adminCommentsQuery = adminListQuery.extend({
  week_id: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const s = v.toUpperCase();
      if (!isValidWeekId(s)) {
        ctx.addIssue({ code: 'custom', message: 'Geçersiz hafta' });
        return z.NEVER;
      }
      return s;
    }),
});

adminPicksRouter.use(noStore);

adminPicksRouter.get(
  '/weeks',
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(adminListQuery, req.query);
    res.json({ success: true, data: await PicksService.adminWeeks(limit, offset) });
  })
);

adminPicksRouter.get(
  '/comments',
  asyncHandler(async (req, res) => {
    const { limit, offset, week_id } = parseOrThrow(adminCommentsQuery, req.query);
    res.json({ success: true, data: await PicksService.adminComments(limit, offset, week_id) });
  })
);

adminPicksRouter.delete(
  '/comments/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(commentParams, req.params);
    const data = await PicksService.adminDeleteComment(requireUser(req).id, id);
    await AuditService.log(req, {
      action: 'picks.comment_delete',
      targetType: 'weekly_pick_comment',
      targetId: data.id,
      targetLabel: data.username,
      metadata: { week_id: data.week_id, text: data.text, already_deleted: data.already_deleted },
    });
    res.json({ success: true, message: 'Yorum kaldırıldı', data: { id: data.id, week_id: data.week_id, deleted: true } });
  })
);

adminPicksRouter.post(
  '/picks/:id/hide-note',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(pickParams, req.params);
    const data = await PicksService.adminHideNote(requireUser(req).id, id);
    await AuditService.log(req, {
      action: 'picks.note_hide',
      targetType: 'weekly_pick',
      targetId: data.id,
      targetLabel: data.username,
      metadata: { week_id: data.week_id, note: data.note },
    });
    res.json({ success: true, message: 'Not gizlendi', data: { id: data.id, week_id: data.week_id, note_hidden: true } });
  })
);

adminPicksRouter.use(picksErrorHandler);

// ---------------------------------------------------------------------------
// YALNIZCA YEREL GELİŞTİRME: saat kaydırma (/api/dev/picks/clock)
// isDevLoginEnabled() (yerel veritabanı + production değil + DEV_LOGIN≠0) değilse 404.
// ---------------------------------------------------------------------------

export const devPicksRouter = express.Router();

devPicksRouter.use((_req, _res, next) => {
  if (!isDevLoginEnabled()) return next(new AppError(404, 'Bulunamadı', 'NOT_FOUND'));
  next();
});

const clockSchema = z.object({
  now: z
    .union([z.string(), z.null()], { message: 'now bir ISO tarih ya da null olmalı' })
    .transform((v, ctx): Date | null => {
      if (v === null || v.trim() === '') return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'now geçerli bir ISO tarih olmalı' });
        return z.NEVER;
      }
      return d;
    }),
  rewind: z.boolean({ message: 'rewind true/false olmalı' }).optional(),
});

const clockState =() => ({ now: picksClock.now().toISOString(), overridden: picksClock.isOverridden() });

devPicksRouter.get('/clock', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: clockState() });
});

/**
 * Saati ayarlar (null → gerçek saat), yeni saatten SONRA damgalanmış durum makinesi adımlarını geri alır
 * (`rewound`; bkz. PicksService.devRewind — ileri alınıp geri dönülünce gerçek zamanlı haftalar bozulmasın)
 * ve durum makinesini hemen bir kez çalıştırır (`tick`). { now, rewind?: false } ile geri alma kapatılabilir.
 */
devPicksRouter.post(
  '/clock',
  asyncHandler(async (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ success: false, message: 'İstek gövdesi application/json olmalı' });
    }
    const { now, rewind } = parseOrThrow(clockSchema, req.body);
    picksClock.set(now);
    PicksService.clearCaches();
    const rewound = rewind === false ? null : await PicksService.devRewind(picksClock.now());
    let tick: unknown = null;
    try {
      tick = await PicksService.tick();
    } catch (err: any) {
      tick = { error: err?.publicMessage || err?.message || String(err) };
    }
    res.json({ success: true, data: { ...clockState(), rewound, tick } });
  })
);
