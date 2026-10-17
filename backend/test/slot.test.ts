import crypto from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { api, confirmAdult, createUser, pool, TestUser } from './helpers';
import { AccountDeletionService } from '../src/services/account/delete';
import { AccountExportService } from '../src/services/account/export';
import { AppSettings } from '../src/services/appSettings';
import { GameError, istanbulDayStart } from '../src/services/game/common';
import { SLOT } from '../src/services/game/config';
import { ResponsiblePlay } from '../src/services/game/responsible';
import { GameService } from '../src/services/game/service';
import { RandomInt, Slot, slotFlag } from '../src/services/game/slot';

// Paylaşılan PGlite (test/globalSetup.ts). Zaman `now` ile enjekte edilir: bugünün İstanbul öğlesi (gece yarısından uzak).
const T0 = new Date(istanbulDayStart(new Date()).getTime() + 12 * 60 * 60 * 1000);
const at = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

/** Sırayla verilen değerleri döndüren rand (makara başına bir çağrı). 0 → Ayı, 5 → Dolar, 9 → Petrol, 12 → Boğa, 19 → Yıldız */
function seq(...values: number[]): RandomInt {
  let i = 0;
  return () => values[i++ % values.length];
}
const LOSE = () => seq(0, 5, 9); // Ayı, Dolar, Petrol → kazanç yok
const PAIR = () => seq(12, 12, 0); // Boğa, Boğa, Ayı → ×2
const JACKPOT = () => seq(19, 19, 19); // 3× Yıldız → ×100

const uuid = () => crypto.randomUUID();

async function player(coins = 1000): Promise<TestUser> {
  const u = await createUser();
  await confirmAdult(u.id);
  if (coins > 0) await GameService.award(u.id, { coins, reason: 'dev_grant', ref_type: 'test', ref_id: uuid() });
  return u;
}

async function coinsOf(id: string): Promise<number> {
  return Number((await pool.query('SELECT coins FROM users WHERE id = $1', [id])).rows[0].coins);
}

async function slotLedger(id: string) {
  const r = await pool.query(
    `SELECT coins, reason, ref_type, ref_id FROM game_ledger WHERE user_id = $1 AND reason LIKE 'slot_%' ORDER BY id`,
    [id]
  );
  return r.rows.map((x: any) => ({ ...x, coins: Number(x.coins) }));
}

async function spinCount(id: string): Promise<number> {
  return Number((await pool.query('SELECT COUNT(*)::int AS n FROM slot_spins WHERE user_id = $1', [id])).rows[0].n);
}

/** Geçmiş çevirme satırları ekler (sınır testleri için; jeton hareketi yok). */
async function seedSpins(userId: string, rows: { bet: number; win: number; at: Date }[]) {
  for (const r of rows) {
    await pool.query(
      `INSERT INTO slot_spins (user_id, request_id, bet, win, reels, combo, multiplier, balance_after, created_at)
       VALUES ($1, $2, $3, $4, '["ayi","dolar","petrol"]'::jsonb, 'none', 0, 0, $5)`,
      [userId, uuid(), r.bet, r.win, r.at]
    );
  }
}

async function expectGameError(p: Promise<unknown>, status: number, code: string): Promise<GameError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    expect((err as GameError).status).toBe(status);
    return err as GameError;
  }
  throw new Error(`Beklenen hata gelmedi: ${code}`);
}

const W = { 'X-Requested-With': 'PortfoyGo' };

afterAll(async () => {
  // Paylaşılan veritabanı: yönetici anahtarını varsayılana döndür
  await pool.query(`DELETE FROM app_settings WHERE key = $1`, [SLOT.settingKey]);
});

