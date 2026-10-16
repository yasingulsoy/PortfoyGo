import crypto from 'crypto';
import { getJwtSecret, isProduction, parseTotpEncKey } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Hesap güvenliği için anahtar yönetimi ve şifreleme yardımcıları.
 *
 * Ana anahtar: TOTP_ENC_KEY (32 bayt; 64 hex karakter veya base64). Production'da ZORUNLU — yoksa
 * getMasterKey() null döner ve iki adımlı doğrulama kurulamaz / 2FA'lı girişler tamamlanamaz (fail-closed).
 * Production dışında (yerel geliştirme, testler) anahtar yoksa JWT_SECRET'tan deterministik bir
 * GELİŞTİRME anahtarı türetilir; canlıda asla kullanılmaz.
 *
 * Ana anahtardan HKDF-SHA256 ile amaç başına ayrı alt anahtarlar türetilir:
 *  - totp-secret: TOTP gizli anahtarlarının AES-256-GCM şifrelemesi (kullanıcı kimliği AAD olarak bağlanır:
 *    bir satırdaki şifreli anahtar başka bir kullanıcının satırına kopyalanırsa çözülemez)
 *  - recovery-code: kurtarma kodlarının HMAC-SHA256 özeti (veritabanı tek başına sızsa da kodlar
 *    çevrimdışı denenemez)
 *
 * ⚠️ Anahtar değiştirilirse mevcut 2FA kayıtları çözülemez; kullanıcıların 2FA'yı yeniden kurması gerekir.
 */

const DEV_KEY_LABEL = 'portfoygo-dev-only-totp-key:v1:';
let warnedDevKey = false;

export type KeySource = 'env' | 'dev' | 'missing';

export function keySource(): KeySource {
  if (parseTotpEncKey(process.env.TOTP_ENC_KEY)) return 'env';
  return isProduction() ? 'missing' : 'dev';
}

/** Ana anahtar; production'da TOTP_ENC_KEY yoksa / geçersizse null. */
export function getMasterKey(): Buffer | null {
  const fromEnv = parseTotpEncKey(process.env.TOTP_ENC_KEY);
  if (fromEnv) return fromEnv;
  if (isProduction()) return null;
  if (!warnedDevKey) {
    warnedDevKey = true;
    logger.warn('[security] TOTP_ENC_KEY tanımlı değil: yalnızca geliştirme için türetilmiş anahtar kullanılıyor');
  }
  let seed = 'no-jwt-secret';
  try {
    seed = getJwtSecret();
  } catch {
    /* geliştirme: JWT_SECRET yoksa sabit tohum */
  }
  return crypto.createHash('sha256').update(DEV_KEY_LABEL + seed).digest();
}

function subKey(purpose: 'totp-secret' | 'recovery-code'): Buffer {
  const master = getMasterKey();
  if (!master) throw new KeyUnavailableError();
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), `portfoygo:${purpose}:v1`, 32));
}

export class KeyUnavailableError extends Error {
  constructor() {
    super('TOTP_ENC_KEY is not configured');
    this.name = 'KeyUnavailableError';
  }
}

const FORMAT = 'v1';

/** AES-256-GCM: `v1.<iv>.<tag>.<şifreli>` (base64url). aad: kayıt sahibinin kimliği. */
export function encryptSecret(plain: string, aad: string): string {
  const key = subKey('totp-secret');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/** encryptSecret'in tersi. Biçim / anahtar / AAD uyuşmazsa hata fırlatır. */
export function decryptSecret(blob: string, aad: string): string {
  const parts = String(blob || '').split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT) throw new Error('Unsupported secret format');
  const [, ivB64, tagB64, ctB64] = parts;
  const key = subKey('totp-secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Kurtarma kodunun (normalize edilmiş) kullanıcıya bağlı HMAC-SHA256 özeti (64 hex). */
export function hashRecoveryCode(userId: string, normalizedCode: string): string {
  return crypto.createHmac('sha256', subKey('recovery-code')).update(`${userId}:${normalizedCode}`).digest('hex');
}

/** 2FA giriş "challenge" JWT'leri için oturum anahtarından AYRI bir imza anahtarı. */
export function challengeSigningKey(): Buffer {
  return crypto.createHmac('sha256', getJwtSecret()).update('portfoygo:2fa-login-challenge:v1').digest();
}
