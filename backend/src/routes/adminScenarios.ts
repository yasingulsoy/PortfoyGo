import express, { type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { AuditService } from '../services/audit';
import { parseTimestamp } from '../services/scenarios/csv';
import { DIFFICULTIES, ScenarioService, SeriesService } from '../services/scenarios/service';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Yönetici: senaryo modu — /api/admin/arena altında (authenticateToken + isAdmin). Yanıtlar { success, data }.
 *
 *  POST   /series/import             {series_code, label, currency, source, license_note, rows? | csv?, replace?}
 *                                     → {series_code, points, imported, from, to, rejected_rows, rejected_samples, duplicates, replaced}
 *  GET    /series                    → items [{series_code, label, currency, source, license_note, points, from, to, imported_at, used_by}]
 *  GET    /series/:code/preview      ?limit=500&from&to → {series_code, label, currency, total, points:[{t,p}]}
 *  DELETE /series/:code              (409 SERIES_IN_USE: yayındaki senaryo kullanıyorsa)
 *  GET    /scenarios                 → items [AdminScenario]
 *  GET    /scenarios/:id             → AdminScenario
 *  POST   /scenarios                 {title, description, briefing, debrief, difficulty, instruments:[{code,label,series_code}], window_from, window_to, synthetic?}
 *  PATCH  /scenarios/:id             (aynı alanlar, kısmi)
 *  DELETE /scenarios/:id
 *  POST   /scenarios/:id/publish     {published: boolean}
 *
 * Denetim kaydı: scenario.series_import, scenario.series_delete, scenario.create, scenario.update,
 * scenario.publish, scenario.delete.
 *
 * Büyük CSV gövdesi: genel JSON sınırı 50 KB'tır; içe aktarma ucu için `seriesImportBodyParser` app.ts'te
 * genel ayrıştırıcıdan ÖNCE bağlanır (önce yönetici doğrulaması, sonra 10 MB'a kadar JSON).
 */

export const SERIES_IMPORT_PATH = '/api/admin/arena/series/import';
export const SERIES_IMPORT_BODY_LIMIT = '10mb';

/** app.ts: app.use(SERIES_IMPORT_PATH, ...seriesImportBodyParser) — express.json'dan önce */
export const seriesImportBodyParser: RequestHandler[] = [
  cookieParser(),
  authenticateToken as RequestHandler,
  isAdmin as RequestHandler,
  express.json({ limit: SERIES_IMPORT_BODY_LIMIT }),
];

const router = express.Router();
router.use(['/series', '/scenarios'], authenticateToken, isAdmin);

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const idParams = z.object({ id: z.string({ message: 'Senaryo ID gerekli' }).trim().regex(UUID_RE, 'Geçersiz senaryo ID') });

const seriesCodeField = z
  .string({ message: 'Seri kodu gerekli' })
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9_]{3,40}$/, 'Seri kodu 3–40 karakter olmalı (A-Z, 0-9, _)'));
const codeParams = z.object({ code: seriesCodeField });

const text = (label: string, min: number, max: number) =>
  z
    .string({ message: `${label} gerekli` })
    .trim()
    .min(min, min <= 1 ? `${label} gerekli` : `${label} en az ${min} karakter olmalı`)
    .max(max, `${label} en fazla ${max} karakter olabilir`);

const importSchema = z
  .object({
    series_code: seriesCodeField,
    label: text('Etiket', 1, 80),
    currency: z.enum(['USD', 'TRY'], { message: 'Para birimi "USD" veya "TRY" olmalı' }),
    source: text('Kaynak', 3, 160),
    license_note: text('Lisans notu', 3, 300),
    rows: z.array(z.unknown(), { message: 'rows bir dizi olmalı' }).optional(),
    csv: z.string({ message: 'csv metin olmalı' }).optional(),
    replace: z.boolean({ message: 'replace true/false olmalı' }).optional(),
  })
  .refine((v) => (v.rows !== undefined) !== (v.csv !== undefined), 'rows veya csv alanlarından yalnızca birini gönderin');

const clampedInt = (def: number, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
    });

const dateField = (label: string) =>
  z.union([z.string(), z.number()], { message: `${label} gerekli` }).transform((v, ctx) => {
    const ms = parseTimestamp(v);
    if (ms === null) {
      ctx.addIssue({ code: 'custom', message: `${label} geçerli bir tarih olmalı (ISO veya epoch)` });
      return z.NEVER;
    }
    return new Date(ms);
  });

const previewQuery = z.object({
  limit: clampedInt(500, 2, 2000),
  from: dateField('Başlangıç').optional(),
  to: dateField('Bitiş').optional(),
});

const instrumentSchema = z.object({
  code: z
    .string({ message: 'Enstrüman kodu gerekli' })
    .trim()
    .regex(/^[A-Za-z]{3,12}$/, 'Geçersiz enstrüman kodu')
    .transform((s) => s.toUpperCase()),
  label: z.string().trim().max(40, 'Enstrüman etiketi en fazla 40 karakter olabilir').nullish(),
  series_code: seriesCodeField,
});

