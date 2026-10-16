import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import pool from '../config/database';
import { isAdmin2faRequired } from '../config/env';

/**
 * authenticateToken'dan SONRA kullanılmalıdır.
 *
 * ADMIN_REQUIRE_2FA açıkken (production'da varsayılan) iki adımlı doğrulaması kapalı yöneticiler
 * 403 `ADMIN_2FA_REQUIRED` alır; yönetim paneli bu kodda kullanıcıyı sitedeki Profil → Güvenlik
 * kartına yönlendirir. (Yerel hızlı giriş 2FA'yı atlar ama zorunluluk yerelde varsayılan olarak kapalıdır.)
 */
export const isAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Kimlik doğrulama gerekli',
      });
    }

    // Token'daki bilgiye değil, veritabanındaki güncel yetkiye bak
    const result = await pool.query('SELECT is_admin, totp_enabled_at FROM users WHERE id = $1', [req.user.id]);

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli',
      });
    }

    if (isAdmin2faRequired() && !result.rows[0].totp_enabled_at) {
      return res.status(403).json({
        success: false,
        code: 'ADMIN_2FA_REQUIRED',
        message:
          'Yönetim paneli için iki adımlı doğrulama zorunludur. Sitede Profil → Güvenlik bölümünden etkinleştirip tekrar deneyin.',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
