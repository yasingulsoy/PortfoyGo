import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../infra/rateLimitStore';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { AuditService } from '../services/audit';
import {
  IDEA_ASSET_TYPES,
  IDEA_HORIZONS,
  IDEA_LIMITS,
  IDEA_OUTCOMES,
  IDEA_SCOPES,
  IDEA_STANCES,
  IDEA_STATUSES,
  IDEA_TEXT,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  RESPONSE_STANCES,
} from '../services/ideas/config';
import { IDEA_SCOPE_FILTERS, IDEA_VIEWS, IdeasService } from '../services/ideas/service';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';
import { picksErrorHandler } from './picks';

/**
 * Ortak Akıl — Öneri Havuzu (/api/ideas). Yanıtlar { success, data }. Hatalar { success:false, message, code, ...extra }.
 * Çerezle gelen POST/PUT/DELETE isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF). GET yanıtları no-store.
 *
 *  GET    /?view=newest|review_due|closed|bookmarks|mine&scope=all|public|leagues&league_id=&asset_type=&stance=&horizon=&status=&q=&author=&limit=&offset=
 *                                             → {items: IdeaCard[], total, limit, offset}          (oturum isteğe bağlı)
 *  GET    /compare?ids=a,b,c                  → {items: IdeaDetail[], missing}                       (2–3 öneri)
 *  GET    /:id                                → IdeaDetail                                           (oturum isteğe bağlı)
 *  GET    /:id/chart                          → {points, ref_price, target_price, invalidation_price, …}
 *  GET    /:id/comments?limit=&before=        → {items, has_more}
 *  POST   /                                   → 201 IdeaDetail   (5 öneri / İstanbul günü)
 *  POST   /:id/updates {text}                 → 201 IdeaUpdate   (yalnızca yazar, açık öneri; 20 not / gün)
 *  POST   /:id/close {outcome, evaluation, lessons?} → IdeaDetail
 *  PUT    /:id/response {stance, reason}      → IdeaResponse     (kullanıcı başına bir; düzenlenebilir)
 *  DELETE /:id/response                       → {deleted}
 *  POST   /:id/comments {text}                → 201 IdeaComment  (15 sn'de bir, 30 / gün)
 *  DELETE /comments/:id                       → {id, deleted}    (yalnızca yazarı)
 *  PUT    /:id/bookmark · DELETE /:id/bookmark → {bookmarked}
 *  POST   /reports {target_type, target_id, reason, note?} → 201 {id, already_reported}
 *
 * Hata kodları: 404 IDEA_NOT_FOUND (yok ya da görme yetkisi yok — lig önerileri yalnızca üyelere), 400 VALIDATION_ERROR /
 * MONITOR_REQUIRED / INVALID_LEVELS {ref_price} / ASSET_UNAVAILABLE / OWN_CONTENT, 403 EMAIL_NOT_VERIFIED / NOT_AUTHOR /
 * OWN_IDEA / LEAGUE_MEMBERSHIP_REQUIRED, 409 IDEA_CLOSED / IDEA_HIDDEN, 429 IDEA_DAILY_LIMIT / COMMENT_DAILY_LIMIT /
 * UPDATE_DAILY_LIMIT / REPORT_DAILY_LIMIT / RATE_LIMITED {retry_after}.
 *
 * Yönetici: adminIdeasRouter → /api/admin/ideas/* (routes/admin.ts bağlar).
 */

const router = express.Router();

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

/** Boş string → undefined; aksi halde listedeki değerlerden biri olmalı */
const optionalEnum = <T extends readonly string[]>(values: T, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx): T[number] | undefined => {
      if (!v) return undefined;
      if ((values as readonly string[]).includes(v)) return v as T[number];
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    });

const idParams = (label: string) => z.object({ id: z.string({ message: `${label} gerekli` }).trim().regex(UUID_RE, `Geçersiz ${label}`).transform((s) => s.toLowerCase()) });
const ideaParams = idParams('öneri ID');
const commentParams = idParams('yorum ID');
const reportParams = idParams('şikâyet ID');
const targetParams = idParams('içerik ID');

const text = (label: string, min: number, max: number) =>
  z
    .string({ message: `${label} gerekli` })
    .trim()
    .min(min, min > 1 ? `${label} en az ${min} karakter olmalı` : `${label} gerekli`)
    // Temizlik (kontrol karakterleri) servis katmanında; burada yalnızca kaba üst sınır (satır sonları vb. için pay)
    .max(max + 200, `${label} en fazla ${max} karakter olabilir`);

const optionalText = (label: string, max: number) =>
  z
    .string({ message: `${label} metin olmalı` })
    .trim()
    .max(max + 200, `${label} en fazla ${max} karakter olabilir`)
    .nullish()
    .transform((v) => (v ? v : null));

