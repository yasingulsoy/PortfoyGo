import express from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { AuditService } from '../services/audit';
import { AssumptionService } from '../services/globalLab/assumptions';
import { CatalogService } from '../services/globalLab/catalog';
import { CsvFormatError, parseInstrumentCsv, parseNotesCsv } from '../services/globalLab/csv';
import {
  assumptionsUpdateSchema,
  correlationsUpdateSchema,
  instrumentInputSchema,
  instrumentPatchSchema,
  noteInputSchema,
  notePatchSchema,
  stressIdField,
  stressUpsertSchema,
} from '../services/globalLab/validation';
import { AppError, asyncHandler } from '../utils/errors';
import { idParamSchema, parseOrThrow } from '../utils/validation';

/**
 * Yönetici: Global Portföy Lab — /api/admin/global-lab (authenticateToken + isAdmin). Yanıtlar { success, data }.
 *
 * Katalog
 *   GET    /instruments                      tümü (pasifler dahil, not sayısıyla)
 *   POST   /instruments                      InstrumentInput → 201
 *   PATCH  /instruments/:id                  kısmi
 *   DELETE /instruments/:id                  (notlar / araştırma listeleri CASCADE)
 *   POST   /instruments/import?dry_run=1     Content-Type: text/csv, gövde = CSV (≤ 1 MB, ≤ 2000 satır)
 *                                            → { total, valid, created[], updated[], unchanged[], errors[], duplicates, dry_run }
 *   GET    /instruments/export               → { filename, csv }
 * Araştırma notları
 *   GET    /notes?instrument_id&limit&offset · POST /notes · PATCH /notes/:id · DELETE /notes/:id
 *   POST   /notes/import?dry_run=1 (text/csv: symbol,title,body) · GET /notes/export
 * Varsayımlar ve stres senaryoları
 *   GET    /assumptions                      → { assumptions, keys, correlations, min_eigenvalue, psd_adjusted, stress }
 *   PUT    /assumptions                      { rows: [{key, expected_return_pct, volatility_pct, source, as_of, note}] }
 *   PUT    /assumptions/correlations         { pairs: [{key_a, key_b, rho}] }
 *   PUT    /stress/:id                       ekle / güncelle · DELETE /stress/:id
 *
 * Denetim kaydı: global_lab.instrument_create | instrument_update | instrument_delete | instruments_import,
 * global_lab.note_create | note_update | note_delete | notes_import, global_lab.assumptions_update,
 * global_lab.correlations_update, global_lab.stress_upsert | stress_delete.
 */
const router = express.Router();
router.use(authenticateToken, isAdmin);

/** CSV gövdesi: genel JSON ayrıştırıcı text/csv'ye dokunmaz; burada (yetki kontrolünden SONRA) okunur. */
const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '1mb' });

function csvText(req: express.Request): string {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object' && typeof (req.body as { csv?: unknown }).csv === 'string') return (req.body as { csv: string }).csv;
  throw new AppError(400, 'CSV gövdesi bulunamadı (Content-Type: text/csv)', 'VALIDATION_ERROR');
}

const dryRunOf = (req: express.Request) => ['1', 'true', 'evet'].includes(String(req.query.dry_run ?? '').toLowerCase());

function wrapCsv<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof CsvFormatError) throw new AppError(400, err.message, `CSV_${err.code}`);
    throw err;
  }
}

const notesQuery = z.object({
  instrument_id: z
    .string()
    .optional()
    .transform((v) => (v && /^[0-9a-fA-F-]{36}$/.test(v.trim()) ? v.trim() : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(100, Math.max(1, parseInt(String(v ?? '50'), 10) || 50))),
  offset: z
    .string()
    .optional()
    .transform((v) => Math.max(0, parseInt(String(v ?? '0'), 10) || 0)),
});

const stamp = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

router.get(
  '/instruments',
  asyncHandler(async (_req, res) => {
    const items = await CatalogService.list({ include_inactive: true });
    res.json({ success: true, data: { items, total: items.length } });
  })
);

router.get(
  '/instruments/export',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { filename: `global-lab-katalog-${stamp()}.csv`, csv: await CatalogService.exportCsv() } });
  })
);