describe('slot: çevirme (sunucu belirler, defter tek transaction)', () => {
  it('bahis düşülür ve kazanç aynı transaction ile eklenir; defter + slot_spins tutarlı', async () => {
    const u = await player(1000);
    const id1 = uuid();
    const win = await Slot.spin(u.id, { bet: 25, request_id: id1 }, { now: T0, rand: JACKPOT() });
    expect(win).toMatchObject({
      replayed: false,
      reels: ['yildiz', 'yildiz', 'yildiz'],
      combo: { id: 'three-yildiz', multiplier: 100, label: '3× Yıldız' },
      bet: 25,
      win: 2500,
      net: 2475,
      balance: 1000 - 25 + 2500,
      reality_check: null,
    });
    expect(await coinsOf(u.id)).toBe(3475);

    const id2 = uuid();
    const lose = await Slot.spin(u.id, { bet: 10, request_id: id2 }, { now: at(2000), rand: LOSE() });
    expect(lose).toMatchObject({ reels: ['ayi', 'dolar', 'petrol'], combo: { id: 'none', multiplier: 0 }, win: 0, net: -10, balance: 3465 });
    expect(lose.stats.today).toEqual({ spins: 2, wagered: 35, won: 2500, net: 2465 });
    expect(lose.stats.lifetime).toMatchObject({ spins: 2, wagered: 35, won: 2500, realized_rtp_pct: Math.round((2500 / 35) * 1_000_000) / 10_000 });
    expect(lose.stats.session).toMatchObject({ spins: 2, wagered: 35, expected_net: -2, reality_check_due: false });

    expect(await slotLedger(u.id)).toEqual([
      { coins: -25, reason: 'slot_bet', ref_type: 'slot', ref_id: id1 },
      { coins: 2500, reason: 'slot_win', ref_type: 'slot', ref_id: id1 },
      { coins: -10, reason: 'slot_bet', ref_type: 'slot', ref_id: id2 },
    ]);
    const rows = await pool.query(`SELECT bet, win, reels, combo, balance_after FROM slot_spins WHERE user_id = $1 ORDER BY created_at`, [u.id]);
    expect(rows.rows).toEqual([
      { bet: 25, win: 2500, reels: ['yildiz', 'yildiz', 'yildiz'], combo: 'three-yildiz', balance_after: 3475 },
      { bet: 10, win: 0, reels: ['ayi', 'dolar', 'petrol'], combo: 'none', balance_after: 3465 },
    ]);
    // XP verilmez (kumar benzeri mekanik seviye ilerletmez)
    expect(Number((await pool.query('SELECT xp FROM users WHERE id = $1', [u.id])).rows[0].xp)).toBe(0);
  });

  it('yetersiz jeton → 400 INSUFFICIENT_COINS; hiçbir şey yazılmaz', async () => {
    const u = await player(20);
    await expectGameError(Slot.spin(u.id, { bet: 25, request_id: uuid() }, { now: T0, rand: JACKPOT() }), 400, 'INSUFFICIENT_COINS');
    expect(await coinsOf(u.id)).toBe(20);
    expect(await slotLedger(u.id)).toEqual([]);
    expect(await spinCount(u.id)).toBe(0);
    // Yetecek bahis çalışır
    const ok = await Slot.spin(u.id, { bet: 10, request_id: uuid() }, { now: T0, rand: LOSE() });
    expect(ok.balance).toBe(10);
    // Geçersiz bahis
    await expectGameError(Slot.spin(u.id, { bet: 7, request_id: uuid() }, { now: at(5000) }), 400, 'INVALID_BET');
  });

  it('idempotent: aynı request_id aynı sonucu döndürür, jeton bir kez düşer; farklı bahisle → 409', async () => {
    const u = await player(500);
    const rid = uuid();
    const first = await Slot.spin(u.id, { bet: 10, request_id: rid }, { now: T0, rand: PAIR() });
    expect(first).toMatchObject({ replayed: false, win: 20, balance: 510 });
    // Yeniden deneme: bekleme süresi içinde bile aynı sonuç (yeni rand yok sayılır)
    const again = await Slot.spin(u.id, { bet: 10, request_id: rid }, { now: at(100), rand: JACKPOT() });
    expect(again).toMatchObject({ replayed: true, reels: first.reels, win: 20, net: 10, balance: 510 });
    expect(await coinsOf(u.id)).toBe(510);
    expect(await slotLedger(u.id)).toHaveLength(2);
    expect(await spinCount(u.id)).toBe(1);
    await expectGameError(Slot.spin(u.id, { bet: 25, request_id: rid }, { now: at(200) }), 409, 'SLOT_REQUEST_CONFLICT');
  });

  it('API: eşzamanlı aynı request_id → bir kez işlenir', async () => {
    const u = await player(500);
    const rid = uuid();
    const send = () => api().post('/api/game/slot/spin').set(u.auth).send({ bet: 5, request_id: rid });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect([a.body.data.replayed, b.body.data.replayed].sort()).toEqual([false, true]);
    expect(a.body.data.reels).toEqual(b.body.data.reels);
    expect(await spinCount(u.id)).toBe(1);
    expect((await slotLedger(u.id)).filter((r) => r.reason === 'slot_bet')).toHaveLength(1);
    expect(await coinsOf(u.id)).toBe(500 - 5 + a.body.data.win);
  });

  it('bekleme süresi: 1,5 sn dolmadan → 429 SLOT_COOLDOWN (retry_after_ms)', async () => {
    const u = await player(500);
    await Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: T0, rand: LOSE() });
    const err = await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: at(1000), rand: LOSE() }), 429, 'SLOT_COOLDOWN');
    expect(err.extra).toMatchObject({ retry_after_ms: 500, next_spin_at: at(1500).toISOString() });
    expect(await spinCount(u.id)).toBe(1);
    await Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: at(SLOT.minIntervalMs), rand: LOSE() });
    expect(await spinCount(u.id)).toBe(2);
  });

  it('API: art arda iki çevirme → ikincisi 429 + Retry-After', async () => {
    const u = await player(500);
    const first = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 5, request_id: uuid() });
    expect(first.status).toBe(200);
    const second = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 5, request_id: uuid() });
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('SLOT_COOLDOWN');
    expect(Number(second.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(second.body.retry_after_ms).toBeGreaterThan(0);
  });
});

