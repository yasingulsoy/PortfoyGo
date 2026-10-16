import express from 'express';
import { authenticateToken, clearSessionCookies, requireUser } from '../middleware/auth';
import { accountDeleteLimiter, accountExportLimiter } from '../middleware/rateLimits';
import { AccountExportService } from '../services/account/export';
import { AccountDeletionService } from '../services/account/delete';
import { asyncHandler } from '../utils/errors';
import { deleteAccountSchema, parseOrThrow } from '../utils/validation';
import { logAuthActivity } from './authActivity';

/**
 * /api/me — KVKK self-servis uçları (oturum gerekli; çerezle gelen POST'larda CSRF başlığı zorunlu).
 *
 *   GET  /export → kişisel verilerin JSON kopyası (dosya olarak indirilir). Kullanıcı başına saatte 3.
 *   POST /delete {password, totp?, confirm_username?} → hesabı anonimleştirir ve tüm oturumları kapatır.
 *
 * Not: authenticateToken her uçta ayrı uygulanır (router genelinde değil) — /api/me altına başka
 * modüllerin eklediği uçlar bu router'dan etkilenmez.
 */
const router = express.Router();

router.get(
  '/export',
  authenticateToken,
  accountExportLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const data = await AccountExportService.build(user.id);
    const date = new Date().toISOString().slice(0, 10);
    logAuthActivity(req, user.id, 'data_export', 'Kişisel veriler indirildi');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="portfoygo-verilerim-${date}.json"`);
    res.send(JSON.stringify(data, null, 2));
  })
);

router.post(
  '/delete',
  authenticateToken,
  accountDeleteLimiter,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const body = parseOrThrow(deleteAccountSchema, req.body);
    await AccountDeletionService.deleteAccount(user.id, {
      password: body.password,
      totp: body.totp ?? null,
      confirm_username: body.confirm_username ?? null,
    });
    clearSessionCookies(res);
    res.json({ success: true, message: 'Hesabın silindi. Kişisel verilerin kaldırıldı ve tüm oturumların kapatıldı.' });
  })
);

export default router;