const priceLevel = (label: string) =>
  z
    .union([z.number(), z.string(), z.null()], { message: `${label} sayı olmalı` })
    .optional()
    .transform((v, ctx): number | null => {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0 || n > 1e12) {
        ctx.addIssue({ code: 'custom', message: `${label} pozitif bir sayı olmalı` });
        return z.NEVER;
      }
      return n;
    });

const createSchema = z.object({
  asset_type: z.enum(IDEA_ASSET_TYPES, { message: 'Varlık tipi stock, crypto, currency veya commodity olmalı' }),
  symbol: z
    .string({ message: 'Varlık gerekli' })
    .trim()
    .min(1, 'Varlık gerekli')
    .max(20, 'Sembol çok uzun')
    .regex(/^[A-Za-z0-9._\-=^]+$/, 'Geçersiz sembol')
    .transform((s) => s.toUpperCase()),
  stance: z.enum(IDEA_STANCES, { message: 'Duruş "al", "sat" veya "izle" olmalı' }),
  horizon: z.enum(IDEA_HORIZONS, { message: 'Vade 1w, 1m, 3m, 6m veya 1y olmalı' }),
  rationale: text('Gerekçe', IDEA_TEXT.rationale.min, IDEA_TEXT.rationale.max),
  scenario: text('Beklenen senaryo', IDEA_TEXT.scenario.min, IDEA_TEXT.scenario.max),
  scenario_bull: optionalText('İyimser senaryo', IDEA_TEXT.scenarioCase.max),
  scenario_base: optionalText('Temel senaryo', IDEA_TEXT.scenarioCase.max),
  scenario_bear: optionalText('Kötümser senaryo', IDEA_TEXT.scenarioCase.max),
  risks: text('Riskler', IDEA_TEXT.risks.min, IDEA_TEXT.risks.max),
  target_price: priceLevel('Hedef seviye'),
  invalidation_price: priceLevel('Geçersizlik seviyesi'),
  review_date: z
    .string({ message: 'Değerlendirme tarihi metin olmalı' })
    .trim()
    .nullish()
    .transform((v) => (v ? v.slice(0, 10) : null)),
  tags: z.array(z.string({ message: 'Etiketler metin olmalı' }).max(40, 'Etiket çok uzun'), { message: 'Etiketler liste olmalı' }).max(10, 'En fazla 5 etiket eklenebilir').nullish(),
  scope: z.enum(IDEA_SCOPES, { message: 'Kapsam "public" veya "league" olmalı' }).optional().transform((v) => v ?? 'public'),
  league_id: z
    .string()
    .trim()
    .regex(UUID_RE, 'Geçersiz lig')
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
});

const updateSchema = z.object({ text: text('İzleme notu', IDEA_TEXT.update.min, IDEA_TEXT.update.max) });

const closeSchema = z.object({
  outcome: z.enum(IDEA_OUTCOMES, { message: 'Sonuç "beklendigi_gibi", "kismen" veya "beklenmedik" olmalı' }),
  evaluation: text('Değerlendirme', IDEA_TEXT.evaluation.min, IDEA_TEXT.evaluation.max),
  lessons: optionalText('Çıkarılan dersler', IDEA_TEXT.lessons.max),
});

const responseSchema = z.object({
  stance: z.enum(RESPONSE_STANCES, { message: 'Yanıt "katiliyorum" veya "katilmiyorum" olmalı' }),
  reason: text('Gerekçe', IDEA_TEXT.responseReason.min, IDEA_TEXT.responseReason.max),
});

const commentSchema = z.object({ text: text('Yorum', IDEA_TEXT.comment.min, IDEA_TEXT.comment.max) });

const reportSchema = z.object({
  target_type: z.enum(REPORT_TARGETS, { message: 'Geçersiz şikâyet hedefi' }),
  target_id: z.string({ message: 'İçerik gerekli' }).trim().regex(UUID_RE, 'Geçersiz içerik').transform((s) => s.toLowerCase()),
  reason: z.enum(REPORT_REASONS, { message: 'Bir şikâyet nedeni seç' }),
  note: optionalText('Açıklama', IDEA_TEXT.reportNote.max),
});

const listQuery = z.object({
  view: optionalEnum(IDEA_VIEWS, 'Geçersiz görünüm').transform((v) => v ?? 'newest'),
  scope: optionalEnum(IDEA_SCOPE_FILTERS, 'Geçersiz kapsam').transform((v) => v ?? 'all'),
  league_id: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      if (!UUID_RE.test(v)) {
        ctx.addIssue({ code: 'custom', message: 'Geçersiz lig' });
        return z.NEVER;
      }
      return v.toLowerCase();
    }),
  asset_type: optionalEnum(IDEA_ASSET_TYPES, 'Geçersiz varlık tipi'),
  stance: optionalEnum(IDEA_STANCES, 'Geçersiz duruş'),
  horizon: optionalEnum(IDEA_HORIZONS, 'Geçersiz vade'),
  status: optionalEnum(IDEA_STATUSES, 'Geçersiz durum'),
  q: z
    .string()
    .trim()
    .max(40, 'Arama en fazla 40 karakter olabilir')
    .optional()
    .transform((v) => (v ? v : undefined)),
  author: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v ? v : undefined)),
  limit: clampedInt(20, 1, IDEA_LIMITS.pageMax),
  offset: clampedInt(0, 0, 100_000),
});