const scenarioFields = {
  title: text('Başlık', 3, 80),
  description: z
    .string({ message: 'Açıklama metin olmalı' })
    .trim()
    .max(300, 'Açıklama en fazla 300 karakter olabilir')
    .nullish()
    .transform((v) => (v ? v : null)),
  briefing: text('Brifing', 1, 5000),
  debrief: text('Değerlendirme (debrief)', 1, 5000),
  difficulty: z.enum(DIFFICULTIES as [string, ...string[]], { message: 'Zorluk "kolay", "orta" veya "zor" olmalı' }) as z.ZodType<
    'kolay' | 'orta' | 'zor'
  >,
  instruments: z
    .array(instrumentSchema, { message: 'Enstrümanlar liste olmalı' })
    .min(1, 'En az 1 enstrüman seçin')
    .max(4, 'En fazla 4 enstrüman seçilebilir'),
  window_from: dateField('Pencere başlangıcı'),
  window_to: dateField('Pencere bitişi'),
  synthetic: z.boolean({ message: 'synthetic true/false olmalı' }).optional(),
};

const createSchema = z.object(scenarioFields);
const patchSchema = z
  .object({
    title: scenarioFields.title.optional(),
    // Gönderilmezse (undefined) dokunulmaz; null/"" → açıklama silinir
    description: z
      .string({ message: 'Açıklama metin olmalı' })
      .trim()
      .max(300, 'Açıklama en fazla 300 karakter olabilir')
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    briefing: scenarioFields.briefing.optional(),
    debrief: scenarioFields.debrief.optional(),
    difficulty: scenarioFields.difficulty.optional(),
    instruments: scenarioFields.instruments.optional(),
    window_from: scenarioFields.window_from.optional(),
    window_to: scenarioFields.window_to.optional(),
    synthetic: scenarioFields.synthetic,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Güncellenecek en az bir alan gönderin');
const publishSchema = z.object({ published: z.boolean({ message: 'published true/false olmalı' }) });

// ---------------------------------------------------------------------------
// Seriler
// ---------------------------------------------------------------------------

router.post(
  '/series/import',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(importSchema, req.body);
    const data = await SeriesService.import(input, requireUser(req).id);
    await AuditService.log(req, {
      action: 'scenario.series_import',
      targetType: 'historical_series',
      targetId: data.series_code,
      targetLabel: input.label,
      metadata: {
        currency: input.currency,
        source: input.source,
        license_note: input.license_note,
        format: input.csv !== undefined ? 'csv' : 'rows',
        imported: data.imported,
        points: data.points,
        rejected_rows: data.rejected_rows,
        replaced: data.replaced,
        from: data.from,
        to: data.to,
      },
    });
    res.status(201).json({ success: true, message: 'Seri içe aktarıldı', data });
  })
);

router.get(
  '/series',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { items: await SeriesService.list() } });
  })
);

router.get(
  '/series/:code/preview',
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(codeParams, req.params);
    const { limit, from, to } = parseOrThrow(previewQuery, req.query);
    res.json({ success: true, data: await SeriesService.preview(code, limit, { from, to }) });
  })
);

router.delete(
  '/series/:code',
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(codeParams, req.params);
    const data = await SeriesService.remove(code);
    await AuditService.log(req, {
      action: 'scenario.series_delete',
      targetType: 'historical_series',
      targetId: data.series_code,
      targetLabel: data.label,
      metadata: { points: data.points },
    });
    res.json({ success: true, message: 'Seri silindi', data });
  })
);

// ---------------------------------------------------------------------------
// Senaryolar
// ---------------------------------------------------------------------------

router.get(
  '/scenarios',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { items: await ScenarioService.adminList() } });
  })
);

router.get(
  '/scenarios/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    res.json({ success: true, data: await ScenarioService.adminGet(id) });
  })
);

router.post(
  '/scenarios',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createSchema, req.body);
    const data = await ScenarioService.create(input, requireUser(req).id);
    await AuditService.log(req, {
      action: 'scenario.create',
      targetType: 'scenario',
      targetId: data.id,
      targetLabel: data.title,
      metadata: {
        slug: data.slug,
        difficulty: data.difficulty,
        instruments: data.instruments,
        window_from: data.window_from,
        window_to: data.window_to,
        synthetic: data.synthetic,
      },
    });
    res.status(201).json({ success: true, message: 'Senaryo oluşturuldu', data });
  })
);

router.patch(
  '/scenarios/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const patch = parseOrThrow(patchSchema, req.body);
    const { after, changed } = await ScenarioService.update(id, patch);
    await AuditService.log(req, {
      action: 'scenario.update',
      targetType: 'scenario',
      targetId: id,
      targetLabel: after.title,
      metadata: { changed },
    });
    res.json({ success: true, message: 'Senaryo güncellendi', data: after });
  })
);

router.delete(
  '/scenarios/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const data = await ScenarioService.remove(id);
    await AuditService.log(req, {
      action: 'scenario.delete',
      targetType: 'scenario',
      targetId: id,
      targetLabel: data.title,
      metadata: { slug: data.slug, published: data.published, plays: data.plays },
    });
    res.json({ success: true, message: 'Senaryo silindi', data: { id } });
  })
);

router.post(
  '/scenarios/:id/publish',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParams, req.params);
    const { published } = parseOrThrow(publishSchema, req.body);
    const data = await ScenarioService.setPublished(id, published);
    await AuditService.log(req, {
      action: 'scenario.publish',
      targetType: 'scenario',
      targetId: id,
      targetLabel: data.title,
      metadata: { published },
    });
    res.json({ success: true, message: published ? 'Senaryo yayınlandı' : 'Senaryo yayından kaldırıldı', data });
  })
);

export default router;
