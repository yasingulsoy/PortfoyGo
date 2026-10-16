import { describe, expect, it } from 'vitest';
import { generateSync } from 'otplib';
import { api, createUser, pool, uniqueSymbol } from './helpers';

const PASSWORD = 'test-password-123';

function sessionCookie(res: { headers: Record<string, unknown> }): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const c of list) {
    const m = /^pg_session=([^;]*)/.exec(String(c));
    if (m && m[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

/** Kullanıcıya biraz veri ekler: işlem, pozisyon, takip listesi, bildirim, etkinlik kaydı, aktif limit emri (rezervli) */
async function seedUserData(userId: string) {
  const symbol = uniqueSymbol('K');
  await pool.query(
    `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
     VALUES ($1, 'buy', $2, 'Test Corp', 'stock', 2, 100, 200, 1, 201)`,
    [userId, symbol]
  );
  await pool.query(
    `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price, total_value)
     VALUES ($1, $2, 'Test Corp', 'stock', 2, 100, 100, 200)`,
    [userId, symbol]
  );
  await pool.query(`INSERT INTO watchlist (user_id, asset_type, symbol) VALUES ($1, 'stock', $2)`, [userId, symbol]);
  await pool.query(
    `INSERT INTO notifications (user_id, type, category, title, body) VALUES ($1, 'test.note', 'account', 'Merhaba', 'Gövde')`,
    [userId]
  );
  await pool.query(
    `INSERT INTO activity_logs (user_id, activity_type, description, ip_address, user_agent)
     VALUES ($1, 'login', 'Kullanıcı giriş yaptı', '203.0.113.7', 'Vitest')`,
    [userId]
  );
  await pool.query(
    `INSERT INTO orders (user_id, asset_type, symbol, name, side, type, quantity, trigger_price, status, reserved_cash)
     VALUES ($1, 'stock', $2, 'Test Corp', 'buy', 'limit', 1, 90, 'active', 4000)`,
    [userId, symbol]
  );
  await pool.query('UPDATE users SET balance = balance - 4000, reserved_cash = reserved_cash + 4000 WHERE id = $1', [userId]);
  await pool.query(
    `INSERT INTO risk_profiles (user_id, answers, score, profile) VALUES ($1, '{"q1": 2}'::jsonb, 12, 'dengeli')`,
    [userId]
  );
  return symbol;
}

const SECRET_KEYS = ['password_hash', 'token_version', 'totp_secret_enc', 'totp_pending_enc', 'verification_code', 'code_hash'];

describe('KVKK: verilerimi indir (GET /api/me/export)', () => {
  it('kişisel verileri JSON dosyası olarak döndürür; gizli alanlar yoktur', async () => {
    const u = await createUser();
    const symbol = await seedUserData(u.id);

    const res = await api().get('/api/me/export').set(u.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="portfoygo-verilerim-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers['cache-control']).toBe('no-store');

    const body = JSON.parse(res.text);
    expect(body.meta).toMatchObject({ format: 'portfoygo-kisisel-veri', version: 1, user_id: u.id });
    expect(body.profile).toMatchObject({ id: u.id, username: u.username, email: u.email });
    expect(body.security).toMatchObject({ two_factor_enabled: false, recovery_codes_remaining: 0 });
    expect(body.transactions.map((t: any) => t.symbol)).toContain(symbol);
    expect(body.holdings.map((t: any) => t.symbol)).toContain(symbol);
    expect(body.watchlist).toEqual([expect.objectContaining({ symbol })]);
    expect(body.orders).toHaveLength(1);
    expect(body.notifications).toHaveLength(1);
    expect(body.activity_logs[0]).toMatchObject({ ip_address: '203.0.113.7', user_agent: 'Vitest' });
    expect(body.advisor_risk_profiles).toHaveLength(1);
    for (const key of ['portfolio_history', 'badges', 'seasons', 'league_memberships', 'arena_entries', 'game_ledger', 'weekly_picks', 'weekly_pick_comments', 'idle_game', 'advisor_plans', 'responsible_play']) {
      expect(Array.isArray(body[key])).toBe(true);
      expect(typeof body.meta.sections[key]).toBe('string');
    }
    for (const k of SECRET_KEYS) expect(res.text).not.toContain(`"${k}"`);

    // Başka kullanıcının verisi yok
    const other = await createUser();
    await seedUserData(other.id);
    const mine = JSON.parse((await api().get('/api/me/export').set(u.auth)).text);
    expect(mine.transactions).toHaveLength(1);
  });

  it('oturum gerektirir ve kullanıcı başına saatte 3 indirmeyle sınırlıdır', async () => {
    expect((await api().get('/api/me/export')).status).toBe(401);
    const u = await createUser();
    for (let i = 0; i < 3; i++) expect((await api().get('/api/me/export').set(u.auth)).status).toBe(200);
    const limited = await api().get('/api/me/export').set(u.auth);
    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/saatte en fazla 3/);
    // Sayaç kullanıcı başınadır
    const other = await createUser();
    expect((await api().get('/api/me/export').set(other.auth)).status).toBe(200);
  });
});

describe('KVKK: hesabımı sil (POST /api/me/delete)', () => {
  it('şifre ve (verilirse) kullanıcı adı onayı doğrulanır', async () => {
    const u = await createUser();
    const bad = await api().post('/api/me/delete').set(u.auth).send({ password: 'yanlis-sifre' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_PASSWORD');
    const mismatch = await api().post('/api/me/delete').set(u.auth).send({ password: PASSWORD, confirm_username: 'baska_biri' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('CONFIRMATION_MISMATCH');
    expect((await api().post('/api/me/delete').set(u.auth).send({})).status).toBe(400);
    const row = (await pool.query('SELECT is_deleted FROM users WHERE id = $1', [u.id])).rows[0];
    expect(row.is_deleted).toBe(false);
  });

  it('hesabı anonimleştirir, kişisel verileri siler, oturumları bitirir ve listelerden çıkarır', async () => {
    const u = await createUser();
    await seedUserData(u.id);
    const before = (await pool.query('SELECT token_version, balance FROM users WHERE id = $1', [u.id])).rows[0];
    const txBefore = (await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [u.id])).rows[0].n;

    // Haftalık Seçim: açıklanmış bir haftadaki not + yorum (test sonunda temizlenir)
    const weekId = '2001-W02';
    await pool.query(
      `INSERT INTO weekly_pick_weeks (week_id, opens_at, reveal_at, starts_at, ends_at)
       VALUES ($1, now() - interval '10 days', now() - interval '9 days', now() - interval '8 days', now() - interval '3 days')
       ON CONFLICT (week_id) DO NOTHING`,
      [weekId]
    );
    try {
      await pool.query(
        `INSERT INTO weekly_picks (week_id, user_id, asset_type, symbol, direction, note, quote_currency)
         VALUES ($1, $2, 'stock', 'AAPL', 'up', 'Gizli düşüncelerim', 'USD')`,
        [weekId, u.id]
      );
      await pool.query(`INSERT INTO weekly_pick_comments (week_id, user_id, text) VALUES ($1, $2, 'Benim yorumum')`, [weekId, u.id]);

      const res = await api().post('/api/me/delete').set(u.auth).send({ password: PASSWORD, confirm_username: u.username });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cleared).toMatch(/pg_session=;/);

      const row = (
        await pool.query(
          `SELECT username, email, password_hash, email_verified, is_deleted, deleted_at, token_version, is_admin,
                  last_login, balance, reserved_cash, totp_secret_enc
             FROM users WHERE id = $1`,
          [u.id]
        )
      ).rows[0];
      expect(row.username).toMatch(/^silinmis_[0-9a-f]{10}$/);
      expect(row.email).toBe(`${row.username}@silinmis.invalid`);
      expect(row.password_hash.startsWith('!deleted!')).toBe(true);
      expect(row).toMatchObject({ email_verified: false, is_deleted: true, is_admin: false, last_login: null, totp_secret_enc: null });
      expect(row.deleted_at).not.toBeNull();
      expect(Number(row.token_version)).toBe(Number(before.token_version) + 1);
      // Aktif emir iptal edildi, rezerv iade edildi
      expect(Number(row.reserved_cash)).toBe(0);
      expect(Number(row.balance)).toBe(Number(before.balance) + 4000);
      const order = (await pool.query('SELECT status, fail_reason FROM orders WHERE user_id = $1', [u.id])).rows[0];
      expect(order).toEqual({ status: 'cancelled', fail_reason: 'Hesap silindi' });

      // Kişisel veriler silindi; işlemler (anonim) korundu
      for (const table of ['notifications', 'watchlist', 'activity_logs', 'risk_profiles', 'email_verifications']) {
        const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id = $1`, [u.id])).rows[0].n;
        expect(n, table).toBe(0);
      }
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [u.id])).rows[0].n).toBe(txBefore);
      const pick = (await pool.query('SELECT note FROM weekly_picks WHERE user_id = $1', [u.id])).rows[0];
      expect(pick.note).toBeNull();
      const comment = (await pool.query('SELECT text, deleted_at FROM weekly_pick_comments WHERE user_id = $1', [u.id])).rows[0];
      expect(comment.text).toBe('[silindi]');
      expect(comment.deleted_at).not.toBeNull();

      // Oturum bitti, giriş yapılamaz (eski e-posta da yeni yer tutucu da)
      expect((await api().get('/api/auth/profile').set(u.auth)).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: row.email, password: PASSWORD })).status).toBe(401);
      // Yerel hızlı giriş de reddeder ve listede göstermez
      expect((await api().post('/api/auth/dev-login').send({ username: row.username })).status).toBe(404);
      const devList = await api().get('/api/auth/dev-login');
      expect(devList.body.data.users.map((x: any) => x.username)).not.toContain(row.username);

      // Liderlik tablosunda silinmiş hesap yok
      const board = await api().get('/api/leaderboard?limit=100').set((await createUser()).auth);
      const names: string[] = (board.body.leaderboard ?? board.body.data?.leaderboard ?? []).map((x: any) => x.username);
      expect(names.some((n) => n.startsWith('silinmis_'))).toBe(false);

      // İkinci silme isteği: oturum yok
      expect((await api().post('/api/me/delete').set(u.auth).send({ password: PASSWORD })).status).toBe(401);
    } finally {
      await pool.query('DELETE FROM weekly_pick_weeks WHERE week_id = $1', [weekId]);
    }
  });

  it('2FA açıksa doğrulama kodu da gerekir', async () => {
    const u = await createUser();
    const setup = await api().post('/api/auth/2fa/setup').set(u.auth).send({});
    const secret = String(setup.body.data.manual_key).replace(/\s+/g, '');
    // Zaman adımı sınırına çok yakınsa yeni adımı bekle (önceki adımın kodu ±1 tolerans içinde kalsın)
    const into = Date.now() % 30_000;
    if (into > 27_000) await new Promise((r) => setTimeout(r, 30_000 - into + 50));
    const step = Math.floor(Date.now() / 30_000);
    const enabled = await api().post('/api/auth/2fa/enable').set(u.auth).send({ code: generateSync({ secret, epoch: (step - 1) * 30 + 1 }) });
    expect(enabled.status).toBe(200);
    const auth = { Authorization: `Bearer ${sessionCookie(enabled)}` };

    const missing = await api().post('/api/me/delete').set(auth).send({ password: PASSWORD });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('TOTP_REQUIRED');
    const wrong = await api().post('/api/me/delete').set(auth).send({ password: PASSWORD, totp: '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVALID_2FA_CODE');

    const ok = await api().post('/api/me/delete').set(auth).send({ password: PASSWORD, totp: enabled.body.data.recovery_codes[0] });
    expect(ok.status).toBe(200);
    const row = (await pool.query('SELECT is_deleted, totp_enabled_at FROM users WHERE id = $1', [u.id])).rows[0];
    expect(row).toEqual({ is_deleted: true, totp_enabled_at: null });
    expect((await pool.query('SELECT 1 FROM user_recovery_codes WHERE user_id = $1', [u.id])).rows).toHaveLength(0);
  });

  it('silinen e-posta ile yeniden kayıt olunabilir; "silinmis_" öneki yeni hesaplara kapalıdır', async () => {
    const u = await createUser();
    expect((await api().post('/api/me/delete').set(u.auth).send({ password: PASSWORD })).status).toBe(200);

    const reserved = await api().post('/api/auth/register').send({ username: 'silinmis_abc', email: 'yeni@test.local', password: 'yeterince-uzun' });
    expect(reserved.status).toBe(400);

    const again = await api().post('/api/auth/register').send({ username: u.username, email: u.email, password: 'yeterince-uzun' });
    expect(again.status).toBe(201);
  });
});