const compareQuery = z.object({
  ids: z
    .string({ message: 'Karşılaştırılacak önerileri seç' })
    .transform((v) => [...new Set(v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))])
    .refine((list) => list.length >= 2 && list.length <= IDEA_LIMITS.compareMax, `Karşılaştırma için 2–${IDEA_LIMITS.compareMax} öneri seç`)
    .refine((list) => list.every((s) => UUID_RE.test(s)), 'Geçersiz öneri'),
});

const commentsQuery = z.object({
  limit: clampedInt(30, 1, 100),
  before: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

// ---------------------------------------------------------------------------
// Sınırlar
// ---------------------------------------------------------------------------

/** Yazma: kullanıcı başına dakikada 30 (öneri / yorum / not / şikâyet ayrıca günlük sınırlı) */
const ideasWriteLimiter = createRateLimiter('ideas-write', {
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `ideas:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`,
  message: { success: false, message: 'Çok hızlı işlem yapıyorsun. Biraz yavaşla ve tekrar dene.', code: 'RATE_LIMITED' },
});

const noStore = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'no-store');
  next();
};

router.use(noStore);

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const f = parseOrThrow(listQuery, req.query);
    res.json({ success: true, data: await IdeasService.list(optionalUserId(req), f) });
  })
);

router.get(
  '/compare',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { ids } = parseOrThrow(compareQuery, req.query);
    res.json({ success: true, data: await IdeasService.compare(ids, optionalUserId(req)) });
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    res.json({ success: true, data: await IdeasService.detail(id, optionalUserId(req)) });
  })
);

router.get(
  '/:id/chart',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    res.json({ success: true, data: await IdeasService.chart(id, optionalUserId(req)) });
  })
);

router.get(
  '/:id/comments',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    const { limit, before } = parseOrThrow(commentsQuery, req.query);
    res.json({ success: true, data: await IdeasService.listComments(id, optionalUserId(req), limit, before) });
  })
);

// ---------------------------------------------------------------------------
// Yazma (oturum gerekli)
// ---------------------------------------------------------------------------

router.post(
  '/',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(createSchema, req.body);
    res.status(201).json({ success: true, data: await IdeasService.create(requireUser(req).id, body) });
  })
);

router.post(
  '/reports',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(reportSchema, req.body);
    res.status(201).json({ success: true, data: await IdeasService.report(requireUser(req).id, body) });
  })
);

router.delete(
  '/comments/:id',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(commentParams, req.params);
    res.json({ success: true, data: await IdeasService.deleteOwnComment(requireUser(req).id, id) });
  })
);

router.post(
  '/:id/updates',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    const { text: body } = parseOrThrow(updateSchema, req.body);
    res.status(201).json({ success: true, data: await IdeasService.addUpdate(requireUser(req).id, id, body) });
  })
);

router.post(
  '/:id/close',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    const body = parseOrThrow(closeSchema, req.body);
    res.json({ success: true, data: await IdeasService.close(requireUser(req).id, id, body) });
  })
);

router.put(
  '/:id/response',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    const { stance, reason } = parseOrThrow(responseSchema, req.body);
    res.json({ success: true, data: await IdeasService.upsertResponse(requireUser(req).id, id, stance, reason) });
  })
);

router.delete(
  '/:id/response',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    res.json({ success: true, data: await IdeasService.deleteResponse(requireUser(req).id, id) });
  })
);

router.post(
  '/:id/comments',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    const { text: body } = parseOrThrow(commentSchema, req.body);
    res.status(201).json({ success: true, data: await IdeasService.postComment(requireUser(req).id, id, body) });
  })
);

router.put(
  '/:id/bookmark',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    res.json({ success: true, data: await IdeasService.setBookmark(requireUser(req).id, id, true) });
  })
);

router.delete(
  '/:id/bookmark',
  authenticateToken,
  ideasWriteLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(ideaParams, req.params);
    res.json({ success: true, data: await IdeasService.setBookmark(requireUser(req).id, id, false) });
  })
);

router.use(picksErrorHandler);

export default router;

// ---------------------------------------------------------------------------
// Yönetici: /api/admin/ideas/* (authenticateToken + isAdmin admin router'ında)
// ---------------------------------------------------------------------------

