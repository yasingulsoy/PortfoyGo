import { Request, Response, NextFunction, CookieOptions } from 'express';
import { AuthService } from '../services/auth';
import { isProduction } from '../config/env';
import { User } from '../types';

/**
 * Kimlik doğrulama — iki yol desteklenir:
 *
 * 1) Çerez (tarayıcı): `pg_session` httpOnly çerezi (giriş yanıtında set edilir).
 *    Çerezle doğrulanan POST/PUT/PATCH/DELETE isteklerinde CSRF koruması olarak
 *    `X-Requested-With: PortfoyGo` başlığı ZORUNLUDUR (özel başlık CORS preflight'ı tetikler,
 *    preflight da ALLOWED_ORIGINS listesiyle korunur). Başlık yoksa 403 döner.
 * 2) `Authorization: Bearer <jwt>` (script / test). Bu istekler CSRF kontrolünden muaftır
 *    (tarayıcı bu başlığı başka bir siteden kendiliğinden eklemez). Token, giriş yanıtındaki
 *    `pg_session` Set-Cookie değerinden alınabilir.
 *
 * Çerez varsa önce o kullanılır; yoksa Bearer başlığına bakılır.
 * JWT'deki `tv`, users.token_version ile eşleşmezse oturum iptal edilmiş sayılır (401).
 */

export const SESSION_COOKIE = 'pg_session';
/** httpOnly OLMAYAN, hassas bilgi içermeyen ipucu çerezi: Next proxy'si (route koruması) okur. */
export const AUTH_HINT_COOKIE = 'pg_auth';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'PortfoyGo';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // JWT süresiyle aynı (7 gün)
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AuthenticatedRequest extends Request {
  user?: User;
}

function baseCookieOptions(): CookieOptions {
  const flag = (process.env.COOKIE_SECURE || '').trim().toLowerCase();
  const domain = (process.env.COOKIE_DOMAIN || '').trim();
  return {
    secure: isProduction() || flag === '1' || flag === 'true',
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

/** Oturum çerezini (httpOnly) ve route koruması için ipucu çerezini yazar. */
export function setSessionCookies(res: Response, token: string): void {
  const base = baseCookieOptions();
  res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true, maxAge: SESSION_MAX_AGE_MS });
  res.cookie(AUTH_HINT_COOKIE, '1', { ...base, httpOnly: false, maxAge: SESSION_MAX_AGE_MS });
}

/** Oturum çerezlerini siler (aynı path/domain ile). */
export function clearSessionCookies(res: Response): void {
  const base = baseCookieOptions();
  res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(AUTH_HINT_COOKIE, { ...base, httpOnly: false });
}

/** Çerezle gelen durum değiştiren isteklerde CSRF başlığı var mı? */
export function hasCsrfHeader(req: Request): boolean {
  return req.get(CSRF_HEADER) === CSRF_HEADER_VALUE;
}

function readSessionCookie(req: Request): string | undefined {
  const value = (req as Request & { cookies?: Record<string, unknown> }).cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBearer(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  const [scheme, token] = typeof authHeader === 'string' ? authHeader.split(' ') : [];
  return token && scheme?.toLowerCase() === 'bearer' ? token : undefined;
}

/** Route içinde kimliği doğrulanmış kullanıcıyı (authenticateToken sonrası) döndürür. */
export function requireUser(req: Request): User {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    // authenticateToken middleware'i olmadan çağrılırsa
    throw new Error('requireUser called without authenticateToken');
  }
  return user;
}

/**
 * İsteğe bağlı kimlik doğrulama: geçerli bir oturum (çerez veya Bearer) varsa `req.user` doldurulur,
 * yoksa / geçersizse istek anonim olarak devam eder (401 dönmez). Herkese açık ama oturum açmış
 * kullanıcıya ek bilgi gösteren uçlar içindir (ör. GET /api/seasons/current → `me`).
 * CSRF kuralı yine uygulanır: çerezle gelen durum değiştiren isteklerde başlık yoksa 403.
 */
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const cookieToken = readSessionCookie(req);
  const token = cookieToken ?? readBearer(req);
  if (!token) return next();

  if (cookieToken && STATE_CHANGING.has(req.method) && !hasCsrfHeader(req)) {
    return res.status(403).json({
      success: false,
      message: 'İstek doğrulanamadı (CSRF koruması)',
    });
  }

  try {
    const user = await AuthService.verifyToken(token);
    if (user) req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** optionalAuth sonrası: oturum varsa kullanıcı ID'si, yoksa undefined. */
export function optionalUserId(req: Request): string | undefined {
  return (req as AuthenticatedRequest).user?.id;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const cookieToken = readSessionCookie(req);
  const token = cookieToken ?? readBearer(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Oturum açmanız gerekiyor',
    });
  }

  // CSRF: çerezle doğrulanan durum değiştiren isteklerde özel başlık zorunlu
  if (cookieToken && STATE_CHANGING.has(req.method) && !hasCsrfHeader(req)) {
    return res.status(403).json({
      success: false,
      message: 'İstek doğrulanamadı (CSRF koruması)',
    });
  }

  try {
    const user = await AuthService.verifyToken(token);
    if (!user) {
      // Geçersiz/iptal edilmiş oturum çerezi: tarayıcıdaki çerezleri de temizle (ipucu çerezi dahil)
      if (cookieToken) clearSessionCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Oturum geçersiz veya süresi dolmuş',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