router.post(
  '/instruments/import',
  csvBody,
  asyncHandler(async (req, res) => {
    const dryRun = dryRunOf(req);
    const parsed = wrapCsv(() => parseInstrumentCsv(csvText(req)));
    const result = await CatalogService.importRows(parsed.rows, dryRun, parsed.columns);
    if (!dryRun && (result.created.length > 0 || result.updated.length > 0)) {
      await AuditService.log(req, {
        action: 'global_lab.instruments_import',
        targetType: 'global_instrument',
        targetLabel: `${result.created.length} yeni, ${result.updated.length} güncellendi`,
        metadata: { created: result.created.slice(0, 200), updated: result.updated.slice(0, 200), errors: parsed.errors.length, total: parsed.total },
      });
    }
    res.json({
      success: true,
      data: { total: parsed.total, valid: parsed.rows.length, duplicates: parsed.duplicates, errors: parsed.errors.slice(0, 100), error_count: parsed.errors.length, ...result, dry_run: dryRun },
    });
  })
);

router.post(
  '/instruments',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(instrumentInputSchema, req.body);
    const item = await CatalogService.create(input);
    await AuditService.log(req, { action: 'global_lab.instrument_create', targetType: 'global_instrument', targetId: item.id, targetLabel: item.symbol });
    res.status(201).json({ success: true, message: 'Araç eklendi', data: item });
  })
);

router.patch(
  '/instruments/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(instrumentPatchSchema, req.body);
    // Kısmi güncellemede gönderilmeyen alanlara şemanın varsayılanları yazılmasın (ör. active → true)
    const sent = new Set(Object.keys((req.body ?? {}) as object));
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => sent.has(k)));
    const item = await CatalogService.update(id, clean);
    await AuditService.log(req, {
      action: 'global_lab.instrument_update',
      targetType: 'global_instrument',
      targetId: item.id,
      targetLabel: item.symbol,
      metadata: { fields: Object.keys(clean) },
    });
    res.json({ success: true, message: 'Araç güncellendi', data: item });
  })
);

router.delete(
  '/instruments/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const item = await CatalogService.remove(id);
    await AuditService.log(req, { action: 'global_lab.instrument_delete', targetType: 'global_instrument', targetId: item.id, targetLabel: item.symbol });
    res.json({ success: true, message: 'Araç silindi' });
  })
);

// ---------------------------------------------------------------------------
// Araştırma notları
// ---------------------------------------------------------------------------

router.get(
  '/notes',
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(notesQuery, req.query);
    res.json({ success: true, data: await CatalogService.adminNotes(q) });
  })
);

router.get(
  '/notes/export',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { filename: `global-lab-notlar-${stamp()}.csv`, csv: await CatalogService.exportNotesCsv() } });
  })
);

router.post(
  '/notes/import',
  csvBody,
  asyncHandler(async (req, res) => {
    const dryRun = dryRunOf(req);
    const parsed = wrapCsv(() => parseNotesCsv(csvText(req)));
    const result = await CatalogService.importNotes(requireUser(req).id, parsed.rows, dryRun);
    if (!dryRun && (result.created > 0 || result.updated > 0)) {
      await AuditService.log(req, {
        action: 'global_lab.notes_import',
        targetType: 'global_research_note',
        targetLabel: `${result.created} yeni, ${result.updated} güncellendi`,
        metadata: { ...result, errors: parsed.errors.length, total: parsed.total },
      });
    }
    res.json({
      success: true,
      data: { total: parsed.total, valid: parsed.rows.length, duplicates: parsed.duplicates, errors: parsed.errors.slice(0, 100), error_count: parsed.errors.length, ...result, dry_run: dryRun },
    });
  })
);

