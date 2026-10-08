import express from 'express';
import { EmailService } from '../services/email';
import { authenticateToken, requireUser } from '../middleware/auth';
import {
  sendVerificationLimiter,
  sendResetLimiter,
  emailVerifyLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimits';
import { asyncHandler } from '../utils/errors';
import { parseOrThrow, verifyEmailSchema, sendResetSchema, resetPasswordSchema } from '../utils/validation';

const router = express.Router();
const emailService = new EmailService();

const send = (res: express.Response, r: { success: boolean; message: string; status?: number }) =>
  res.status(r.status ?? (r.success ? 200 : 400)).json({ success: r.success, message: r.message });

// Doğrulama kodu gönder — gövdedeki email YOK SAYILIR; kullanıcının kayıtlı emaili kullanılır
router.post(
  '/send-verification',
  sendVerificationLimiter,
  authenticateToken,
  asyncHandler(async (req, res) => {
    send(res, await emailService.sendVerificationCode(requireUser(req).id));
  })
);

// Doğrulama kodunu kontrol et (oturum gerekli) — body: { code }
router.post(
  '/verify',
  emailVerifyLimiter,
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { code } = parseOrThrow(verifyEmailSchema, req.body);
    send(res, await emailService.verifyCode(requireUser(req).id, code));
  })
);

// Şifre sıfırlama kodu iste — email kayıtlı olsun olmasın aynı yanıt
router.post(
  '/send-reset',
  sendResetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parseOrThrow(sendResetSchema, req.body);
    send(res, await emailService.requestPasswordReset(email));
  })
);

// Kodla şifre sıfırla — body: { email, code, newPassword }
router.post(
  '/reset-password',
  resetPasswordLimiter,
  asyncHandler(async (req, res) => {
    const { email, code, newPassword } = parseOrThrow(resetPasswordSchema, req.body);
    send(res, await emailService.resetPassword(email, code, newPassword));
  })
);

export default router;
