import express from 'express';
import { z } from 'zod';
import { authenticateToken, optionalAuth, optionalUserId, requireUser } from '../middleware/auth';
import { CoachService } from '../services/coach/service';
import { ScenarioService } from '../services/scenarios/service';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Arena Koçu + Senaryo modu (herkese açık) — /api/arena altında İKİNCİ router (routes/arena.ts'ten sonra bağlanır).
 * Yanıtlar { success, data }.
 *
 *  GET /rounds/:id/coach        (oturum; yalnızca katılımcı; tur bitmiş olmalı → aksi 409 ROUND_NOT_FINISHED)
 *  GET /scenarios               (herkese açık; oturum varsa my_best_return_pct)   yalnızca yayındakiler
 *  GET /scenarios/:idOrSlug     (herkese açık; brifing; debrief yalnızca kullanıcı senaryoyu bitirdiyse)
 */

const router = express.Router();

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const roundParams = z.object({ id: z.string({ message: 'Tur ID gerekli' }).trim().regex(UUID_RE, 'Geçersiz tur ID') });
const scenarioParams = z.object({
  id: z
    .string({ message: 'Senaryo gerekli' })
    .trim()
    .min(1, 'Senaryo gerekli')
    .max(100, 'Geçersiz senaryo')
    .regex(/^[A-Za-z0-9-]+$/, 'Geçersiz senaryo'),
});

router.get(
  '/rounds/:id/coach',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(roundParams, req.params);
    res.json({ success: true, data: await CoachService.getReport(id, requireUser(req).id) });
  })
);

router.get(
  '/scenarios',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await ScenarioService.publicList(optionalUserId(req)) });
  })
);

router.get(
  '/scenarios/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(scenarioParams, req.params);
    res.json({ success: true, data: await ScenarioService.publicGet(id, optionalUserId(req)) });
  })
);

export default router;
