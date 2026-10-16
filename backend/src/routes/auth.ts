import express from 'express';
import { AuthService } from '../services/auth';
import {
  authenticateToken,
  requireUser,
  setSessionCookies,
  clearSessionCookies,
  hasCsrfHeader,
  SESSION_COOKIE,
} from '../middleware/auth';
import { loginLimiter, registerLimiter, twoFactorLoginLimiter } from '../middleware/rateLimits';
import { TwoFactorService } from '../services/security/twoFactor';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow, registerSchema, loginSchema, loginTwoFactorSchema } from '../utils/validation';
import { logAuthActivity as logActivity } from './authActivity';
import twoFactorRoutes from './twoFactor';

const router = express.Router();

// Kayıt
router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(registerSchema, req.body);
    const { status, ...result } = await AuthService.register(body);
    res.status(status).json(result);
  })
);

// Giriş — JWT gövdede DÖNMEZ; httpOnly `pg_session` çerezine yazılır (+ `pg_auth=1` ipucu çerezi).
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    // Login CSRF: HTML formları application/json gönderemez (JSON ise tarayıcı preflight yapar)
    if (!req.is('application/json')) {
      return res.status(415).json({ success: false, message: 'İstek gövdesi application/json olmalı' });
    }
    const body = parseOrThrow(loginSchema, req.body);
    const { status, token, ...result } = await AuthService.login(body);

    if (result.success && result.user && token) {
      setSessionCookies(res, token);
      logActivity(req, result.user.id, 'login', 'Kullanıcı giriş yaptı', { username: result.user.username });
    }
    // requires_2fa: çerez YOK; gövdede yalnızca { success, requires_2fa, challenge, message }
    if (result.requires_2fa) res.setHeader('Cache-Control', 'no-store');

    res.status(status).json(result);
  })
);

// Girişin ikinci adımı (2FA açık hesaplar): challenge + 6 haneli kod ya da kurtarma kodu → oturum çerezi
router.post(
  '/login/2fa',
  twoFactorLoginLimiter,
  asyncHandler(async (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ success: false, message: 'İstek gövdesi application/json olmalı' });
    }
    const body = parseOrThrow(loginTwoFactorSchema, req.body);
    const done = await TwoFactorService.completeLogin(body.challenge, { code: body.code, recovery_code: body.recovery_code });
    const session = await AuthService.finishLogin(done.userId, done.tokenVersion);
    if (!session) throw new AppError(401, 'Doğrulama süresi doldu. Lütfen yeniden giriş yap.', 'CHALLENGE_INVALID');

    setSessionCookies(res, session.token);
    logActivity(req, done.userId, 'login', 'Kullanıcı iki adımlı doğrulamayla giriş yaptı', {
      username: session.user.username,
      second_factor: done.method,
    });
    res.json({
      success: true,
      user: session.user,
      ...(done.method === 'recovery'
        ? {
            recovery_codes_remaining: done.recovery_remaining ?? 0,
            message: 'Kurtarma kodu kullanıldı. Kalan kodlarını Profil → Güvenlik bölümünden yenileyebilirsin.',
          }
        : {}),
    });
  })
);

// İki adımlı doğrulama yönetimi: /api/auth/2fa/* (bkz. routes/twoFactor.ts)
router.use('/2fa', twoFactorRoutes);

// Çıkış — bu tarayıcıdaki oturum çerezlerini siler. (Bearer token'lar durumsuzdur; iptal için /logout-all.)
router.post('/logout', (req, res) => {
  if (req.cookies?.[SESSION_COOKIE] && !hasCsrfHeader(req)) {
    return res.status(403).json({ success: false, message: 'İstek doğrulanamadı (CSRF koruması)' });
  }
  clearSessionCookies(res);
  res.json({ success: true, message: 'Çıkış yapıldı' });
});

// Tüm cihazlardan çıkış — token_version artırılır, kullanıcının verilmiş tüm oturumları geçersiz olur.
router.post(
  '/logout-all',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await AuthService.revokeAllSessions(user.id);
    clearSessionCookies(res);
    logActivity(req, user.id, 'logout', 'Tüm cihazlardan çıkış yapıldı', { all_sessions: true });
    res.json({ success: true, message: 'Tüm cihazlardaki oturumlar kapatıldı' });
  })
);

// Profil: veritabanından taze kullanıcı nesnesi (rank anlık hesaplanır)
router.get(
  '/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user = await AuthService.getProfile(requireUser(req).id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Oturum geçersiz veya süresi dolmuş' });
    }
    res.json({ success: true, user });
  })
);

// Token doğrulama
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ success: true, user: requireUser(req) });
});

export default router;
