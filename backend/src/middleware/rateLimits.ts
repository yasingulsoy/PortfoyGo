import rateLimit, { Options } from 'express-rate-limit';

const MINUTE = 60 * 1000;

const make = (windowMs: number, limit: number, message: string, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message },
    ...extra,
  });

/** Tüm /api istekleri için genel sınır (IP başına dakikada 300). */
export const globalApiLimiter = make(MINUTE, 300, 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.');

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