describe('slot: günlük sınırlar ve durum özeti', () => {
  it('günde en fazla 100 çevirme → 429 SLOT_DAILY_SPIN_LIMIT; İstanbul gece yarısı sıfırlanır', async () => {
    const u = await player(1000);
    const dayStart = istanbulDayStart(T0).getTime();
    // Bugün (oturum dışı: aralar > 30 dk değil ama sabah) 100 çevirme, net 0 (kayıp sınırına takılmasın)
    await seedSpins(
      u.id,
      Array.from({ length: SLOT.maxSpinsPerDay }, (_, i) => ({ bet: 5, win: 5, at: new Date(dayStart + 60_000 + i * 1000) }))
    );
    const info = await Slot.info(u.id, T0);
    expect(info.limits).toMatchObject({ spins_left_today: 0, max_bet_now: null });
    const err = await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: T0, rand: LOSE() }), 429, 'SLOT_DAILY_SPIN_LIMIT');
    expect(err.extra).toMatchObject({ limit: 100, spins_today: 100, resets_at: new Date(dayStart + DAY).toISOString() });
    // Ertesi gün açılır
    const next = await Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: new Date(dayStart + DAY + 3_600_000), rand: LOSE() });
    expect(next.stats.today.spins).toBe(1);
  });

  it('günlük net kayıp sınırı 250: sınırı aşacak bahis reddedilir, sınırda tamamen kapanır, gece yarısı açılır', async () => {
    const u = await player(1000);
    const dayStart = istanbulDayStart(T0).getTime();
    // Bu sabah net −240 (oturum dışı: 3 saat önce)
    await seedSpins(u.id, [
      { bet: 25, win: 0, at: new Date(T0.getTime() - 3 * 3_600_000) },
      ...Array.from({ length: 9 }, (_, i) => ({ bet: 25, win: 0, at: new Date(T0.getTime() - 3 * 3_600_000 + (i + 1) * 2000) })),
      { bet: 10, win: 20, at: new Date(T0.getTime() - 3 * 3_600_000 + 30_000) },
    ]);
    const info = await Slot.info(u.id, T0);
    expect(info.today.net).toBe(-240);
    expect(info.limits).toMatchObject({ loss_remaining_today: 10, max_bet_now: 10 });

    const err = await expectGameError(Slot.spin(u.id, { bet: 25, request_id: uuid() }, { now: T0, rand: LOSE() }), 429, 'SLOT_DAILY_LOSS_LIMIT');
    expect(err.extra).toMatchObject({ cap: 250, net_today: -240, loss_remaining: 10, max_bet: 10, resets_at: new Date(dayStart + DAY).toISOString() });

    const last = await Slot.spin(u.id, { bet: 10, request_id: uuid() }, { now: T0, rand: LOSE() });
    expect(last.stats.today.net).toBe(-250);
    expect(last.limits).toMatchObject({ loss_remaining_today: 0, max_bet_now: null });
    const closed = await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: at(5000), rand: LOSE() }), 429, 'SLOT_DAILY_LOSS_LIMIT');
    expect(closed.extra.max_bet).toBeNull();
    // Net kayıp asla sınırı aşmadı
    const today = await pool.query(`SELECT SUM(win) - SUM(bet) AS net FROM slot_spins WHERE user_id = $1 AND created_at >= $2`, [u.id, new Date(dayStart)]);
    expect(Number(today.rows[0].net)).toBe(-250);
    // Ertesi İstanbul günü
    const tomorrow = await Slot.spin(u.id, { bet: 25, request_id: uuid() }, { now: new Date(dayStart + DAY + 60_000), rand: LOSE() });
    expect(tomorrow.stats.today).toMatchObject({ spins: 1, net: -25 });
  });

  it('oturumda her 25 çevirmede durum özeti; onaysız sonraki çevirme → 409 SLOT_REALITY_CHECK', async () => {
    const u = await player(2000);
    // Oturumun ilk 24 çevirmesi (son 2 dk içinde, aralar < 30 dk); net 0 (günlük kayıp sınırına takılmasın)
    await seedSpins(
      u.id,
      Array.from({ length: 24 }, (_, i) => ({ bet: 25, win: 25, at: new Date(T0.getTime() - 120_000 + i * 2000) }))
    );
    const before = await Slot.info(u.id, T0);
    expect(before.session).toMatchObject({ spins: 24, reality_check_due: false });

    const s25 = await Slot.spin(u.id, { bet: 25, request_id: uuid() }, { now: T0, rand: PAIR() });
    // 25 çevirme × 25 jeton = 625 bahis → teorik beklenti −31 (gerçekleşen +25)
    expect(s25.reality_check).toEqual({ spins: 25, wagered: 625, won: 650, net: 25, expected_net: -31 });
    expect(s25.stats.session.reality_check_due).toBe(true);

    const blocked = await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: at(2000), rand: LOSE() }), 409, 'SLOT_REALITY_CHECK');
    expect(blocked.extra.session).toMatchObject({ spins: 25, expected_net: -31 });
    expect(await spinCount(u.id)).toBe(25);

    const s26 = await Slot.spin(u.id, { bet: 5, request_id: uuid(), reality_check_ack: true }, { now: at(2000), rand: LOSE() });
    expect(s26.reality_check).toBeNull();
    expect(s26.stats.session.spins).toBe(26);
    // Onay yalnızca o çevirme içindir; sonraki çevirmeler serbest
    await Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: at(4000), rand: LOSE() });
    // 30 dakikadan uzun ara → yeni oturum
    const fresh = await Slot.info(u.id, at(4000 + SLOT.sessionGapMs + 1000));
    expect(fresh.session).toMatchObject({ spins: 0, net: 0, reality_check_due: false });
  });
});

