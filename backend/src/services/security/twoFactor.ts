import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { generateSecret, generateURI, verifySync } from 'otplib';
import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { isAdmin2faRequired } from '../../config/env';
import { AppError } from '../../utils/errors';
import {
  KeyUnavailableError,
  challengeSigningKey,
  decryptSecret,
  encryptSecret,
  getMasterKey,
  hashRecoveryCode,
} from './crypto';

/**
 * İki adımlı doğrulama (TOTP, RFC 6238 — Google Authenticator, Microsoft Authenticator, 1Password …).
 *
 * Akış:
 *  1) setup  → yeni gizli anahtar üretilir, ŞİFRELİ olarak "bekleyen" alana yazılır (15 dk), QR + otpauth URL döner
 *  2) enable → bekleyen anahtarla üretilmiş bir kod doğrulanınca etkinleşir; 10 tek kullanımlık kurtarma kodu
 *              üretilir (yalnızca bu yanıtta açık metin), diğer tüm oturumlar kapatılır (token_version + 1)
 *  3) giriş  → şifre doğruysa oturum çerezi YERİNE kısa ömürlü imzalı bir "challenge" döner; kod/kurtarma kodu
 *              ile POST /api/auth/login/2fa oturumu açar
 *  4) disable → şifre + geçerli kod (TOTP ya da kurtarma kodu)
 *
 * Kod doğrulama: ±1 zaman adımı (±30 sn) tolerans; aynı zaman adımındaki kod ikinci kez kabul edilmez
 * (totp_last_step). Art arda MAX_FAILED hatalı denemede hesap LOCK_MINUTES dakika kilitlenir (IP'den bağımsız;
 * IP başına hız sınırı ayrıca route katmanındadır).
 */

export const TOTP_ISSUER = 'PortfoyGo';
export const RECOVERY_CODE_COUNT = 10;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
const PENDING_TTL_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_S = 5 * 60;
const CHALLENGE_AUDIENCE = 'portfoygo:2fa-login';
/** ±1 zaman adımı (30 sn'lik periyotta) */
const EPOCH_TOLERANCE_S = 30;
// Karışan karakterler yok (I, O, 0, 1): 32 karakter → kod başına 10 × 5 = 50 bit
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const TOTP_RE = /^\d{6}$/;

export interface TwoFactorStatus {
  enabled: boolean;
  enabled_at: string | null;
  recovery_codes_remaining: number;
  /** Sunucuda şifreleme anahtarı tanımlı mı (değilse 2FA kurulamaz) */
  available: boolean;
  /** Bu hesap yönetici ve ADMIN_REQUIRE_2FA açık: yönetim API'si için 2FA zorunlu */
  admin_required: boolean;
}

export interface TwoFactorSetup {
  otpauth_url: string;
  /** data:image/svg+xml;base64,… (CSP img-src data: ile uyumlu) */
  qr_svg: string;
  /** Uygulamaya elle girmek için 4'lü gruplar halinde anahtar */
  manual_key: string;
  secret_masked: string;
  /** Kurulumun yapıldığı hesap (oturum çerezinin sahibi) — arayüz bunu gösterir */
  account: string;
  expires_at: string;
}

export type SecondFactorMethod = 'totp' | 'recovery';

interface SecurityRow {
  id: string;
  username: string;
  password_hash: string;
  token_version: number;
  is_admin: boolean;
  is_banned: boolean;
  is_deleted: boolean;
  totp_secret_enc: string | null;
  totp_enabled_at: Date | null;
  totp_pending_enc: string | null;
  totp_pending_at: Date | null;
  totp_last_step: string | number | null;
  totp_locked_until: Date | null;
}

const SECURITY_COLUMNS = `id, username, password_hash, token_version, COALESCE(is_admin, false) AS is_admin,
  COALESCE(is_banned, false) AS is_banned, COALESCE(is_deleted, false) AS is_deleted,
  totp_secret_enc, totp_enabled_at, totp_pending_enc, totp_pending_at, totp_last_step, totp_locked_until`;

type Queryable = Pick<PoolClient, 'query'>;

