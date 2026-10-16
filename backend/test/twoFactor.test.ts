import { afterEach, describe, expect, it } from 'vitest';
import { generateSync } from 'otplib';
import { api, createUser, pool, type TestUser } from './helpers';
import { parseTotpEncKey } from '../src/config/env';
import { decryptSecret, encryptSecret } from '../src/services/security/crypto';
import { LOCK_MINUTES, MAX_FAILED, normalizeRecoveryCode } from '../src/services/security/twoFactor';

const PASSWORD = 'test-password-123';
const STEP_S = 30;

/** pg_session çerezinin değeri (Set-Cookie başlığından) */
function sessionCookie(res: { headers: Record<string, unknown> }): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const c of list) {
    const m = /^pg_session=([^;]*)/.exec(String(c));
    if (m && m[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

/**
 * Zaman adımı sınırına 3 sn'den az kaldıysa yeni adımın başlamasını bekler; böylece aynı testte üretilen
 * kodlar (önceki / şimdiki / sonraki adım) doğrulama anında ±1 tolerans içinde kalır.
 */
async function stableStep(): Promise<number> {
  const msIntoStep = Date.now() % (STEP_S * 1000);
  if (msIntoStep > (STEP_S - 3) * 1000) await new Promise((r) => setTimeout(r, STEP_S * 1000 - msIntoStep + 50));
  return Math.floor(Date.now() / 1000 / STEP_S);
}

/** step: mutlak TOTP zaman adımı */
const codeAt = (secret: string, step: number) => generateSync({ secret, epoch: step * STEP_S + 1 });

interface Enabled {
  user: TestUser;
  secret: string;
  recovery: string[];
  /** 2FA açıldıktan sonraki (yenilenmiş) oturum */
  auth: { Authorization: string };
  /** Etkinleştirmede kullanılan adım (bir önceki adım) */
  step: number;
}

/** Kullanıcı oluşturur ve 2FA'yı bir ÖNCEKİ adımın koduyla açar (şimdiki ve sonraki adım kodları kullanılabilir kalır). */
async function enable2fa(user?: TestUser): Promise<Enabled> {
  const u = user ?? (await createUser());
  const setup = await api().post('/api/auth/2fa/setup').set(u.auth).send({});
  expect(setup.status).toBe(200);
  const secret = String(setup.body.data.manual_key).replace(/\s+/g, '');
  const now = await stableStep();
  const res = await api().post('/api/auth/2fa/enable').set(u.auth).send({ code: codeAt(secret, now - 1) });
  expect(res.status).toBe(200);
  const token = sessionCookie(res);
  expect(token).toBeTruthy();
  return { user: u, secret, recovery: res.body.data.recovery_codes, auth: { Authorization: `Bearer ${token}` }, step: now - 1 };
}

async function loginChallenge(email: string): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.requires_2fa).toBe(true);
  expect(typeof res.body.challenge).toBe('string');
  return res.body.challenge;
}

const savedEnv = { ...process.env };
afterEach(() => {
  for (const k of ['NODE_ENV', 'TOTP_ENC_KEY', 'ADMIN_REQUIRE_2FA']) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('2FA yardımcıları', () => {
  it('TOTP_ENC_KEY: 64 hex veya 32 baytlık base64 kabul edilir, diğerleri reddedilir', () => {
    expect(parseTotpEncKey('a'.repeat(64))?.length).toBe(32);
    expect(parseTotpEncKey(Buffer.alloc(32, 7).toString('base64'))?.length).toBe(32);
    expect(parseTotpEncKey(Buffer.alloc(32, 7).toString('base64url'))?.length).toBe(32);
    expect(parseTotpEncKey('')).toBeNull();
    expect(parseTotpEncKey('kisa-anahtar')).toBeNull();
    expect(parseTotpEncKey(Buffer.alloc(16).toString('base64'))).toBeNull();
  });

  it('AES-256-GCM: kullanıcıya bağlı (AAD) — başka kullanıcının kimliğiyle çözülemez', () => {
    const blob = encryptSecret('JBSWY3DPEHPK3PXP', 'user-a');
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(blob, 'user-a')).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret(blob, 'user-b')).toThrow();
    // Aynı açık metin her seferinde farklı şifreli metin üretir (rastgele IV)
    expect(encryptSecret('JBSWY3DPEHPK3PXP', 'user-a')).not.toBe(blob);
  });

  it('kurtarma kodu biçimi normalize edilir', () => {
    expect(normalizeRecoveryCode(' abcde-fgh23 ')).toBe('ABCDEFGH23');
  });
});

describe('2FA kurulum ve etkinleştirme', () => {
  it('setup: otpauth URL + QR döner, anahtar şifreli ve bekleyen olarak saklanır', async () => {
    const u = await createUser();
    const res = await api().post('/api/auth/2fa/setup').set(u.auth).send({});
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.otpauth_url).toMatch(new RegExp(`^otpauth://totp/PortfoyGo:${u.username}\\?secret=[A-Z2-7]+&issuer=PortfoyGo$`));
    expect(d.qr_svg).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(d.qr_svg.split(',')[1], 'base64').toString('utf8')).toContain('<svg');
    expect(d.secret_masked).toContain('•');
    expect(d.account).toBe(u.username);
    const secret = String(d.manual_key).replace(/\s+/g, '');

    const row = (await pool.query('SELECT totp_pending_enc, totp_secret_enc, totp_enabled_at FROM users WHERE id = $1', [u.id])).rows[0];
    expect(row.totp_enabled_at).toBeNull();
    expect(row.totp_secret_enc).toBeNull();
    expect(row.totp_pending_enc).toMatch(/^v1\./);
    expect(row.totp_pending_enc).not.toContain(secret);

    const status = await api().get('/api/auth/2fa/status').set(u.auth);
    expect(status.body.data).toMatchObject({ enabled: false, recovery_codes_remaining: 0, available: true, admin_required: false });
  });

  it('enable: hatalı kod reddedilir; doğru kodla açılır, 10 kurtarma kodu döner ve diğer oturumlar kapanır', async () => {
    const u = await createUser();
    const setup = await api().post('/api/auth/2fa/setup').set(u.auth).send({});
    const secret = String(setup.body.data.manual_key).replace(/\s+/g, '');

    const bad = await api().post('/api/auth/2fa/enable').set(u.auth).send({ code: '000000' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_2FA_CODE');
    expect((await api().post('/api/auth/2fa/enable').set(u.auth).send({ code: '12' })).status).toBe(400);

    const now = await stableStep();
    const ok = await api().post('/api/auth/2fa/enable').set(u.auth).send({ code: codeAt(secret, now) });
    expect(ok.status).toBe(200);
    const codes: string[] = ok.body.data.recovery_codes;
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(new Set(codes).size).toBe(10);

    // Eski token geçersiz (token_version arttı); yanıttaki yeni çerez geçerli
    expect((await api().get('/api/auth/profile').set(u.auth)).status).toBe(401);
    const fresh = sessionCookie(ok);
    expect((await api().get('/api/auth/profile').set({ Authorization: `Bearer ${fresh}` })).status).toBe(200);

    const row = (await pool.query('SELECT totp_secret_enc, totp_enabled_at, totp_pending_enc FROM users WHERE id = $1', [u.id])).rows[0];
    expect(row.totp_enabled_at).not.toBeNull();
    expect(row.totp_pending_enc).toBeNull();
    expect(row.totp_secret_enc).not.toContain(secret);
    const hashes = await pool.query('SELECT code_hash FROM user_recovery_codes WHERE user_id = $1', [u.id]);
    expect(hashes.rows).toHaveLength(10);
    for (const h of hashes.rows) {
      expect(h.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(codes.map(normalizeRecoveryCode)).not.toContain(h.code_hash);
    }

    const status = await api().get('/api/auth/2fa/status').set({ Authorization: `Bearer ${fresh}` });
    expect(status.body.data).toMatchObject({ enabled: true, recovery_codes_remaining: 10 });
    // Zaten açıkken yeniden kurulum yok
    expect((await api().post('/api/auth/2fa/setup').set({ Authorization: `Bearer ${fresh}` }).send({})).body.code).toBe('TOTP_ALREADY_ENABLED');
  });

  it('production ortamında TOTP_ENC_KEY yoksa 2FA kurulamaz (503)', async () => {
    const u = await createUser();
    process.env.NODE_ENV = 'production';
    delete process.env.TOTP_ENC_KEY;
    const res = await api().post('/api/auth/2fa/setup').set(u.auth).send({});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('TOTP_UNAVAILABLE');
    const status = await api().get('/api/auth/2fa/status').set(u.auth);
    expect(status.body.data.available).toBe(false);

    process.env.TOTP_ENC_KEY = 'b'.repeat(64);
    expect((await api().post('/api/auth/2fa/setup').set(u.auth).send({})).status).toBe(200);
  });
});

describe('2FA ile giriş', () => {
  it('şifre doğruysa oturum yerine challenge döner; kodla oturum açılır, aynı kod tekrar kullanılamaz', async () => {
    const e = await enable2fa();
    const login = await api().post('/api/auth/login').send({ email: e.user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ success: true, requires_2fa: true });
    expect(login.body.user).toBeUndefined();
    expect(sessionCookie(login)).toBeNull();
    // Challenge oturum token'ı olarak kullanılamaz
    expect((await api().get('/api/auth/profile').set({ Authorization: `Bearer ${login.body.challenge}` })).status).toBe(401);

    const wrong = await api().post('/api/auth/login/2fa').send({ challenge: login.body.challenge, code: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_2FA_CODE');

    const now = await stableStep();
    const code = codeAt(e.secret, now);
    const ok = await api().post('/api/auth/login/2fa').send({ challenge: login.body.challenge, code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.username).toBe(e.user.username);
    const token = sessionCookie(ok);
    expect((await api().get('/api/auth/profile').set({ Authorization: `Bearer ${token}` })).status).toBe(200);

    const replay = await api().post('/api/auth/login/2fa').send({ challenge: login.body.challenge, code });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('INVALID_2FA_CODE');
  });

  it('kurtarma kodu bir kez kullanılabilir; geçersiz challenge reddedilir', async () => {
    const e = await enable2fa();
    const challenge = await loginChallenge(e.user.email);
    const ok = await api().post('/api/auth/login/2fa').send({ challenge, recovery_code: e.recovery[0].toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.body.recovery_codes_remaining).toBe(9);
    expect(sessionCookie(ok)).toBeTruthy();

    const again = await api().post('/api/auth/login/2fa').send({ challenge, recovery_code: e.recovery[0] });
    expect(again.status).toBe(401);

    const forged = await api().post('/api/auth/login/2fa').send({ challenge: `${challenge.slice(0, -4)}AAAA`, code: '123456' });
    expect(forged.status).toBe(401);
    expect(forged.body.code).toBe('CHALLENGE_INVALID');
  });

  it(`art arda ${MAX_FAILED} hatalı kod hesabı ${LOCK_MINUTES} dk kilitler (doğru kod da reddedilir)`, async () => {
    const e = await enable2fa();
    // Hesap kilidi IP'den bağımsızdır: kapatma ucundaki hatalı kodlar da sayılır
    for (let i = 1; i < MAX_FAILED; i++) {
      const r = await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: PASSWORD, code: '000000' });
      // Oturum açıkken yeniden doğrulama hatası 400 (401 istemcide "oturum düştü" sayılır)
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_2FA_CODE');
    }
    const fifth = await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: PASSWORD, code: '000000' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('TOTP_LOCKED');

    const challenge = await loginChallenge(e.user.email);
    const now = await stableStep();
    const locked = await api().post('/api/auth/login/2fa').send({ challenge, code: codeAt(e.secret, now) });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('TOTP_LOCKED');

    // Kilit bitince (süreyi geri alarak) doğru kod yine çalışır
    await pool.query(`UPDATE users SET totp_locked_until = now() - interval '1 second' WHERE id = $1`, [e.user.id]);
    const ok = await api().post('/api/auth/login/2fa').send({ challenge, code: codeAt(e.secret, now) });
    expect(ok.status).toBe(200);
  });

  it('şifre değişince / tüm oturumlar kapatılınca bekleyen challenge geçersiz olur', async () => {
    const e = await enable2fa();
    const challenge = await loginChallenge(e.user.email);
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [e.user.id]);
    const now = await stableStep();
    const res = await api().post('/api/auth/login/2fa').send({ challenge, code: codeAt(e.secret, now) });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('CHALLENGE_INVALID');
  });

  it('2FA kapalı hesapta giriş değişmez (doğrudan oturum)', async () => {
    const u = await createUser();
    const res = await api().post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.requires_2fa).toBeUndefined();
    expect(res.body.user.username).toBe(u.username);
    expect(sessionCookie(res)).toBeTruthy();
  });

  it('yerel hızlı giriş (yalnızca yerel DB) 2FA adımını atlar', async () => {
    const e = await enable2fa();
    const res = await api().post('/api/auth/dev-login').send({ username: e.user.username });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeTruthy();
  });
});

describe('2FA kapatma ve kurtarma kodları', () => {
  it('kapatma: şifre ve geçerli kod gerekir; sonra giriş yine tek adımlı', async () => {
    const e = await enable2fa();
    const now = await stableStep();
    const badPw = await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: 'yanlis-sifre', code: codeAt(e.secret, now) });
    expect(badPw.status).toBe(400);
    expect(badPw.body.code).toBe('INVALID_PASSWORD');
    expect((await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: PASSWORD })).status).toBe(400);

    const ok = await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: PASSWORD, code: codeAt(e.secret, now) });
    expect(ok.status).toBe(200);
    const row = (await pool.query('SELECT totp_secret_enc, totp_enabled_at FROM users WHERE id = $1', [e.user.id])).rows[0];
    expect(row).toEqual({ totp_secret_enc: null, totp_enabled_at: null });
    expect((await pool.query('SELECT 1 FROM user_recovery_codes WHERE user_id = $1', [e.user.id])).rows).toHaveLength(0);

    const login = await api().post('/api/auth/login').send({ email: e.user.email, password: PASSWORD });
    expect(login.body.requires_2fa).toBeUndefined();
    expect(sessionCookie(login)).toBeTruthy();
  });

  it('kurtarma koduyla da kapatılabilir; kurtarma kodları yenilenebilir', async () => {
    const e = await enable2fa();
    const now = await stableStep();
    const regen = await api().post('/api/auth/2fa/recovery-codes').set(e.auth).send({ code: codeAt(e.secret, now) });
    expect(regen.status).toBe(200);
    const fresh: string[] = regen.body.data.recovery_codes;
    expect(fresh).toHaveLength(10);
    // Eski kodlar artık geçersiz
    const old = await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: PASSWORD, code: e.recovery[1] });
    expect(old.status).toBe(400);
    const ok = await api().post('/api/auth/2fa/disable').set(e.auth).send({ password: PASSWORD, code: fresh[0] });
    expect(ok.status).toBe(200);
  });
});

