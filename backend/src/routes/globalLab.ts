import express from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { entitlementsOf, requireEntitlement } from '../middleware/entitlements';
import { createRateLimiter } from '../infra/rateLimitStore';
import { FEATURES } from '../services/subscriptions/config';
import { AssumptionService } from '../services/globalLab/assumptions';
import { CatalogService } from '../services/globalLab/catalog';
import { LabScenarioService } from '../services/globalLab/scenarios';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  BASE_CURRENCIES,
  DISCLAIMER,
  LIMITS,
  REGIONS,
  RISK_LEVEL_LABELS,
  TR_GLOBAL_MARKET_SHARE_PCT,
  VEHICLES,
  VEHICLE_LABELS,
} from '../services/globalLab/config';
import { assetClassField, regionField, savedScenarioSchema, scenarioInputSchema, symbolField, vehicleField } from '../services/globalLab/validation';
import { asyncHandler } from '../utils/errors';
import { idParamSchema, parseOrThrow } from '../utils/validation';

/**
 * Global Portföy Lab — /api/global-lab (oturum gerekli; çerezle gelen POST/PATCH/DELETE'te CSRF başlığı). Yanıtlar { success, data }.
 *
 * Ücretsiz:
 *   GET    /meta                       sınıflandırma sözlükleri, varsayım özeti (örnek), stres senaryosu listesi, sınırlar
 *   GET    /instruments                ?region&asset_class&vehicle&currency&risk_min&risk_max&q → { items, total }
 *   GET    /instruments/:symbol        → { instrument, notes, notes_locked, in_research_list }
 *                                         (notlar: Premium'da tam metin, ücretsizde yalnızca başlık)
 *   GET    /research-list              · POST /research-list {instrument_id} · DELETE /research-list/:id
 *   GET    /scenarios/example          salt okunur örnek senaryo + analiz
 *   GET    /scenarios                  kayıtlı senaryolar (Premium bitse de listelenir / silinebilir)
 *   DELETE /scenarios/:id
 * Premium (402 SUBSCRIPTION_REQUIRED):
 *   POST   /scenarios/analyze          ScenarioInput → Analysis
 *   POST   /scenarios                  {name, ...ScenarioInput} → { scenario, analysis }
 *   GET    /scenarios/:id              → { scenario, analysis, error }
 *   PATCH  /scenarios/:id              {name, ...ScenarioInput}
 *   POST   /scenarios/compare          {ids: 2..3} → items [{ scenario, analysis, error }]
 *
 * Tüm analizler eğitim amaçlıdır; varsayımlar örnektir (yanıtta `disclaimer`).
 */
const router = express.Router();
router.use(authenticateToken);

const analyzeLimiter = createRateLimiter('global-lab-analyze', {
  windowMs: 60 * 1000,
  limit: 30,
  message: { success: false, message: 'Çok fazla analiz isteği. Lütfen biraz sonra tekrar dene.' },
  keyGenerator: (req) => `u:${(req as express.Request & { user?: { id?: string } }).user?.id ?? 'anon'}`,
});

