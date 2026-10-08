import express from 'express';
import { AuthService } from '../services/auth';
import { authenticateToken, requireUser } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimits';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, registerSchema, loginSchema } from '../utils/validation';

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

// Giriş
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(loginSchema, req.body);
    const { status, ...result } = await AuthService.login(body);

    if (result.success && result.user) {
      const user = result.user;
      setImmediate(async () => {
        try {
          const { ActivityLogService } = await import('../services/activityLog');
          await ActivityLogService.createLog({
            user_id: user.id,
            activity_type: 'login',
            description: 'Kullanıcı giriş yaptı',
            metadata: { username: user.username },
            ip_address: req.ip,
            user_agent: req.headers['user-agent']?.slice(0, 500),
          });
        } catch (error: any) {
          console.error('[auth] Activity log error:', error?.message);
        }
      });
    }

    res.status(status).json(result);
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
