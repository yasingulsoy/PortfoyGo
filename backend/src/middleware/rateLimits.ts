import type { Request } from 'express';
import { Options, ipKeyGenerator } from 'express-rate-limit';
import { autoLimiterName, createRateLimiter } from '../infra/rateLimitStore';

const MINUTE = 60 * 1000;

/**
 * Sayaçlar REDIS_URL tanımlıysa Redis'te (tüm API örnekleri ortak), değilse bellekte (örnek başına) tutulur;
 * bkz. infra/rateLimitStore.ts. Rota dosyalarında yeni sınırlayıcı: createRateLimiter('benzersiz-ad', {...}).
 */
const make = (windowMs: number, limit: number, message: string, extra: Partial<Options> = {}) =>
  createRateLimiter(autoLimiterName(windowMs, limit, message), {
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message },
    ...extra,
  });

/**
 * Tüm /api istekleri için genel sınır: IP başına dakikada 300 (API_RATE_LIMIT_PER_MIN ile değişir).
 * Yerel geliştirmede (dev:local) çok sekme + canlı akış + E2E tek IP'den geldiği için daha yüksek verilir.
 */
const GLOBAL_LIMIT_PER_MIN = (() => {
  const n = Number.parseInt(process.env.API_RATE_LIMIT_PER_MIN ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
})();
export const globalApiLimiter = make(MINUTE, GLOBAL_LIMIT_PER_MIN, 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.');

/** Giriş: IP başına 15 dakikada 10 deneme. */
export const loginLimiter = make(15 * MINUTE, 10, 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.');

/** Kayıt: IP başına saatte 5. */
export const registerLimiter = make(60 * MINUTE, 5, 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.');

/** Email gönderen endpoint'ler: IP başına saatte 5 (her endpoint'in kendi sayacı var). */
const emailSendMessage = 'Çok fazla email isteği. Lütfen daha sonra tekrar deneyin.';
export const sendVerificationLimiter = make(60 * MINUTE, 5, emailSendMessage);
export const sendResetLimiter = make(60 * MINUTE, 5, emailSendMessage);

/** Kod doğrulama: IP başına 15 dakikada 10 (her endpoint'in kendi sayacı var). */
const emailVerifyMessage = 'Çok fazla doğrulama denemesi. Lütfen 15 dakika sonra tekrar deneyin.';
export const emailVerifyLimiter = make(15 * MINUTE, 10, emailVerifyMessage);
export const resetPasswordLimiter = make(15 * MINUTE, 10, emailVerifyMessage);

/** Lig davet kodu (önizleme + katılma ortak sayaç): IP başına 15 dakikada 20 — kod tahminini engeller. */
export const leagueCodeLimiter = make(
  15 * MINUTE,
  20,
  'Çok fazla davet kodu denemesi. Lütfen 15 dakika sonra tekrar deneyin.'
);

/** Fiyat geçmişi / performans / sparkline (herkese açık, önbellekli): IP başına dakikada 120. */
export const marketDataLimiter = make(MINUTE, 120, 'Çok fazla piyasa verisi isteği. Lütfen biraz sonra tekrar deneyin.');

// ---------------------------------------------------------------------------
// Hesap güvenliği (2FA) ve KVKK self-servis uçları
// ---------------------------------------------------------------------------

/** Oturum açmış kullanıcıya göre sayaç (authenticateToken'dan SONRA kullanılmalı); yoksa IP. */
const perUserKey = (req: Request) => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  return userId ? `u:${userId}` : ipKeyGenerator(req.ip || '');
};

/**
 * 2FA girişinin ikinci adımı (POST /api/auth/login/2fa): IP başına 15 dakikada 10 deneme.
 * Ayrıca hesap başına kilit vardır (art arda 5 hatalı kod → 15 dk; bkz. services/security/twoFactor.ts).
 */
export const twoFactorLoginLimiter = make(
  15 * MINUTE,
  10,
  'Çok fazla doğrulama kodu denemesi. Lütfen 15 dakika sonra tekrar deneyin.'
);

/** 2FA kurulum / kapatma / kurtarma kodu yenileme: kullanıcı başına 15 dakikada 10. */
export const twoFactorManageLimiter = make(
  15 * MINUTE,
  10,
  'Çok fazla iki adımlı doğrulama isteği. Lütfen 15 dakika sonra tekrar deneyin.',
  { keyGenerator: perUserKey }
);

/** "Verilerimi indir" (GET /api/me/export): kullanıcı başına saatte 3. */
export const accountExportLimiter = make(
  60 * MINUTE,
  3,
  'Verilerini saatte en fazla 3 kez indirebilirsin. Lütfen daha sonra tekrar dene.',
  { keyGenerator: perUserKey }
);

/** "Hesabımı sil" (POST /api/me/delete): kullanıcı başına 15 dakikada 5 (şifre tahminini engeller). */
export const accountDeleteLimiter = make(
  15 * MINUTE,
  5,
  'Çok fazla hesap silme denemesi. Lütfen 15 dakika sonra tekrar dene.',
  { keyGenerator: perUserKey }
);