router.post(
  '/notes',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(noteInputSchema, req.body);
    const note = await CatalogService.createNote(requireUser(req).id, input);
    await AuditService.log(req, { action: 'global_lab.note_create', targetType: 'global_research_note', targetId: note.id, targetLabel: `${note.symbol}: ${note.title}` });
    res.status(201).json({ success: true, message: 'Not eklendi', data: note });
  })
);

router.patch(
  '/notes/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const patch = parseOrThrow(notePatchSchema, req.body);
    const note = await CatalogService.updateNote(id, patch);
    await AuditService.log(req, { action: 'global_lab.note_update', targetType: 'global_research_note', targetId: note.id, targetLabel: `${note.symbol}: ${note.title}` });
    res.json({ success: true, message: 'Not güncellendi', data: note });
  })
);

router.delete(
  '/notes/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const note = await CatalogService.deleteNote(id);
    await AuditService.log(req, { action: 'global_lab.note_delete', targetType: 'global_research_note', targetId: note.id, targetLabel: `${note.symbol}: ${note.title}` });
    res.json({ success: true, message: 'Not silindi' });
  })
);

// ---------------------------------------------------------------------------
// Varsayımlar ve stres senaryoları
// ---------------------------------------------------------------------------

router.get(
  '/assumptions',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await AssumptionService.adminView() });
  })
);

router.put(
  '/assumptions',
  asyncHandler(async (req, res) => {
    const { rows } = parseOrThrow(assumptionsUpdateSchema, req.body);
    const updated = await AssumptionService.updateAssumptions(requireUser(req).id, rows);
    await AuditService.log(req, {
      action: 'global_lab.assumptions_update',
      targetType: 'global_assumption',
      targetLabel: `${updated} varsayım`,
      metadata: { keys: rows.map((r) => r.key).slice(0, 100) },
    });
    res.json({ success: true, message: 'Varsayımlar güncellendi', data: await AssumptionService.adminView() });
  })
);

router.put(
  '/assumptions/correlations',
  asyncHandler(async (req, res) => {
    const { pairs } = parseOrThrow(correlationsUpdateSchema, req.body);
    const result = await AssumptionService.updateCorrelations(requireUser(req).id, pairs);
    await AuditService.log(req, {
      action: 'global_lab.correlations_update',
      targetType: 'global_assumption',
      targetLabel: `${result.updated} korelasyon`,
      metadata: { pairs: pairs.slice(0, 50), min_eigenvalue: result.min_eigenvalue },
    });
    res.json({ success: true, message: 'Korelasyonlar güncellendi', data: await AssumptionService.adminView() });
  })
);

router.put(
  '/stress/:id',
  asyncHandler(async (req, res) => {
    const id = parseOrThrow(stressIdField, req.params.id);
    const input = parseOrThrow(stressUpsertSchema, req.body);
    const result = await AssumptionService.upsertStress(requireUser(req).id, id, input);
    await AuditService.log(req, {
      action: 'global_lab.stress_upsert',
      targetType: 'global_stress_scenario',
      targetId: id,
      targetLabel: input.name,
      metadata: { created: result.created },
    });
    res.status(result.created ? 201 : 200).json({ success: true, message: result.created ? 'Stres senaryosu eklendi' : 'Stres senaryosu güncellendi', data: result.stress });
  })
);

router.delete(
  '/stress/:id',
  asyncHandler(async (req, res) => {
    const id = parseOrThrow(stressIdField, req.params.id);
    const removed = await AssumptionService.deleteStress(id);
    await AuditService.log(req, { action: 'global_lab.stress_delete', targetType: 'global_stress_scenario', targetId: id, targetLabel: removed.name });
    res.json({ success: true, message: 'Stres senaryosu silindi' });
  })
);

export default router;