async function loadUser(userId: string, db: Queryable = pool, forUpdate = false): Promise<SecurityRow | null> {
  const r = await db.query(`SELECT ${SECURITY_COLUMNS} FROM users WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [userId]);
  return (r.rows[0] as SecurityRow | undefined) ?? null;
}

function requireKey(): void {
  if (!getMasterKey()) {
    throw new AppError(
      503,
      'İki adımlı doğrulama şu anda kullanılamıyor (sunucu yapılandırması eksik). Lütfen daha sonra tekrar dene.',
      'TOTP_UNAVAILABLE'
    );
  }
}

/** Şifre çözme hatasını (anahtar değişmiş / eksik) kullanıcıya genel bir 503 olarak yansıtır. */
function decryptOrThrow(blob: string, userId: string): string {
  try {
    return decryptSecret(blob, userId);
  } catch (err) {
    if (err instanceof KeyUnavailableError) requireKey();
    throw new AppError(503, 'İki adımlı doğrulama anahtarı okunamadı. Lütfen destek ile iletişime geç.', 'TOTP_UNAVAILABLE');
  }
}

/** "abcd-EFGH 23" → "ABCDEFGH23" (boşluk / tire / küçük harf toleransı) */
export function normalizeRecoveryCode(input: string): string {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function newRecoveryCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
  return s;
}

/** Kullanıcıya gösterim biçimi: XXXXX-XXXXX */
const formatRecovery = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

function maskSecret(secret: string): string {
  return `${secret.slice(0, 4)}${'•'.repeat(8)}${secret.slice(-4)}`;
}

function isLocked(row: Pick<SecurityRow, 'totp_locked_until'>): number {
  const until = row.totp_locked_until ? new Date(row.totp_locked_until).getTime() : 0;
  return until > Date.now() ? until : 0;
}

function lockedError(untilMs: number): AppError {
  const minutes = Math.max(1, Math.ceil((untilMs - Date.now()) / 60_000));
  return new AppError(429, `Çok fazla hatalı doğrulama kodu. ${minutes} dakika sonra tekrar dene.`, 'TOTP_LOCKED');
}

/**
 * Hatalı denemeyi kaydeder (çağıranın transaction'ından BAĞIMSIZ, pool üzerinden — geri alınmaz).
 * MAX_FAILED'a ulaşınca sayaç sıfırlanır ve hesap LOCK_MINUTES kilitlenir.
 */
async function recordFailure(userId: string): Promise<number> {
  const r = await pool.query(
    `UPDATE users
        SET totp_failed_attempts = CASE WHEN totp_failed_attempts + 1 >= $2 THEN 0 ELSE totp_failed_attempts + 1 END,
            totp_locked_until = CASE WHEN totp_failed_attempts + 1 >= $2
                                     THEN now() + make_interval(mins => $3::int) ELSE totp_locked_until END
      WHERE id = $1
      RETURNING totp_locked_until`,
    [userId, MAX_FAILED, LOCK_MINUTES]
  );
  const until = r.rows[0]?.totp_locked_until ? new Date(r.rows[0].totp_locked_until).getTime() : 0;
  return until > Date.now() ? until : 0;
}

async function resetFailures(userId: string, db: Queryable = pool): Promise<void> {
  await db.query(
    `UPDATE users SET totp_failed_attempts = 0, totp_locked_until = NULL
      WHERE id = $1 AND (totp_failed_attempts <> 0 OR totp_locked_until IS NOT NULL)`,
    [userId]
  );
}

/** ±1 adım toleranslı TOTP doğrulaması; geçerliyse eşleşen zaman adımı, değilse null. */
function matchTotp(secret: string, code: string, afterStep: number | null): number | null {
  if (!TOTP_RE.test(code)) return null;
  try {
    const res = verifySync({
      secret,
      token: code,
      epochTolerance: EPOCH_TOLERANCE_S,
      ...(afterStep !== null && Number.isFinite(afterStep) ? { afterTimeStep: afterStep } : {}),
    });
    // TOTP sonucu zaman adımını taşır (HOTP sonucu taşımaz; burada her zaman TOTP)
    return res.valid && 'timeStep' in res && typeof res.timeStep === 'number' ? res.timeStep : null;
  } catch {
    return null;
  }
}

async function insertRecoveryCodes(db: Queryable, userId: string): Promise<string[]> {
  await db.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(newRecoveryCode());
  const list = [...codes];
  const hashes = list.map((c) => hashRecoveryCode(userId, c));
  await db.query(
    `INSERT INTO user_recovery_codes (user_id, code_hash) SELECT $1, h FROM unnest($2::text[]) AS h`,
    [userId, hashes]
  );
  return list.map(formatRecovery);
}

async function remainingRecoveryCodes(userId: string, db: Queryable = pool): Promise<number> {
  const r = await db.query('SELECT COUNT(*)::int AS n FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL', [userId]);
  return Number(r.rows[0]?.n ?? 0);
}

export class TwoFactorService {
  /** Sunucuda şifreleme anahtarı var mı (production'da TOTP_ENC_KEY) */
  static isAvailable(): boolean {
    return getMasterKey() !== null;
  }

  static async status(userId: string): Promise<TwoFactorStatus> {
    const row = await loadUser(userId);
    if (!row) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    const enabled = !!row.totp_enabled_at;
    return {
      enabled,
      enabled_at: row.totp_enabled_at ? new Date(row.totp_enabled_at).toISOString() : null,
      recovery_codes_remaining: enabled ? await remainingRecoveryCodes(userId) : 0,
      available: TwoFactorService.isAvailable(),
      admin_required: row.is_admin && isAdmin2faRequired(),
    };
  }

  /** Yeni (bekleyen) anahtar üretir. 2FA zaten açıksa 409. */
  static async setup(userId: string): Promise<TwoFactorSetup> {
    requireKey();
    const row = await loadUser(userId);
    if (!row || row.is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    if (row.totp_enabled_at) {
      throw new AppError(409, 'İki adımlı doğrulama zaten açık. Yeniden kurmak için önce kapat.', 'TOTP_ALREADY_ENABLED');
    }
    const secret = generateSecret();
    await pool.query('UPDATE users SET totp_pending_enc = $2, totp_pending_at = now() WHERE id = $1', [
      userId,
      encryptSecret(secret, userId),
    ]);
    const otpauthUrl = generateURI({ issuer: TOTP_ISSUER, label: row.username, secret });
    const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 220 });
    return {
      otpauth_url: otpauthUrl,
      qr_svg: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
      manual_key: groupKey(secret),
      secret_masked: maskSecret(secret),
      account: row.username,
      expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    };
  }

  /**
   * Bekleyen anahtarla üretilmiş kodu doğrular ve 2FA'yı açar. Kurtarma kodlarını (açık metin, bir kez)
   * ve yeni token_version'ı döndürür (diğer oturumlar kapanır; route bu oturum için çerezi yeniler).
   */
  static async enable(userId: string, code: string): Promise<{ recovery_codes: string[]; token_version: number }> {
    requireKey();
    const pre = await loadUser(userId);
    if (!pre || pre.is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    const lockedUntil = isLocked(pre);
    if (lockedUntil) throw lockedError(lockedUntil);
    if (pre.totp_enabled_at) throw new AppError(409, 'İki adımlı doğrulama zaten açık.', 'TOTP_ALREADY_ENABLED');
    const pendingAt = pre.totp_pending_at ? new Date(pre.totp_pending_at).getTime() : 0;
    if (!pre.totp_pending_enc || Date.now() - pendingAt > PENDING_TTL_MS) {
      throw new AppError(409, 'Kurulumun süresi doldu. Lütfen QR kodunu yeniden oluştur.', 'TOTP_SETUP_EXPIRED');
    }
    const secret = decryptOrThrow(pre.totp_pending_enc, userId);
    const step = matchTotp(secret, code, null);
    if (step === null) {
      const until = await recordFailure(userId);
      if (until) throw lockedError(until);
      throw new AppError(400, 'Doğrulama kodu hatalı. Uygulamadaki güncel kodu gir.', 'INVALID_2FA_CODE');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await loadUser(userId, client, true);
      if (!row || row.totp_enabled_at || row.totp_pending_enc !== pre.totp_pending_enc) {
        throw new AppError(409, 'Kurulum başka bir oturumda değişti. Lütfen yeniden dene.', 'TOTP_SETUP_CHANGED');
      }
      const upd = await client.query(
        `UPDATE users
            SET totp_secret_enc = totp_pending_enc, totp_enabled_at = now(),
                totp_pending_enc = NULL, totp_pending_at = NULL, totp_last_step = $2,
                totp_failed_attempts = 0, totp_locked_until = NULL,
                token_version = token_version + 1
          WHERE id = $1
          RETURNING token_version`,
        [userId, step]
      );
      const recovery = await insertRecoveryCodes(client, userId);
      await client.query('COMMIT');
      return { recovery_codes: recovery, token_version: Number(upd.rows[0].token_version) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * İkinci faktörü doğrular: 6 haneli TOTP kodu ya da kurtarma kodu (XXXXX-XXXXX). Başarısızlıkta deneme
   * kaydedilir (kilit), INVALID_2FA_CODE fırlatır. 2FA kapalıysa hiçbir şey yapmaz ('none').
   *
   * failStatus: girişte (oturum yok) 401; oturum açıkken yeniden doğrulama isteyen uçlarda (kapatma, hesap
   * silme) 400 — istemci 401'i "oturum düştü" sayıp çıkış yaptırmasın.
   */
  static async assertSecondFactor(
    userId: string,
    input: { code?: string | null; recovery_code?: string | null },
    failStatus: 400 | 401 = 401
  ): Promise<{ method: SecondFactorMethod | 'none'; recovery_remaining?: number }> {
    const row = await loadUser(userId);
    if (!row) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    if (!row.totp_enabled_at || !row.totp_secret_enc) return { method: 'none' };
    const lockedUntil = isLocked(row);
    if (lockedUntil) throw lockedError(lockedUntil);

    const raw = String(input.recovery_code ?? input.code ?? '').trim();
    if (!raw) throw new AppError(failStatus, 'İki adımlı doğrulama kodu gerekli.', 'TOTP_REQUIRED');
    const compact = raw.replace(/\s+/g, '');

    if (!input.recovery_code && TOTP_RE.test(compact)) {
      const secret = decryptOrThrow(row.totp_secret_enc, userId);
      const last = row.totp_last_step === null ? null : Number(row.totp_last_step);
      const step = matchTotp(secret, compact, last);
      if (step !== null) {
        // Aynı kod eşzamanlı iki istekte kullanılamasın: adım yalnızca ileri gidebilir
        const upd = await pool.query(
          `UPDATE users SET totp_last_step = $2, totp_failed_attempts = 0, totp_locked_until = NULL
            WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)`,
          [userId, step]
        );
        if (upd.rowCount === 1) return { method: 'totp' };
      }
    } else {
      const normalized = normalizeRecoveryCode(raw);
      if (RECOVERY_RE.test(normalized)) {
        const used = await pool.query(
          `UPDATE user_recovery_codes SET used_at = now()
            WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
            RETURNING id`,
          [userId, hashRecoveryCode(userId, normalized)]
        );
        if (used.rowCount === 1) {
          await resetFailures(userId);
          return { method: 'recovery', recovery_remaining: await remainingRecoveryCodes(userId) };
        }
      }
    }

    const until = await recordFailure(userId);
    if (until) throw lockedError(until);
    throw new AppError(failStatus, 'Doğrulama kodu hatalı veya daha önce kullanılmış.', 'INVALID_2FA_CODE');
  }

  /** Şifre + ikinci faktör ile 2FA'yı kapatır (kurtarma kodları silinir). */
  static async disable(userId: string, password: string, code: string): Promise<void> {
    const row = await loadUser(userId);
    if (!row || row.is_deleted) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    if (!row.totp_enabled_at) throw new AppError(409, 'İki adımlı doğrulama zaten kapalı.', 'TOTP_NOT_ENABLED');
    const lockedUntil = isLocked(row);
    if (lockedUntil) throw lockedError(lockedUntil);
    if (!(await bcrypt.compare(password, row.password_hash))) {
      throw new AppError(400, 'Şifre hatalı.', 'INVALID_PASSWORD');
    }
    await TwoFactorService.assertSecondFactor(userId, { code }, 400);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users
            SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_pending_enc = NULL, totp_pending_at = NULL,
                totp_last_step = NULL, totp_failed_attempts = 0, totp_locked_until = NULL
          WHERE id = $1`,
        [userId]
      );
      await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Geçerli bir kodla yeni kurtarma kodları üretir (eskiler geçersiz olur). */
  static async regenerateRecoveryCodes(userId: string, code: string): Promise<string[]> {
    requireKey();
    const row = await loadUser(userId);
    if (!row || !row.totp_enabled_at) throw new AppError(409, 'İki adımlı doğrulama kapalı.', 'TOTP_NOT_ENABLED');
    await TwoFactorService.assertSecondFactor(userId, { code }, 400);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const codes = await insertRecoveryCodes(client, userId);
      await client.query('COMMIT');
      return codes;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Giriş: şifre doğrulandıktan sonra kısa ömürlü challenge
  // ---------------------------------------------------------------------------

  /** 5 dk geçerli, oturum JWT'lerinden ayrı anahtarla imzalanmış challenge (oturum olarak KULLANILAMAZ). */
  static createLoginChallenge(userId: string, tokenVersion: unknown): string {
    const tv = Number(tokenVersion ?? 0);
    return jwt.sign({ sub: userId, tv: Number.isInteger(tv) ? tv : 0, typ: '2fa' }, challengeSigningKey(), {
      algorithm: 'HS256',
      audience: CHALLENGE_AUDIENCE,
      expiresIn: CHALLENGE_TTL_S,
      jwtid: crypto.randomUUID(),
    });
  }

  /**
   * Challenge + kod ile girişi tamamlar. Başarılıysa oturum açılacak kullanıcının kimliği ve token_version'ı
   * (route çerezi yazar). Challenge geçersiz/süresi dolmuşsa 401 CHALLENGE_INVALID.
   */
  static async completeLogin(
    challenge: string,
    input: { code?: string | null; recovery_code?: string | null }
  ): Promise<{ userId: string; tokenVersion: number; method: SecondFactorMethod; recovery_remaining?: number }> {
    let payload: Record<string, unknown>;
    try {
      const decoded = jwt.verify(challenge, challengeSigningKey(), { algorithms: ['HS256'], audience: CHALLENGE_AUDIENCE });
      payload = typeof decoded === 'object' && decoded ? (decoded as Record<string, unknown>) : {};
    } catch {
      throw new AppError(401, 'Doğrulama süresi doldu. Lütfen yeniden giriş yap.', 'CHALLENGE_INVALID');
    }
    const userId = payload.sub;
    if (typeof userId !== 'string' || payload.typ !== '2fa' || typeof payload.tv !== 'number') {
      throw new AppError(401, 'Doğrulama süresi doldu. Lütfen yeniden giriş yap.', 'CHALLENGE_INVALID');
    }
    const row = await loadUser(userId);
    // Şifre değişti / tüm oturumlar kapatıldı / hesap silindi veya yasaklandı → challenge geçersiz
    if (!row || row.is_deleted || row.is_banned || Number(row.token_version) !== payload.tv || !row.totp_enabled_at) {
      throw new AppError(401, 'Doğrulama süresi doldu. Lütfen yeniden giriş yap.', 'CHALLENGE_INVALID');
    }
    const res = await TwoFactorService.assertSecondFactor(userId, input);
    if (res.method === 'none') {
      throw new AppError(401, 'Doğrulama süresi doldu. Lütfen yeniden giriş yap.', 'CHALLENGE_INVALID');
    }
    return { userId, tokenVersion: Number(row.token_version), method: res.method, recovery_remaining: res.recovery_remaining };
  }
}
