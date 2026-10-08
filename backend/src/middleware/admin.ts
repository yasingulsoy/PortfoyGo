import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import pool from '../config/database';

/** authenticateToken'dan SONRA kullanılmalıdır. */
export const isAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Kimlik doğrulama gerekli',
      });
    }

    // Token'daki bilgiye değil, veritabanındaki güncel yetkiye bak
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
