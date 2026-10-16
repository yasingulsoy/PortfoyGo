import express from 'express';
import { authenticateToken, requireUser, setSessionCookies } from '../middleware/auth';
import { twoFactorManageLimiter } from '../middleware/rateLimits';
import { AuthService } from '../services/auth';
import { NotificationService } from '../services/notifications';
import { TwoFactorService } from '../services/security/twoFactor';
import { asyncHandler } from '../utils/errors';
import {
  parseOrThrow,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  twoFactorRecoveryRegenSchema,
} from '../utils/validation';
import { logAuthActivity } from './authActivity';

/**
 * /api/auth/2fa — iki adımlı doğrulama yönetimi (oturum gerekli; çerezle gelen POST'larda CSRF başlığı zorunlu).
 *
 *   GET  /status            → { enabled, enabled_at, recovery_codes_remaining, available, admin_required }
 *   POST /setup             → { otpauth_url, qr_svg, manual_key, secret_masked, expires_at } (15 dk geçerli)
 *   POST /enable  {code}    → { recovery_codes } (yalnızca bu yanıtta) — diğer oturumlar kapanır, bu oturumun çerezi yenilenir
 *   POST /disable {password, code}       → code: TOTP ya da kurtarma kodu
 *   POST /recovery-codes {code}          → yeni kurtarma kodları (eskiler geçersiz)
 *
 * Girişin ikinci adımı (POST /api/auth/login/2fa) routes/auth.ts içindedir.
 */
const router = express.Router();

router.use(authenticateToken);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await TwoFactorService.status(requireUser(req).id) });
  })
);

router.post(
  '/setup',
  twoFactorManageLimiter,
  asyncHandler(async (req, res) => {
    const data = await TwoFactorService.setup(requireUser(req).id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data });
  })
);

router.post(
  '/enable',
  twoFactorManageLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { code } = parseOrThrow(twoFactorEnableSchema, req.body);
    const result = await TwoFactorService.enable(user.id, code);
    // token_version arttı: diğer tüm oturumlar kapandı; bu tarayıcının oturumu yeni token'la sürer
    setSessionCookies(res, AuthService.signSessionToken(user.id, result.token_version));
    logAuthActivity(req, user.id, 'two_factor_enabled', 'İki adımlı doğrulama açıldı');
    void NotificationService.notify(user.id, {
      type: 'security.2fa_enabled',
      category: 'account',
      title: 'İki adımlı doğrulama açıldı',
      body: 'Hesabın artık girişte doğrulama kodu istiyor. Diğer cihazlardaki oturumların kapatıldı.',
      link: '/profile#guvenlik',
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, message: 'İki adımlı doğrulama açıldı', data: { recovery_codes: result.recovery_codes } });
  })
);

router.post(
  '/disable',
  twoFactorManageLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { password, code } = parseOrThrow(twoFactorDisableSchema, req.body);
    await TwoFactorService.disable(user.id, password, code);
    logAuthActivity(req, user.id, 'two_factor_disabled', 'İki adımlı doğrulama kapatıldı');
    void NotificationService.notify(user.id, {
      type: 'security.2fa_disabled',
      category: 'account',
      title: 'İki adımlı doğrulama kapatıldı',
      body: 'Bu işlemi sen yapmadıysan hemen şifreni değiştir ve tüm cihazlardan çıkış yap.',
      link: '/profile#guvenlik',
    });
    res.json({ success: true, message: 'İki adımlı doğrulama kapatıldı' });
  })
);

router.post(
  '/recovery-codes',
  twoFactorManageLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { code } = parseOrThrow(twoFactorRecoveryRegenSchema, req.body);
    const codes = await TwoFactorService.regenerateRecoveryCodes(user.id, code);
    logAuthActivity(req, user.id, 'recovery_codes_regenerated', 'Yeni kurtarma kodları oluşturuldu');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, message: 'Yeni kurtarma kodları oluşturuldu', data: { recovery_codes: codes } });
  })
);

export default router;
