import express, { Request } from 'express';
import { createRateLimiter } from '../infra/rateLimitStore';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { PROFILE_IDS, questionnaireView } from '../services/advisor/questionnaire';
import {
  AdvisorService,
  MAX_HORIZON_MONTHS,
  MAX_PLAN_AMOUNT,
  MIN_APPLY_AMOUNT,
  MIN_HORIZON_MONTHS,
  MIN_PLAN_AMOUNT,
} from '../services/advisor/service';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Portföy danışmanı (/api/advisor). Yanıtlar { success, data }.
 * Çerezle gelen POST isteklerinde `X-Requested-With: PortfoyGo` zorunludur (CSRF).
 *
 *  GET  /questionnaire                       (herkese açık) → {version, questions, profiles}
 *  POST /profile        {answers}            → RiskProfile
 *  GET  /profile                             → RiskProfile | null
 *  POST /plans          {profile_id?, profile_override?, horizon_months?, amount_try?} → 201 Plan
 *  GET  /plans          ?limit=10            → {items: PlanSummary[]}
 *  GET  /plans/:id                           → Plan (yalnızca sahibi)
 *  POST /plans/:id/apply {amount_try, mode?: 'buy_only'} → {executed, skipped, spent, remaining_cash}
 *
 * Hesaplama deterministiktir (MPT + Monte Carlo); bkz. services/advisor/*.
 */

const router = express.Router();

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuid = (label: string) => z.string({ message: `${label} gerekli` }).trim().regex(UUID_RE, `Geçersiz ${label}`);

const profileSchema = z.object({
  answers: z.record(
    z.string().max(40, 'Geçersiz soru'),
    z.string({ message: 'Yanıtlar metin olmalı' }).max(40, 'Geçersiz seçenek'),
    { message: 'Yanıtlar gerekli' }
  ),
});

const finite = (label: string) =>
  z.number({ message: `${label} sayı olmalı` }).refine((n) => Number.isFinite(n), `${label} geçerli bir sayı olmalı`);

const createPlanSchema = z.object({
  profile_id: uuid('profil ID').nullish().transform((v) => v ?? undefined),
  profile_override: z
    .enum(PROFILE_IDS, { message: 'Geçersiz risk profili' })
    .nullish()
    .transform((v) => v ?? undefined),
  horizon_months: z
    .number({ message: 'Vade (ay) sayı olmalı' })
    .refine((n) => Number.isInteger(n), 'Vade tam sayı (ay) olmalı')
    .refine((n) => n >= MIN_HORIZON_MONTHS && n <= MAX_HORIZON_MONTHS, `Vade ${MIN_HORIZON_MONTHS}–${MAX_HORIZON_MONTHS} ay arasında olmalı`)
    .nullish()
    .transform((v) => v ?? undefined),
  amount_try: finite('Tutar')
    .refine(
      (n) => n >= MIN_PLAN_AMOUNT && n <= MAX_PLAN_AMOUNT,
      `Tutar ${MIN_PLAN_AMOUNT.toLocaleString('tr-TR')}–${MAX_PLAN_AMOUNT.toLocaleString('tr-TR')} TL arasında olmalı`
    )
    .nullish()
    .transform((v) => v ?? undefined),
});

const applySchema = z.object({
  amount_try: finite('Tutar').refine(
    (n) => n >= MIN_APPLY_AMOUNT && n <= MAX_PLAN_AMOUNT,
    `Tutar ${MIN_APPLY_AMOUNT.toLocaleString('tr-TR')}–${MAX_PLAN_AMOUNT.toLocaleString('tr-TR')} TL arasında olmalı`
  ),
  mode: z
    .enum(['buy_only'], { message: 'Sadece "buy_only" modu destekleniyor' })
    .optional()
    .transform((v) => v ?? 'buy_only'),
});

const planParams = z.object({ id: uuid('plan ID') });

const listQuery = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10;
    }),
});

// ---------------------------------------------------------------------------
// Sınırlar (kullanıcı başına)
// ---------------------------------------------------------------------------

const userKey = (prefix: string) => (req: Request) => `${prefix}:${(req as Request & { user?: { id: string } }).user?.id ?? 'anon'}`;

/** Plan üretimi (CPU yoğun): kullanıcı başına saatte 20 */
const planLimiter = createRateLimiter('advisor-plan', {
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey('advisor-plan'),
  message: { success: false, message: 'Saatlik plan oluşturma sınırına ulaştın. Lütfen daha sonra tekrar dene.', code: 'RATE_LIMITED' },
});

/** Anket kaydı / plan uygulama: kullanıcı başına saatte 60 */
const writeLimiter = createRateLimiter('advisor-write', {
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey('advisor-write'),
  message: { success: false, message: 'Çok fazla istek gönderdin. Lütfen daha sonra tekrar dene.', code: 'RATE_LIMITED' },
});

// ---------------------------------------------------------------------------
// Uçlar
// ---------------------------------------------------------------------------

router.get('/questionnaire', (_req, res) => {
  res.json({ success: true, data: questionnaireView() });
});

router.post(
  '/profile',
  authenticateToken,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { answers } = parseOrThrow(profileSchema, req.body);
    const data = await AdvisorService.submitProfile(requireUser(req).id, answers);
    res.status(201).json({ success: true, data });
  })
);

router.get(
  '/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await AdvisorService.getLatestProfile(requireUser(req).id) });
  })
);

router.post(
  '/plans',
  authenticateToken,
  planLimiter,
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createPlanSchema, req.body);
    const data = await AdvisorService.createPlan(requireUser(req).id, input);
    res.status(201).json({ success: true, data });
  })
);

router.get(
  '/plans',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit } = parseOrThrow(listQuery, req.query);
    res.json({ success: true, data: await AdvisorService.listPlans(requireUser(req).id, limit) });
  })
);

router.get(
  '/plans/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(planParams, req.params);
    res.json({ success: true, data: await AdvisorService.getPlan(requireUser(req).id, id) });
  })
);

router.post(
  '/plans/:id/apply',
  authenticateToken,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(planParams, req.params);
    const input = parseOrThrow(applySchema, req.body);
    const data = await AdvisorService.applyPlan(requireUser(req).id, id, input);
    res.json({ success: true, data });
  })
);

export default router;
