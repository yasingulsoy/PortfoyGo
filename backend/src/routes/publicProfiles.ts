import express from 'express';
import { z } from 'zod';
import { authenticateToken, requireUser } from '../middleware/auth';
import { createRateLimiter } from '../infra/rateLimitStore';
import { PublicProfileService } from '../services/publicProfile';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * Herkese açık profiller ve görünürlük ayarı.
 *
 *  publicRouter  (/api/public)
 *    GET /users/:username          → PublicProfile (oturum gerekmez; yalnızca yüzdeler/sıralar)
 *                                     404 NOT_FOUND · 404 PROFILE_PRIVATE ("Bu profil gizli")
 *  meRouter      (/api/me)
 *    GET   /profile-visibility     → { profile_public, username }
 *    PATCH /profile-visibility     { profile_public: boolean } → aynı şekil (çerezle gelirse CSRF başlığı zorunlu)
 */

const usernameParams = z.object({
  username: z
    .string({ message: 'Kullanıcı adı gerekli' })
    .trim()
    .min(1, 'Kullanıcı adı gerekli')
    .max(50, 'Geçersiz kullanıcı adı')
    // Eski hesaplarda farklı karakterler olabilir; yalnızca boşluk ve yol/sorgu ayırıcıları reddedilir
    .regex(/^[^\s/\\?#%]+$/, 'Geçersiz kullanıcı adı'),
});

const visibilitySchema = z.strictObject(
  { profile_public: z.boolean({ message: 'profile_public true/false olmalı' }) },
  { error: 'Yalnızca "profile_public" (true/false) gönderin' }
);

/** Herkese açık profil: IP başına dakikada 120 (genel /api sınırına ek; site sunucu tarafında 30 sn önbellekler). */
const publicProfileLimiter = createRateLimiter('public-profile', {
  windowMs: 60_000,
  limit: 120,
  message: { success: false, message: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.' },
});

export const publicRouter = express.Router();

publicRouter.get(
  '/users/:username',
  publicProfileLimiter,
  asyncHandler(async (req, res) => {
    const { username } = parseOrThrow(usernameParams, req.params);
    const data = await PublicProfileService.get(username);
    // Herkese açık veri: kısa süre önbelleklenebilir (gizlilik değişikliği en geç bu süre sonra yansır)
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ success: true, data });
  })
);

export const meRouter = express.Router();

meRouter.get(
  '/profile-visibility',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await PublicProfileService.getVisibility(requireUser(req).id) });
  })
);

meRouter.patch(
  '/profile-visibility',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { profile_public } = parseOrThrow(visibilitySchema, req.body);
    res.json({ success: true, data: await PublicProfileService.setVisibility(requireUser(req).id, profile_public) });
  })
);