/** Boş → undefined; aksi halde alanın şemasıyla normalize edilir (hatalıysa 400) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const optional = <T extends z.ZodType<any, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((v, ctx): z.output<T> | undefined => {
      if (!v || !v.trim()) return undefined;
      const r = schema.safeParse(v);
      if (!r.success) {
        ctx.addIssue({ code: 'custom', message: r.error.issues[0]?.message ?? 'Geçersiz filtre' });
        return z.NEVER;
      }
      return r.data;
    });

const riskParam = z
  .string()
  .optional()
  .transform((v) => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : undefined;
  });

const listQuery = z.object({
  region: optional(regionField),
  asset_class: optional(assetClassField),
  vehicle: optional(vehicleField),
  currency: z
    .string()
    .optional()
    .transform((v) => (v && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined)),
  risk_min: riskParam,
  risk_max: riskParam,
  q: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().slice(0, 60) : undefined)),
});

const instrumentIdBody = z.object({ instrument_id: z.string({ message: 'Araç gerekli' }).trim().regex(/^[0-9a-fA-F-]{36}$/, 'Geçersiz araç ID') });
const instrumentIdParams = z.object({ instrumentId: z.string().trim().regex(/^[0-9a-fA-F-]{36}$/, 'Geçersiz araç ID') });
const compareSchema = z.object({
  ids: z
    .array(z.string().trim().regex(/^[0-9a-fA-F-]{36}$/, 'Geçersiz senaryo ID'), { message: 'ids liste olmalı' })
    .min(2, 'En az 2 senaryo seçin')
    .max(LIMITS.scenarioCompareMax, `En fazla ${LIMITS.scenarioCompareMax} senaryo karşılaştırılabilir`),
});

router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const snap = await AssumptionService.snapshot();
    res.json({
      success: true,
      data: {
        disclaimer: DISCLAIMER,
        regions: REGIONS,
        asset_classes: ASSET_CLASSES.map((id) => ({ id, label: ASSET_CLASS_LABELS[id] })),
        vehicles: VEHICLES.map((id) => ({ id, label: VEHICLE_LABELS[id] })),
        risk_levels: Object.entries(RISK_LEVEL_LABELS).map(([level, label]) => ({ level: Number(level), label })),
        base_currencies: BASE_CURRENCIES,
        limits: LIMITS,
        home_bias_reference_pct: TR_GLOBAL_MARKET_SHARE_PCT,
        assumptions: AssumptionService.publicView(snap),
      },
    });
  })
);

router.get(
  '/instruments',
  asyncHandler(async (req, res) => {
    const f = parseOrThrow(listQuery, req.query);
    const items = await CatalogService.list(f, { quotes: true });
    res.json({ success: true, data: { items, total: items.length } });
  })
);

router.get(
  '/instruments/:symbol',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const symbol = parseOrThrow(symbolField, req.params.symbol);
    const instrument = await CatalogService.getBySymbol(symbol);
    await CatalogService.attachQuotes([instrument]);
    const state = await entitlementsOf(req);
    const full = state.entitlements.includes(FEATURES.GLOBAL_LAB_NOTES);
    const [notes, inList] = await Promise.all([CatalogService.notes(instrument.id, full), CatalogService.inResearchList(user.id, instrument.id)]);
    res.json({ success: true, data: { instrument, notes, notes_locked: !full, in_research_list: inList, disclaimer: DISCLAIMER } });
  })
);

router.get(
  '/research-list',
  asyncHandler(async (req, res) => {
    const items = await CatalogService.researchList(requireUser(req).id);
    res.json({ success: true, data: { items, total: items.length, limit: LIMITS.researchListMax } });
  })
);

router.post(
  '/research-list',
  asyncHandler(async (req, res) => {
    const { instrument_id } = parseOrThrow(instrumentIdBody, req.body);
    await CatalogService.addToResearchList(requireUser(req).id, instrument_id);
    res.status(201).json({ success: true, message: 'Araştırma listesine eklendi' });
  })
);

router.delete(
  '/research-list/:instrumentId',
  asyncHandler(async (req, res) => {
    const { instrumentId } = parseOrThrow(instrumentIdParams, req.params);
    await CatalogService.removeFromResearchList(requireUser(req).id, instrumentId);
    res.json({ success: true, message: 'Araştırma listesinden çıkarıldı' });
  })
);

// ---------------------------------------------------------------------------
// Senaryolar
// ---------------------------------------------------------------------------

router.get(
  '/scenarios/example',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { ...(await LabScenarioService.example()), disclaimer: DISCLAIMER } });
  })
);

router.get(
  '/scenarios',
  asyncHandler(async (req, res) => {
    const items = await LabScenarioService.list(requireUser(req).id);
    res.json({ success: true, data: { items, total: items.length, limit: LIMITS.savedMax } });
  })
);

router.post(
  '/scenarios/analyze',
  requireEntitlement(FEATURES.GLOBAL_LAB_PRO),
  analyzeLimiter,
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(scenarioInputSchema, req.body);
    res.json({ success: true, data: { analysis: await LabScenarioService.analyze(input), disclaimer: DISCLAIMER } });
  })
);

router.post(
  '/scenarios/compare',
  requireEntitlement(FEATURES.GLOBAL_LAB_COMPARE),
  analyzeLimiter,
  asyncHandler(async (req, res) => {
    const { ids } = parseOrThrow(compareSchema, req.body);
    res.json({ success: true, data: { items: await LabScenarioService.compare(requireUser(req).id, ids), disclaimer: DISCLAIMER } });
  })
);

router.post(
  '/scenarios',
  requireEntitlement(FEATURES.GLOBAL_LAB_PRO),
  analyzeLimiter,
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(savedScenarioSchema, req.body);
    const scenario = await LabScenarioService.create(requireUser(req).id, input);
    res.status(201).json({ success: true, message: 'Senaryo kaydedildi', data: { ...(await LabScenarioService.withAnalysis(scenario)), disclaimer: DISCLAIMER } });
  })
);

router.get(
  '/scenarios/:id',
  requireEntitlement(FEATURES.GLOBAL_LAB_PRO),
  analyzeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const scenario = await LabScenarioService.get(requireUser(req).id, id);
    res.json({ success: true, data: { ...(await LabScenarioService.withAnalysis(scenario)), disclaimer: DISCLAIMER } });
  })
);

router.patch(
  '/scenarios/:id',
  requireEntitlement(FEATURES.GLOBAL_LAB_PRO),
  analyzeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const input = parseOrThrow(savedScenarioSchema, req.body);
    const scenario = await LabScenarioService.update(requireUser(req).id, id, input);
    res.json({ success: true, message: 'Senaryo güncellendi', data: { ...(await LabScenarioService.withAnalysis(scenario)), disclaimer: DISCLAIMER } });
  })
);

router.delete(
  '/scenarios/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    await LabScenarioService.remove(requireUser(req).id, id);
    res.json({ success: true, message: 'Senaryo silindi' });
  })
);

export default router;