export const adminIdeasRouter = express.Router();

const adminListQuery = z.object({ limit: clampedInt(50, 1, 100), offset: clampedInt(0, 0, 1_000_000) });
const adminReportsQuery = adminListQuery.extend({
  status: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx): (typeof REPORT_STATUSES)[number] | 'all' => {
      if (!v) return 'acik';
      if (v === 'all' || (REPORT_STATUSES as readonly string[]).includes(v)) return v as (typeof REPORT_STATUSES)[number] | 'all';
      ctx.addIssue({ code: 'custom', message: 'Geçersiz durum' });
      return z.NEVER;
    }),
});
const adminIdeasQuery = adminListQuery.extend({
  filter: optionalEnum(['all', 'hidden', 'reported'] as const, 'Geçersiz filtre').transform((v) => v ?? 'all'),
  q: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
const resolveSchema = z.object({ status: z.enum(['islendi', 'reddedildi'] as const, { message: 'Durum "islendi" veya "reddedildi" olmalı' }) });
const hideSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(IDEA_TEXT.hiddenReason.max, `Neden en fazla ${IDEA_TEXT.hiddenReason.max} karakter olabilir`)
    .nullish()
    .transform((v) => (v ? v : null)),
});
const hideTargets = z.object({ kind: z.enum(['ideas', 'responses', 'updates'] as const, { message: 'Geçersiz içerik türü' }) });

adminIdeasRouter.use(noStore);

adminIdeasRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await IdeasService.adminSummary() });
  })
);

adminIdeasRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { status, limit, offset } = parseOrThrow(adminReportsQuery, req.query);
    res.json({ success: true, data: await IdeasService.adminReports(status, limit, offset) });
  })
);

adminIdeasRouter.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(reportParams, req.params);
    const { status } = parseOrThrow(resolveSchema, req.body);
    const data = await IdeasService.adminResolveReport(requireUser(req).id, id, status);
    await AuditService.log(req, {
      action: 'ideas.report_resolve',
      targetType: 'idea_report',
      targetId: data.id,
      targetLabel: `${data.target_type}:${data.target_id}`,
      metadata: { status, reason: data.reason, idea_id: data.idea_id },
    });
    res.json({ success: true, message: status === 'islendi' ? 'Şikâyet işlendi' : 'Şikâyet reddedildi', data: { id: data.id, status } });
  })
);

adminIdeasRouter.get(
  '/ideas',
  asyncHandler(async (req, res) => {
    const { filter, limit, offset, q } = parseOrThrow(adminIdeasQuery, req.query);
    res.json({ success: true, data: await IdeasService.adminIdeas(filter, limit, offset, q) });
  })
);

adminIdeasRouter.get(
  '/comments',
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(adminListQuery, req.query);
    res.json({ success: true, data: await IdeasService.adminComments(limit, offset) });
  })
);

const TARGET_OF = { ideas: 'idea', responses: 'response', updates: 'update' } as const;
const AUDIT_TARGET = { idea: 'idea', response: 'idea_response', update: 'idea_update' } as const;

for (const hidden of [true, false]) {
  adminIdeasRouter.post(
    `/:kind/:id/${hidden ? 'hide' : 'unhide'}`,
    asyncHandler(async (req, res) => {
      const { kind } = parseOrThrow(hideTargets, req.params);
      const { id } = parseOrThrow(targetParams, req.params);
      const { reason } = hidden ? parseOrThrow(hideSchema, req.body) : { reason: null };
      const target = TARGET_OF[kind];
      const data = await IdeasService.adminSetHidden(requireUser(req).id, target, id, hidden, reason);
      await AuditService.log(req, {
        action: hidden ? 'ideas.hide' : 'ideas.unhide',
        targetType: AUDIT_TARGET[target],
        targetId: data.id,
        targetLabel: data.username,
        metadata: { idea_id: data.idea_id, text: data.text.slice(0, 500), reason, changed: data.changed },
      });
      res.json({ success: true, message: hidden ? 'İçerik gizlendi' : 'İçerik yeniden görünür', data: { id: data.id, idea_id: data.idea_id, hidden } });
    })
  );
}

adminIdeasRouter.delete(
  '/comments/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(commentParams, req.params);
    const data = await IdeasService.adminDeleteComment(requireUser(req).id, id);
    await AuditService.log(req, {
      action: 'ideas.comment_delete',
      targetType: 'idea_comment',
      targetId: data.id,
      targetLabel: data.username,
      metadata: { idea_id: data.idea_id, text: data.text, already_deleted: data.already_deleted },
    });
    res.json({ success: true, message: 'Yorum kaldırıldı', data: { id: data.id, idea_id: data.idea_id, deleted: true } });
  })
);

adminIdeasRouter.use(picksErrorHandler);
