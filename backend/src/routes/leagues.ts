import express from 'express';
import { createRateLimiter } from '../infra/rateLimitStore';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { leagueCodeLimiter } from '../middleware/rateLimits';
import { asyncHandler } from '../utils/errors';
import {
  createLeagueSchema,
  joinLeagueSchema,
  leagueFeedQuerySchema,
  leagueIdParamSchema,
  leagueMemberParamsSchema,
  parseOrThrow,
  previewLeagueQuerySchema,
  publicLeaguesQuerySchema,
  updateLeagueSchema,
} from '../utils/validation';
import { LeagueService } from '../services/leagues';

const router = express.Router();

/** Herkese açık lig listesi: IP başına dakikada 60 */
const publicLeaguesLimiter = createRateLimiter('leagues-public', {
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.' },
});

// Herkese açık ligler (oturum gerekmez; oturum varsa is_member dolu).
// ?search=&status=upcoming|active|finished|open (varsayılan open = upcoming + active)&limit=&offset=
router.get(
  '/public',
  publicLeaguesLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(publicLeaguesQuerySchema, req.query);
    const data = await LeagueService.listPublic({ ...q, userId: optionalUserId(req) });
    res.json({ success: true, data });
  })
);

// Diğer tüm lig uçları oturum gerektirir
router.use(authenticateToken);

// Liglerim
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await LeagueService.listMine(requireUser(req).id);
    res.json({ success: true, data });
  })
);

// Lig oluştur: {name, description?, visibility?, starts_at?, duration?, ends_at? (eski; duration öncelikli)}
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createLeagueSchema, req.body);
    const data = await LeagueService.create(requireUser(req).id, input);
    res.status(201).json({ success: true, data });
  })
);

// Davet kodu önizleme: ?code=XXXX-XXXX (büyük/küçük harf, boşluk ve tire önemsiz)
router.get(
  '/preview',
  leagueCodeLimiter,
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(previewLeagueQuerySchema, req.query);
    const data = await LeagueService.preview(requireUser(req).id, code);
    res.json({ success: true, data });
  })
);

// Davet koduyla katıl
router.post(
  '/join',
  leagueCodeLimiter,
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(joinLeagueSchema, req.body);
    const data = await LeagueService.join(requireUser(req).id, code);
    res.json({ success: true, data });
  })
);

// Lig detayı + sıralama (sadece üyeler; diğerleri 404)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    const data = await LeagueService.getDetail(id, requireUser(req).id);
    res.json({ success: true, data });
  })
);

// Lig güncelle (sadece sahip): {name?, description?, visibility?, starts_at?, duration?}
// starts_at / duration sadece lig başlamadan değiştirilebilir
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    const input = parseOrThrow(updateLeagueSchema, req.body);
    const data = await LeagueService.update(id, requireUser(req).id, input);
    res.json({ success: true, data });
  })
);

// Lig akışı: üyelerin lig başlangıcından (veya katılımdan) bu yana alım/satımları (tutarsız). Sadece üyeler.
router.get(
  '/:id/feed',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    const { limit } = parseOrThrow(leagueFeedQuerySchema, req.query);
    const data = await LeagueService.getFeed(id, requireUser(req).id, limit);
    res.json({ success: true, data });
  })
);

// Herkese açık lige katıl (davet kodu gerekmez; özel lig → 404)
router.post(
  '/:id/join-public',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    const data = await LeagueService.joinPublic(requireUser(req).id, id);
    res.json({ success: true, data });
  })
);

// Ligden ayrıl (sahip ayrılamaz)
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    await LeagueService.leave(id, requireUser(req).id);
    res.json({ success: true, data: { league_id: id, left: true } });
  })
);

// Yeni davet kodu (sadece sahip; eski kod geçersiz olur)
router.post(
  '/:id/invite-code',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    const invite_code = await LeagueService.regenerateInviteCode(id, requireUser(req).id);
    res.json({ success: true, data: { invite_code } });
  })
);

// Üye çıkar (sadece sahip; kendini çıkaramaz)
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    const { id, userId } = parseOrThrow(leagueMemberParamsSchema, req.params);
    await LeagueService.removeMember(id, requireUser(req).id, userId);
    res.json({ success: true, data: { league_id: id, user_id: userId, removed: true } });
  })
);

// Ligi sil (sadece sahip)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(leagueIdParamSchema, req.params);
    await LeagueService.remove(id, requireUser(req).id);
    res.json({ success: true, data: { league_id: id, deleted: true } });
  })
);

export default router;
