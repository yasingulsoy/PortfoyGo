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
import { loginLimiter, registerLimiter } from '../middleware/rateLimits';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, registerSchema, loginSchema } from '../utils/validation';

const router = express.Router();

/** Aktivite kaydını yanıtı geciktirmeden arka planda yazar. */
function logActivity(req: express.Request, userId: string, activity_type: string, description: string, metadata?: Record<string, unknown>) {
  setImmediate(async () => {
    try {
      const { ActivityLogService } = await import('../services/activityLog');
      await ActivityLogService.createLog({
        user_id: userId,
        activity_type,
        description,
        metadata,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']?.slice(0, 500),
      });
    } catch (error: any) {
      console.error('[auth] Activity log error:', error?.message);
    }
  });
}

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

    res.status(status).json(result);
  })
);

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