describe('slot: sorumlu oyun ve yönetici anahtarı', () => {
  it('18+ onayı ve mola zorunlu (Arena günlük tur sınırı uygulanmaz)', async () => {
    const u = await createUser();
    await GameService.award(u.id, { coins: 100, reason: 'dev_grant', ref_type: 'test', ref_id: uuid() });
    await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: T0 }), 403, 'ADULT_CONFIRM_REQUIRED');
    await confirmAdult(u.id);
    // Arena günlük tur sınırı (5) bugün dolmuş olsa da slot çalışır
    await ResponsiblePlay.update(u.id, { daily_round_limit: 5 });
    for (let i = 0; i < 5; i += 1) {
      const r = await pool.query(
        `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, seed)
         VALUES ('solo', $1, 'running', now(), now() + INTERVAL '60 seconds', 60, '["BTC"]'::jsonb, 1) RETURNING id`,
        [u.id]
      );
      await pool.query(`INSERT INTO arena_entries (round_id, user_id, cash, joined_at) VALUES ($1, $2, 10000, now())`, [r.rows[0].id, u.id]);
    }
    await expectGameError(ResponsiblePlay.assertCanPlay(u.id), 429, 'ARENA_PERSONAL_LIMIT');
    const now = new Date();
    await Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now, rand: LOSE() });
    await ResponsiblePlay.startBreak(u.id, '24h', now);
    const err = await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: new Date(now.getTime() + 60_000) }), 403, 'ARENA_BREAK');
    expect(typeof err.extra.break_until).toBe('string');

    const res = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 5, request_id: uuid() });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ARENA_BREAK');
  });

  it('API: GET bilgisi (tablo, RTP, sınırlar) ve doğrulama hataları', async () => {
    const u = await player(300);
    const res = await api().get('/api/game/slot').set(u.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ enabled: true, bets: [5, 10, 25], rtp_pct: 95, house_edge_pct: 5, coins: 300 });
    expect(d.paytable).toHaveLength(10);
    expect(d.paytable[0]).toMatchObject({ combo: '3× Yıldız', multiplier: 100, probability_pct: 0.0125, ways: 1, total_ways: 8000 });
    expect(d.limits).toMatchObject({ max_spins_per_day: 100, daily_loss_cap: 250, min_interval_ms: 1500, reality_check_every: 25, spins_left_today: 100, max_bet_now: 25 });
    expect(d.today).toEqual({ spins: 0, wagered: 0, won: 0, net: 0 });
    expect(d.lifetime).toMatchObject({ spins: 0, realized_rtp_pct: null });
    expect(d.history).toEqual([]);
    expect(d.reel_weights).toHaveLength(3);

    expect((await api().get('/api/game/slot')).status).toBe(401);
    const bad = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 7, request_id: uuid() });
    expect(bad.status).toBe(400);
    const badId = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 5, request_id: 'x' });
    expect(badId.status).toBe(400);
    // Çerezle CSRF başlığı olmadan POST reddedilir (Bearer muaf) — burada Bearer kullanılıyor

    const spin = await api().post('/api/game/slot/spin').set(u.auth).set(W).send({ bet: 10, request_id: uuid() });
    expect(spin.status).toBe(200);
    expect(spin.body.data.reels).toHaveLength(3);
    expect(spin.body.data.balance).toBe(300 - 10 + spin.body.data.win);
    const after = (await api().get('/api/game/slot').set(u.auth)).body.data;
    expect(after.history).toEqual([{ n: 1, wagered: 10, won: spin.body.data.win }]);
    expect(after.lifetime.spins).toBe(1);
  });

  it('geçmiş grafiği en fazla ~200 örnek nokta, son nokta toplamla aynı', async () => {
    const u = await player(0);
    await seedSpins(
      u.id,
      Array.from({ length: 450 }, (_, i) => ({ bet: 5, win: i % 2 ? 10 : 0, at: new Date(T0.getTime() - 5 * DAY + i * 60_000) }))
    );
    const info = await Slot.info(u.id, T0);
    expect(info.history.length).toBeLessThanOrEqual(202);
    expect(info.history[0]).toEqual({ n: 1, wagered: 5, won: 0 });
    expect(info.history[info.history.length - 1]).toEqual({ n: 450, wagered: 2250, won: 2250 });
    expect(info.lifetime).toMatchObject({ spins: 450, realized_rtp_pct: 100 });
  });

  it('kapatma anahtarı: kapalıyken 410 SLOT_DISABLED; yönetici API + denetim kaydı + özet', async () => {
    const u = await player(300);
    const admin = await createUser();
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    try {
      // Kayıt yok → geliştirme/test varsayılanı açık; SLOT_ENABLED_DEFAULT ezer
      await pool.query(`DELETE FROM app_settings WHERE key = $1`, [SLOT.settingKey]);
      expect(await slotFlag()).toMatchObject({ enabled: true, source: 'default' });
      process.env.SLOT_ENABLED_DEFAULT = '0';
      expect((await slotFlag()).enabled).toBe(false);
      delete process.env.SLOT_ENABLED_DEFAULT;

      expect((await api().get('/api/admin/game/slot').set(u.auth)).status).toBe(403);
      expect((await api().put('/api/admin/game/slot').set(u.auth).send({ enabled: false })).status).toBe(403);

      const off = await api().put('/api/admin/game/slot').set(admin.auth).send({ enabled: false });
      expect(off.status).toBe(200);
      expect(off.body.data).toMatchObject({ enabled: false, source: 'setting', updated_by_username: admin.username });

      const get = await api().get('/api/game/slot').set(u.auth);
      expect(get.status).toBe(410);
      expect(get.body).toMatchObject({ success: false, code: 'SLOT_DISABLED', enabled: false });
      // 410 varsayılan olarak önbelleklenebilir: yeniden açılınca tarayıcı eski yanıtı göstermesin
      expect(get.headers['cache-control']).toBe('no-store');
      const spin = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 5, request_id: uuid() });
      expect(spin.status).toBe(410);
      expect(spin.body.code).toBe('SLOT_DISABLED');
      await expectGameError(Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: T0 }), 410, 'SLOT_DISABLED');

      const audit = await pool.query(
        `SELECT action, target_type, target_id, target_label, metadata FROM admin_audit_log WHERE admin_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [admin.id]
      );
      expect(audit.rows[0]).toMatchObject({
        action: 'settings.slot_toggle',
        target_type: 'setting',
        target_id: 'slot_enabled',
        target_label: 'Slot Makinesi: kapalı',
        metadata: { enabled: false, previous: true },
      });

      const on = await api().put('/api/admin/game/slot').set(admin.auth).send({ enabled: true });
      expect(on.body.data.enabled).toBe(true);
      expect((await api().put('/api/admin/game/slot').set(admin.auth).send({ enabled: 'yes' })).status).toBe(400);

      // Özet: tüm oyuncuların toplamı (en az bu kullanıcının çevirmesi)
      const s = await api().post('/api/game/slot/spin').set(u.auth).send({ bet: 25, request_id: uuid() });
      expect(s.status).toBe(200);
      const summary = (await api().get('/api/admin/game/slot').set(admin.auth)).body.data;
      expect(summary.config).toMatchObject({ rtp_pct: 95, house_edge_pct: 5, daily_loss_cap: 250 });
      expect(summary.total.spins).toBeGreaterThan(0);
      expect(summary.total.players).toBeGreaterThan(0);
      const agg = (await pool.query(`SELECT SUM(bet)::bigint AS w, SUM(win)::bigint AS won FROM slot_spins`)).rows[0];
      expect(summary.total.wagered).toBe(Number(agg.w));
      expect(summary.total.realized_rtp_pct).toBe(Math.round((Number(agg.won) / Number(agg.w)) * 1_000_000) / 10_000);
      expect(summary.today.spins).toBeGreaterThan(0);
      await expect(AppSettings.get(SLOT.settingKey)).resolves.toMatchObject({ value: true });
    } finally {
      delete process.env.SLOT_ENABLED_DEFAULT;
      await pool.query(`DELETE FROM app_settings WHERE key = $1`, [SLOT.settingKey]);
    }
  });
});

describe('slot: KVKK', () => {
  it('veri indirmede slot_spins bölümü var; hesap silmede çevirmeler silinir', async () => {
    const u = await player(100);
    await Slot.spin(u.id, { bet: 5, request_id: uuid() }, { now: T0, rand: PAIR() });
    const exp = await AccountExportService.build(u.id);
    expect(exp.meta.sections.slot_spins).toMatch(/Slot/);
    expect(exp.slot_spins).toEqual([expect.objectContaining({ bet: 5, win: 10, combo: 'pair', reels: ['boga', 'boga', 'ayi'] })]);

    await AccountDeletionService.deleteAccount(u.id, { password: 'test-password-123' });
    expect(await spinCount(u.id)).toBe(0);
  });
});
