import express from 'express';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { leagueCodeLimiter } from '../middleware/rateLimits';
import { createRateLimiter } from '../infra/rateLimitStore';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';
import { AuditService } from '../services/audit';
import { PortfolioLeagueService } from '../services/portfolioLeagues/service';
import {
  createPortfolioLeagueSchema,
  noteSchema,
  plIdParamSchema,
  plRangeQuerySchema,
  plTradeSchema,
  plWeightsSchema,
  teamCodeSchema,
  teamNameSchema,
  updateRulesSchema,
} from '../services/portfolioLeagues/validation';

/**
 * /api/portfolio-leagues — Portföy Ligi (023). Tüm uçlar oturum ister; lig verisi yalnızca üyelere (diğerleri 404).
 * Lig katılımı / ayrılma / silme / davet kodu ana lig uçlarıyla (/api/leagues/...) aynıdır.
 *
 *   POST   /                          portföy ligi oluştur
 *   GET    /:id                       kurallar, dönem, benim durumum, takımlar
 *   PATCH  /:id/rules                 kurucu, yalnızca lig başlamadan
 *   GET    /:id/standings             sıralama
 *   GET    /:id/performance           ilk 5 + ben (100'e normalize) ve haftalık / aylık getiriler
 *   GET    /:id/strategies            strateji beyanları + değerlendirme notları + sonuçlar
 *   PUT    /:id/strategy              { text }  (lig başlayana kadar)
 *   PUT    /:id/reflection            { text }  (lig bittikten sonra)
 *   POST   /:id/teams                 { name }  takım kur
 *   POST   /:id/teams/join            { code }  takım koduyla katıl
 *   POST   /:id/teams/leave           takımdan ayrıl (lig başlamadan)
 *   GET    /:id/portfolio             portföyüm / takım portföyü (değerleme, metrikler, işlemler + yapan kişi)
 *   GET    /:id/portfolio/history     ?range=1W|1M|3M|ALL
 *   POST   /:id/portfolio/trades      { side, asset_type, symbol, amount_usd? | quantity? | all? }
 *   PUT    /:id/portfolio/weights     { weights[], cash_weight }  hedef ağırlıklara göre yeniden dengele
 *   POST   /:id/portfolio/weights/preview   aynı gövde, yalnızca plan
 */
const router = express.Router();

/** İşlem uçları: IP başına dakikada 60 */
const tradeLimiter = createRateLimiter('portfolio-league-trades', {
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Çok fazla işlem isteği. Lütfen biraz sonra tekrar deneyin.' },
});

router.use(authenticateToken);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createPortfolioLeagueSchema, req.body);
    const data = await PortfolioLeagueService.create(requireUser(req).id, input);
    res.status(201).json({ success: true, data });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    res.json({ success: true, data: await PortfolioLeagueService.detail(id, requireUser(req).id) });
  })
);

router.patch(
  '/:id/rules',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const input = parseOrThrow(updateRulesSchema, req.body);
    res.json({ success: true, data: await PortfolioLeagueService.updateRules(id, requireUser(req).id, input) });
  })
);

router.get(
  '/:id/standings',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    res.json({ success: true, data: await PortfolioLeagueService.standings(id, requireUser(req).id) });
  })
);

router.get(
  '/:id/performance',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    res.json({ success: true, data: await PortfolioLeagueService.performance(id, requireUser(req).id) });
  })
);

router.get(
  '/:id/strategies',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    res.json({ success: true, data: await PortfolioLeagueService.strategies(id, requireUser(req).id) });
  })
);

router.put(
  '/:id/strategy',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const { text } = parseOrThrow(noteSchema, req.body);
    res.json({ success: true, data: await PortfolioLeagueService.setStrategy(id, requireUser(req).id, text) });
  })
);

router.put(
  '/:id/reflection',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const { text } = parseOrThrow(noteSchema, req.body);
    res.json({ success: true, data: await PortfolioLeagueService.setReflection(id, requireUser(req).id, text) });
  })
);

router.post(
  '/:id/teams',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const { name } = parseOrThrow(teamNameSchema, req.body);
    res.status(201).json({ success: true, data: await PortfolioLeagueService.createTeam(id, requireUser(req).id, name) });
  })
);

router.post(
  '/:id/teams/join',
  leagueCodeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const { code } = parseOrThrow(teamCodeSchema, req.body);
    res.json({ success: true, data: await PortfolioLeagueService.joinTeam(id, requireUser(req).id, code) });
  })
);

router.post(
  '/:id/teams/leave',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    await PortfolioLeagueService.leaveTeam(id, requireUser(req).id);
    res.json({ success: true, data: { league_id: id, left: true } });
  })
);

router.get(
  '/:id/portfolio',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    res.json({ success: true, data: await PortfolioLeagueService.myPortfolio(id, requireUser(req).id) });
  })
);

router.get(
  '/:id/portfolio/history',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const { range } = parseOrThrow(plRangeQuerySchema, req.query);
    res.json({ success: true, data: await PortfolioLeagueService.myHistory(id, requireUser(req).id, range) });
  })
);

router.post(
  '/:id/portfolio/trades',
  tradeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const input = parseOrThrow(plTradeSchema, req.body);
    res.status(201).json({ success: true, data: await PortfolioLeagueService.trade(id, requireUser(req).id, input) });
  })
);

router.put(
  '/:id/portfolio/weights',
  tradeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const input = parseOrThrow(plWeightsSchema, req.body);
    res.json({ success: true, data: await PortfolioLeagueService.setWeights(id, requireUser(req).id, input, false) });
  })
);

router.post(
  '/:id/portfolio/weights/preview',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const input = parseOrThrow(plWeightsSchema, req.body);
    res.json({ success: true, data: await PortfolioLeagueService.setWeights(id, requireUser(req).id, input, true) });
  })
);

export default router;

/**
 * /api/admin/portfolio-leagues — yönetim paneli (authenticateToken + isAdmin).
 *   GET  /:id            kurallar, katılımcılar / takımlar, sonuçlar (ana ligde üye listesi)
 *   POST /:id/finalize   { reason? } devam eden portföy ligini şimdi bitir (denetim kaydı: league.finalize)
 */
export const adminPortfolioLeaguesRouter = express.Router();
adminPortfolioLeaguesRouter.use(authenticateToken, isAdmin);

adminPortfolioLeaguesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    res.json({ success: true, data: await PortfolioLeagueService.adminDetail(id) });
  })
);

adminPortfolioLeaguesRouter.post(
  '/:id/finalize',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(plIdParamSchema, req.params);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) || null : null;
    const result = await PortfolioLeagueService.adminFinalizeNow(id);
    await AuditService.log(req, {
      action: 'league.finalize',
      targetType: 'league',
      targetId: id,
      targetLabel: result.name,
      metadata: { reason, finalized: result.finalized },
    });
    res.json({ success: true, message: 'Lig bitirildi', data: result });
  })
);
