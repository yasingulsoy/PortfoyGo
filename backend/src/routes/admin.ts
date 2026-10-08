import express from 'express';
import { AdminService } from '../services/admin';
import { authenticateToken, requireUser } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, paginationSchema, banSchema, userIdParamSchema } from '../utils/validation';

const router = express.Router();

router.use(authenticateToken, isAdmin);

// Admin istatistikleri
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const result = await AdminService.getStats();
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'İstatistikler alınamadı' });
    }
    res.json(result);
  })
);

// Tüm kullanıcılar — ?limit=1..100&offset>=0
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseOrThrow(paginationSchema, req.query);
    const result = await AdminService.getAllUsers(limit, offset);
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Kullanıcılar alınamadı' });
    }
    res.json(result);
  })
);

// Kullanıcıyı banla / yasağı kaldır — body: { ban: boolean }
router.post(
  '/users/:userId/ban',
  asyncHandler(async (req, res) => {
    const { userId } = parseOrThrow(userIdParamSchema, req.params);
    const { ban } = parseOrThrow(banSchema, req.body);

    if (ban && userId === requireUser(req).id) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı yasaklayamazsınız' });
    }

    const result = await AdminService.toggleUserBan(userId, ban);
    if (!result.success) {
      return res.status(result.status ?? 400).json({ success: false, message: result.message || 'İşlem başarısız' });
    }
    res.json(result);
  })
);

export default router;
