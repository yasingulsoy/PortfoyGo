import express from 'express';
import { z } from 'zod';
import pool from '../config/database';
import { AuthService } from '../services/auth';
import { setSessionCookies } from '../middleware/auth';
import { AppError, asyncHandler } from '../utils/errors';
import { parseOrThrow } from '../utils/validation';

/**
 * YALNIZCA YEREL GELİŞTİRME: e-posta/şifre girmeden tek tıkla giriş.
 *
 * Şu koşulların hepsi sağlanmadıkça uç 404 döner (yani yokmuş gibi davranır):
 *  - NODE_ENV !== 'production'
 *  - Veritabanı yerel makinede (localhost / 127.0.0.1) — ör. `npm run dev:local` ile gelen PGlite
 *  - DEV_LOGIN !== '0' (açıkça kapatmak için)
 * Uzak/canlı veritabanına bağlı bir sunucuda bu uç asla çalışmaz.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isDevLoginEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.DEV_LOGIN === '0') return false;
  let host = process.env.DB_HOST || '';
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      host = new URL(url).hostname;
    } catch {
      return false;
    }
  }
  return LOCAL_HOSTS.has(host);
}

const router = express.Router();

router.use((_req, _res, next) => {
  if (!isDevLoginEnabled()) return next(new AppError(404, 'Bulunamadı', 'NOT_FOUND'));
  next();
});

/** Hızlı girişte seçilebilecek yerel hesaplar */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const r = await pool.query(
      `SELECT username, email, is_admin, email_verified
         FROM users
        WHERE COALESCE(is_banned, false) = false
        ORDER BY is_admin DESC, email_verified DESC, created_at ASC
        LIMIT 12`
    );
    res.json({ success: true, data: { users: r.rows } });
  })
);

const devLoginSchema = z.object({ username: z.string().trim().min(1).max(50) });

/** Seçilen yerel hesapla oturum açar (normal girişle aynı httpOnly çerezler yazılır) */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Normal girişteki gibi: yalnızca JSON (tarayıcı preflight'ı → CORS allow-list)
    if (!req.is('application/json')) {
      return res.status(415).json({ success: false, message: 'İstek gövdesi application/json olmalı' });
    }
    const { username } = parseOrThrow(devLoginSchema, req.body);
    const r = await pool.query(
      `SELECT id, token_version, is_banned FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
    );
    const row = r.rows[0];
    if (!row || row.is_banned) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

    setSessionCookies(res, AuthService.signSessionToken(row.id, row.token_version));
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
    const user = await AuthService.getProfile(row.id);
    res.json({ success: true, user });
  })
);

export default router;