describe('Yönetici 2FA zorunluluğu (ADMIN_REQUIRE_2FA)', () => {
  it('açıkken 2FA kapalı yönetici 403 ADMIN_2FA_REQUIRED alır; 2FA açınca erişir', async () => {
    const admin = await createUser();
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);

    process.env.ADMIN_REQUIRE_2FA = '0';
    expect((await api().get('/api/admin/stats').set(admin.auth)).status).toBe(200);

    process.env.ADMIN_REQUIRE_2FA = '1';
    const blocked = await api().get('/api/admin/stats').set(admin.auth);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ADMIN_2FA_REQUIRED');
    // Senaryo yönetimi (ayrı router) de aynı kuralı uygular
    expect((await api().get('/api/admin/arena/scenarios').set(admin.auth)).body.code).toBe('ADMIN_2FA_REQUIRED');
    const status = await api().get('/api/auth/2fa/status').set(admin.auth);
    expect(status.body.data).toMatchObject({ enabled: false, admin_required: true });

    const e = await enable2fa(admin);
    expect((await api().get('/api/admin/stats').set(e.auth)).status).toBe(200);

    // Yönetici olmayan kullanıcı yine 403 (2FA'dan bağımsız)
    const user = await createUser();
    const r = await api().get('/api/admin/stats').set(user.auth);
    expect(r.status).toBe(403);
    expect(r.body.code).toBeUndefined();
  });

  it('varsayılan: production dışında kapalı', async () => {
    const admin = await createUser();
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    delete process.env.ADMIN_REQUIRE_2FA;
    expect((await api().get('/api/admin/stats').set(admin.auth)).status).toBe(200);
  });
});

describe('Hız sınırı', () => {
  it('2FA giriş adımı IP başına 15 dakikada 10 istekle sınırlıdır', async () => {
    // Bu dosyada /login/2fa'ya daha önce yapılan istekler de sayılır; en geç 11. istekte sınır devreye girer
    let limited: { status: number; body: any; headers: Record<string, unknown> } | null = null;
    for (let i = 0; i < 11 && !limited; i++) {
      const r = await api().post('/api/auth/login/2fa').send({ challenge: 'x'.repeat(40), code: '123456' });
      if (r.status === 429) limited = r;
      else expect(r.status).toBe(401);
    }
    expect(limited).not.toBeNull();
    expect(limited!.body.message).toMatch(/Çok fazla doğrulama kodu denemesi/);
    expect(limited!.body.code).toBeUndefined();
  });
});
