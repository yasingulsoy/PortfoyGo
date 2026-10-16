import crypto from 'crypto';
import { getJwtSecret } from '../../config/env';

/**
 * Tek tıkla abonelikten çıkma bağlantısı için imzalı token.
 *
 *   token = <kullanıcı-uuid>.<base64url(HMAC-SHA256(anahtar, "unsub:v1:<amaç>:<uuid>"))>
 *
 * - Anahtar: EMAIL_UNSUBSCRIBE_SECRET (varsa) ya da JWT_SECRET'tan alan ayrımıyla türetilir
 *   (JWT_SECRET değişirse eski e-postalardaki bağlantılar geçersiz olur; kalıcılık için ayrı anahtar verin).
 * - Süresiz: abonelikten çıkma bağlantıları aylar sonra da çalışmalı. Token yalnızca TEK işe yarar
 *   (o kullanıcının o e-posta türünü kapatıp açmak); oturum açmaz, başka veri göstermez.
 * - Doğrulama sabit zamanlıdır.
 */

export const UNSUBSCRIBE_PURPOSE = 'email_digest';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIG_RE = /^[A-Za-z0-9_-]{43}$/;

function key(secret?: string): Buffer {
  const base = secret ?? (process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || getJwtSecret());
  return crypto.createHash('sha256').update(`portfoygo:email-unsubscribe:v1:${base}`).digest();
}

function signature(userId: string, purpose: string, secret?: string): string {
  return crypto.createHmac('sha256', key(secret)).update(`unsub:v1:${purpose}:${userId.toLowerCase()}`).digest('base64url');
}

export function signUnsubscribeToken(userId: string, purpose: string = UNSUBSCRIBE_PURPOSE, secret?: string): string {
  if (!UUID_RE.test(userId)) throw new Error('Geçersiz kullanıcı kimliği');
  return `${userId.toLowerCase()}.${signature(userId, purpose, secret)}`;
}

/** Geçerliyse kullanıcı kimliğini, değilse null döner. */
export function verifyUnsubscribeToken(token: unknown, purpose: string = UNSUBSCRIBE_PURPOSE, secret?: string): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!UUID_RE.test(userId) || !SIG_RE.test(sig)) return null;
  const expected = Buffer.from(signature(userId, purpose, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return userId.toLowerCase();
}
