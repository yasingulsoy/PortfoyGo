import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { api, createUser, pool, setMarketPrice, TestUser, uniqueSymbol } from './helpers';
import { AuthService } from '../src/services/auth';
import { arenaEvents } from '../src/services/arena/events';
import { clearAvailabilityCache } from '../src/services/arena/instruments';
import { GameError, istanbulDay } from '../src/services/game/common';
import { QuestKey } from '../src/services/game/config';
import { Ledger } from '../src/services/game/ledger';
import { GameListeners } from '../src/services/game/listeners';
import { Quests, questsForDay } from '../src/services/game/quests';
import { ResponsiblePlay } from '../src/services/game/responsible';
import { GameService } from '../src/services/game/service';
import { Shop } from '../src/services/game/shop';
import { Streak } from '../src/services/game/streak';
import { Wheel } from '../src/services/game/wheel';

// Paylaşılan PGlite (test/globalSetup.ts). Oyun dinleyicileri app (helpers) yüklenince arenaEvents'e kaydolur.

const DAY = 24 * 60 * 60 * 1000;

/** Bugünün görevleri arasında `keys` olan bir kullanıcı (id seçilerek eklenir) */
async function createUserWithQuests(keys: QuestKey[]): Promise<TestUser> {
  const today = istanbulDay();
  let id = crypto.randomUUID();
  for (let i = 0; i < 5000; i++) {
    const set = questsForDay(id, today).map((q) => q.key);
    if (keys.every((k) => set.includes(k))) break;
    id = crypto.randomUUID();
  }
  const username = `g_${crypto.randomBytes(4).toString('hex')}`;
  const hash = await bcrypt.hash('test-password-123', 4);
  await pool.query(
    `INSERT INTO users (id, username, email, password_hash, email_verified, balance) VALUES ($1, $2, $3, $4, TRUE, 100000)`,
    [id, username, `${username}@test.local`, hash]
  );
  const token = AuthService.signSessionToken(id, 0);
  return { id, username, email: `${username}@test.local`, token, auth: { Authorization: `Bearer ${token}` } };
}

async function user(id: string) {
  const r = await pool.query(`SELECT coins, xp, arena_rating, avatar_id, frame_id, title_id FROM users WHERE id = $1`, [id]);
  return { coins: Number(r.rows[0].coins), xp: Number(r.rows[0].xp), rating: Number(r.rows[0].arena_rating), ...r.rows[0] };
}

async function ledgerRows(id: string) {
  const r = await pool.query(`SELECT coins, xp, reason, ref_type, ref_id FROM game_ledger WHERE user_id = $1 ORDER BY id`, [id]);
  return r.rows.map((x: any) => ({ ...x, coins: Number(x.coins), xp: Number(x.xp) }));
}

async function notifTypes(id: string): Promise<string[]> {
  const r = await pool.query(`SELECT type FROM notifications WHERE user_id = $1 ORDER BY created_at`, [id]);
  return r.rows.map((x: any) => x.type);
}

async function questRow(id: string, key: string) {
  const r = await pool.query(`SELECT progress, target, completed_at, claimed_at FROM game_quests WHERE user_id = $1 AND day = $2::date AND quest_key = $3`, [
    id,
    istanbulDay(),
    key,
  ]);
  return r.rows[0];
}

async function expectGameError(p: Promise<unknown>, status: number, code: string): Promise<GameError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).status).toBe(status);
    expect((err as GameError).code).toBe(code);
    return err as GameError;
  }
  throw new Error(`Beklenen hata gelmedi: ${code}`);
}

async function confirmAdult(id: string) {
  await ResponsiblePlay.confirmAdult(id);
}

/** Bugün için (İstanbul) n arena turu + katılım (isteğe bağlı bitmiş, getiri ile) */
async function insertRounds(userId: string, returns: (number | null)[], opts: { minutesAgoStart?: number } = {}) {
  let minutes = opts.minutesAgoStart ?? returns.length + 1;
  const ids: string[] = [];
  for (const ret of returns) {
    const r = await pool.query(
      `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, seed, finished_at)
       VALUES ('solo', $1, $2::text, now() - ($3::int * INTERVAL '1 minute'), now() - ($3::int * INTERVAL '1 minute') + INTERVAL '60 seconds',
               60, '["BTC"]'::jsonb, 1, CASE WHEN $2::text = 'finished' THEN now() - ($3::int * INTERVAL '1 minute') + INTERVAL '60 seconds' END)
       RETURNING id`,
      [userId, ret === null ? 'running' : 'finished', minutes]
    );
    const id = r.rows[0].id as string;
    await pool.query(
      `INSERT INTO arena_entries (round_id, user_id, cash, return_pct, joined_at) VALUES ($1, $2, 10000, $3, now() - ($4::int * INTERVAL '1 minute'))`,
      [id, userId, ret, minutes]
    );
    ids.push(id);
    minutes -= 1;
  }
  return ids;
}

const W = { 'X-Requested-With': 'PortfoyGo' };

// ---------------------------------------------------------------------------

describe('defter (ledger)', () => {
  it('ref verilince idempotent; ref yoksa her çağrı yeni satır', async () => {
    const u = await createUser();
    const a = await GameService.award(u.id, { coins: 30, xp: 5, reason: 'idle_collect', ref_type: 'idle', ref_id: 'r1' });
    expect(a).toMatchObject({ awarded: true, coins: 30, xp: 5, balance: { coins: 30, xp: 5 } });
    const b = await GameService.award(u.id, { coins: 30, xp: 5, reason: 'idle_collect', ref_type: 'idle', ref_id: 'r1' });
    expect(b).toMatchObject({ awarded: false, coins: 0, xp: 0, balance: { coins: 30, xp: 5 } });
    // Farklı reason aynı ref → ayrı
    expect((await GameService.award(u.id, { coins: 1, reason: 'other', ref_type: 'idle', ref_id: 'r1' }))?.awarded).toBe(true);
    await GameService.award(u.id, { coins: 2, reason: 'misc' });
    await GameService.award(u.id, { coins: 2, reason: 'misc' });
    expect((await user(u.id)).coins).toBe(30 + 1 + 4);
    expect(await ledgerRows(u.id)).toHaveLength(4);
    // Negatif değerler 0'a çekilir
    await GameService.award(u.id, { coins: -500, reason: 'neg' });
    expect((await user(u.id)).coins).toBe(35);
  });

  it('hata fırlatmaz: geçersiz kullanıcı → null', async () => {
    expect(await GameService.award('00000000-0000-0000-0000-000000000000', { coins: 5, reason: 'x', ref_type: 't', ref_id: '1' })).toBeNull();
    expect(await GameService.award('not-a-uuid', { coins: 5, reason: 'x' })).toBeNull();
  });

  it('çağıranın transaction içinde SAVEPOINT ile; ROLLBACK ödülü geri alır, COMMIT kalıcı yapar', async () => {
    // NOT: Hatalı ödülün çağıranın transaction'ını bozmaması (ROLLBACK TO SAVEPOINT) gerçek PostgreSQL'de
    // geçerlidir; test sunucusu (src/dev/pgliteServer.ts) transaction içindeki extended-protocol hatasından
    // sonra protokol eşzamanlılığını kaybettiği için burada DB hatası tetiklenmez.
    const u = await createUser();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      expect((await GameService.award(u.id, { coins: 10, reason: 'tx', ref_type: 't', ref_id: '1' }, c))?.awarded).toBe(true);
      expect((await GameService.award(u.id, { coins: 10, reason: 'tx', ref_type: 't', ref_id: '1' }, c))?.awarded).toBe(false);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    expect((await user(u.id)).coins).toBe(0);

    const c2 = await pool.connect();
    try {
      await c2.query('BEGIN');
      await GameService.award(u.id, { coins: 10, reason: 'tx', ref_type: 't', ref_id: '1' }, c2);
      await c2.query('COMMIT');
      // transaction dışındaki client: kendi BEGIN/COMMIT'i
      expect((await GameService.award(u.id, { coins: 5, reason: 'tx', ref_type: 't', ref_id: '2' }, c2))?.awarded).toBe(true);
    } finally {
      c2.release();
    }
    expect((await user(u.id)).coins).toBe(15);
  });

  it('seviye atlama: +50 jeton (seviye başına bir kez) ve game.level_up bildirimi', async () => {
    const u = await createUser();
    const r = await GameService.award(u.id, { xp: 400, reason: 'test_xp' }); // 0 → 400 XP: seviye 1 → 3
    expect(r).toMatchObject({ level_before: 1, level_after: 3, level_up_coins: 100 });
    expect((await user(u.id)).coins).toBe(100);
    const rows = await ledgerRows(u.id);
    expect(rows.filter((x) => x.reason === 'level_up').map((x) => x.ref_id)).toEqual(['2', '3']);
    const n = await pool.query(`SELECT title, category FROM notifications WHERE user_id = $1 AND type = 'game.level_up'`, [u.id]);
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0]).toMatchObject({ title: "Seviye 3'e ulaştın! +100 jeton", category: 'competition' });
  });
});

describe('günlük görevler', () => {
  it('ilerleme, tamamlama bildirimi, ödülü bir kez alma', async () => {
    const u = await createUserWithQuests(['main_buy', 'arena_3_instruments']);
    const list = await api().get('/api/game/quests').set(u.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.day).toBe(istanbulDay());
    expect(list.body.data.items).toHaveLength(3);
    expect(list.body.data.items.map((i: any) => i.key)).toEqual(questsForDay(u.id, istanbulDay()).map((q) => q.key));
    const item = list.body.data.items.find((i: any) => i.key === 'main_buy');
    expect(item).toMatchObject({ title: 'Yatırımcı', progress: 0, target: 1, completed: false, claimed: false, reward: { coins: 30, xp: 20 } });

    // Tamamlanmadan ödül alınamaz
    const early = await api().post('/api/game/quests/main_buy/claim').set(u.auth);
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('QUEST_NOT_COMPLETED');

    expect(await Quests.progress(u.id, 'main_buy')).toBe(true);
    expect(await Quests.progress(u.id, 'main_buy')).toBe(false); // zaten tamam
    expect(await notifTypes(u.id)).toContain('game.quest_completed');

    // Çok adımlı görev: setAtLeast
    expect(await Quests.setAtLeast(u.id, 'arena_3_instruments', 2)).toBe(false);
    expect((await questRow(u.id, 'arena_3_instruments')).progress).toBe(2);
    expect(await Quests.setAtLeast(u.id, 'arena_3_instruments', 1)).toBe(false);
    expect((await questRow(u.id, 'arena_3_instruments')).progress).toBe(2);
    expect(await Quests.setAtLeast(u.id, 'arena_3_instruments', 5)).toBe(true);
    expect((await questRow(u.id, 'arena_3_instruments')).progress).toBe(3);

    const prof = await api().get('/api/game/profile').set(u.auth);
    expect(prof.body.data.quests).toEqual({ unclaimed: 2, completed_today: 2, total_today: 3 });

    const claim = await api().post('/api/game/quests/main_buy/claim').set(u.auth);
    expect(claim.status).toBe(200);
    expect(claim.body.data.reward).toEqual({ coins: 30, xp: 20 });
    expect(claim.body.data.profile).toMatchObject({ coins: 30, xp: 20 });
    expect(claim.body.data.profile.quests.unclaimed).toBe(1);

    const again = await api().post('/api/game/quests/main_buy/claim').set(u.auth);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('QUEST_ALREADY_CLAIMED');
    expect((await ledgerRows(u.id)).filter((x) => x.reason === 'quest')).toHaveLength(1);
  });

  it('bugün seçili olmayan görev: ilerleme no-op, ödül 404; geçersiz anahtar 400', async () => {
    const u = await createUser();
    const today = questsForDay(u.id, istanbulDay()).map((q) => q.key);
    const other = (['arena_profit_round', 'arena_use_sl', 'arena_3_instruments', 'duel_play', 'duel_win', 'main_buy', 'challenge_join', 'idle_collect'] as const).find(
      (k) => !today.includes(k)
    )!;
    expect(await GameService.progressQuest(u.id, other)).toBe(false);
    const r = await api().post(`/api/game/quests/${other}/claim`).set(u.auth);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('QUEST_NOT_FOUND');
    expect((await api().post('/api/game/quests/nope/claim').set(u.auth)).status).toBe(400);
    expect(await GameService.progressQuest(u.id, 'nope')).toBe(false);
  });
});

describe('günlük seri', () => {
  it('İstanbul gece yarısında artar, aynı gün tekrar artmaz, gün atlanırsa sıfırlanır', async () => {
    const u = await createUser();
    expect(await Streak.touch(u.id, undefined, new Date('2026-03-01T20:59:00Z'))).toMatchObject({ current: 1, changed: true }); // İst. 1 Mart 23:59
    expect(await Streak.touch(u.id, undefined, new Date('2026-03-01T21:01:00Z'))).toMatchObject({ current: 2, changed: true }); // İst. 2 Mart 00:01
    expect(await Streak.touch(u.id, undefined, new Date('2026-03-02T20:30:00Z'))).toMatchObject({ current: 2, changed: false });
    expect(await Streak.get(u.id, pool, new Date('2026-03-02T20:30:00Z'))).toEqual({ current: 2, best: 2, today_done: true });
    expect(await Streak.get(u.id, pool, new Date('2026-03-03T09:00:00Z'))).toEqual({ current: 2, best: 2, today_done: false });
    expect(await Streak.get(u.id, pool, new Date('2026-03-04T09:00:00Z'))).toEqual({ current: 0, best: 2, today_done: false });
    expect(await Streak.touch(u.id, undefined, new Date('2026-03-04T09:00:00Z'))).toMatchObject({ current: 1, best: 2 });
  });

  it('7. gün bonusu: +100 jeton ve +1 çark hakkı (bir kez)', async () => {
    const u = await createUser();
    const base = Date.parse('2026-04-01T09:00:00Z');
    let last: any;
    for (let i = 0; i < 7; i++) last = await Streak.touch(u.id, undefined, new Date(base + i * DAY));
    expect(last).toMatchObject({ current: 7, bonus: true });
    expect((await user(u.id)).coins).toBe(100);
    const w = await pool.query('SELECT extra_spins FROM game_wheel WHERE user_id = $1', [u.id]);
    expect(Number(w.rows[0].extra_spins)).toBe(1);
    expect((await ledgerRows(u.id)).filter((x) => x.reason === 'streak_bonus')).toEqual([
      { coins: 100, xp: 0, reason: 'streak_bonus', ref_type: 'streak_day', ref_id: '2026-04-07' },
    ]);
    expect(await notifTypes(u.id)).toContain('game.streak_bonus');
    // Aynı gün tekrar: değişiklik yok
    expect(await Streak.touch(u.id, undefined, new Date(base + 6 * DAY + 3600_000))).toMatchObject({ changed: false, bonus: false });
    expect((await user(u.id)).coins).toBe(100);
  });
});

describe('şans çarkı', () => {
  it('18+ onayı ister; ücretsiz → ek hak → NO_SPINS; mola sırasında kapalı', async () => {
    const u = await createUser();
    const now = new Date('2026-05-10T10:00:00Z');
    await expectGameError(Wheel.spin(u.id, { now, rand: () => 0 }), 403, 'ADULT_CONFIRM_REQUIRED');
    await confirmAdult(u.id);

    const first = await Wheel.spin(u.id, { now, rand: () => 0 }); // 20 jeton
    expect(first).toMatchObject({ segment_index: 0, free: true, reward: { coins: 20 } });
    expect(first.segment).toMatchObject({ id: 'coins-20', kind: 'coins', amount: 20, probability_pct: 28 });
    expect((await user(u.id)).coins).toBe(20);

    const none = await expectGameError(Wheel.spin(u.id, { now, rand: () => 0 }), 429, 'NO_SPINS');
    expect(none.extra.next_free_at).toBe('2026-05-10T21:00:00.000Z');

    await pool.query('UPDATE game_wheel SET extra_spins = 1 WHERE user_id = $1', [u.id]);
    const extra = await Wheel.spin(u.id, { now, rand: () => 30 }); // 30 XP
    expect(extra).toMatchObject({ free: false, reward: { xp: 30 } });
    expect((await user(u.id)).xp).toBe(30);

    // +1 çevirme dilimi
    await pool.query('UPDATE game_wheel SET extra_spins = 1 WHERE user_id = $1', [u.id]);
    const plus = await Wheel.spin(u.id, { now, rand: () => 90 });
    expect(plus.reward).toEqual({ extra_spin: 1 });
    expect((await Wheel.info(u.id, now)).extra_spins).toBe(1);

    // Ertesi gün yeni ücretsiz hak (ek hak korunur)
    const tomorrow = new Date(now.getTime() + DAY);
    const info = await Wheel.info(u.id, tomorrow);
    expect(info).toMatchObject({ free_available: true, extra_spins: 1, next_free_at: null });
    expect(info.segments).toHaveLength(8);
    expect(info.disclaimer).toMatch(/ücretsiz/);
    expect((await Wheel.spin(u.id, { now: tomorrow, rand: () => 0 })).free).toBe(true);

    const spins = await pool.query('SELECT segment_id, free, reward FROM game_spins WHERE user_id = $1 ORDER BY created_at', [u.id]);
    expect(spins.rows.map((r: any) => r.segment_id)).toEqual(['coins-20', 'xp-30', 'spin-1', 'coins-20']);
    expect(spins.rows.map((r: any) => r.free)).toEqual([true, false, false, true]);

    await ResponsiblePlay.startBreak(u.id, '24h', tomorrow);
    await expectGameError(Wheel.spin(u.id, { now: tomorrow, rand: () => 0 }), 403, 'ARENA_BREAK');
  });

  it('kozmetik dilimi: ilk seferde çerçeve, tekrarında 150 jeton', async () => {
    const u = await createUser();
    await confirmAdult(u.id);
    const now = new Date('2026-05-11T10:00:00Z');
    const a = await Wheel.spin(u.id, { now, rand: () => 99 });
    expect(a.segment).toMatchObject({ id: 'frame-wheel', kind: 'cosmetic', item_id: 'frame-wheel' });
    expect(a.reward).toEqual({ item_id: 'frame-wheel' });
    await pool.query('UPDATE game_wheel SET extra_spins = 1 WHERE user_id = $1', [u.id]);
    const b = await Wheel.spin(u.id, { now, rand: () => 99 });
    expect(b.reward).toEqual({ converted_coins: 150 });
    expect((await user(u.id)).coins).toBe(150);
    const inv = await pool.query('SELECT item_id FROM game_inventory WHERE user_id = $1', [u.id]);
    expect(inv.rows.map((r: any) => r.item_id)).toEqual(['frame-wheel']);
  });

  it('API: GET /wheel ve POST /wheel/spin', async () => {
    const u = await createUser();
    const info = await api().get('/api/game/wheel').set(u.auth);
    expect(info.status).toBe(200);
    expect(info.body.data.segments.reduce((s: number, x: any) => s + x.probability_pct, 0)).toBeCloseTo(100);
    expect(info.body.data.free_available).toBe(true);

    const denied = await api().post('/api/game/wheel/spin').set(u.auth);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ADULT_CONFIRM_REQUIRED');

    expect((await api().post('/api/game/responsible/confirm-adult').set(u.auth).send({ confirm: false })).status).toBe(400);
    const ok = await api().post('/api/game/responsible/confirm-adult').set(u.auth).send({ confirm: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.adult_confirmed).toBe(true);

    const spin = await api().post('/api/game/wheel/spin').set(u.auth);
    expect(spin.status).toBe(200);
    expect(spin.body.data.segment_index).toBeGreaterThanOrEqual(0);
    expect(spin.body.data.segment.id).toBeTruthy();
    expect(spin.body.data.profile.spins.free_available).toBe(false);

    const extra = spin.body.data.reward.extra_spin ? 1 : 0;
    for (let i = 0; i < extra; i++) await api().post('/api/game/wheel/spin').set(u.auth);
    await pool.query('UPDATE game_wheel SET extra_spins = 0 WHERE user_id = $1', [u.id]);
    const no = await api().post('/api/game/wheel/spin').set(u.auth);
    expect(no.status).toBe(429);
    expect(no.body.code).toBe('NO_SPINS');
    expect(no.body.next_free_at).toBeTruthy();
    expect(no.headers['retry-after']).toBeTruthy();
  });
});

describe('mağaza ve kozmetikler', () => {
  it('satın alma, kilitler, kuşanma', async () => {
    const u = await createUser();
    const shop = await api().get('/api/game/shop').set(u.auth);
    expect(shop.status).toBe(200);
    const byId = (id: string) => shop.body.data.items.find((i: any) => i.id === id);
    expect(byId('avatar-1')).toMatchObject({ owned: true, equipped: true, price_coins: null, unlock: { type: 'default' } });
    expect(byId('avatar-4')).toMatchObject({ owned: false, price_coins: 100, unlock: { type: 'coins', value: 100 }, rarity: 'common' });
    expect(byId('frame-bronze')).toMatchObject({ owned: true, unlock: { type: 'tier', value: 'bronze' } });
    expect(byId('frame-gold')).toMatchObject({ owned: false, unlock: { type: 'tier', value: 'gold' } });
    expect(byId('frame-wheel')).toMatchObject({ owned: false, price_coins: null, unlock: { type: 'wheel' }, rarity: 'legendary' });

    const poor = await api().post('/api/game/shop/avatar-4/buy').set(u.auth);
    expect(poor.status).toBe(400);
    expect(poor.body.code).toBe('INSUFFICIENT_COINS');

    await GameService.award(u.id, { coins: 1000, reason: 'test' });
    const buy = await api().post('/api/game/shop/avatar-4/buy').set(u.auth);
    expect(buy.status).toBe(200);
    expect(buy.body.data.profile.coins).toBe(900);
    expect(buy.body.data.item).toMatchObject({ id: 'avatar-4', owned: true });
    expect((await ledgerRows(u.id)).find((x) => x.reason === 'shop_purchase')).toMatchObject({ coins: -100, ref_type: 'item', ref_id: 'avatar-4' });

    expect((await api().post('/api/game/shop/avatar-4/buy').set(u.auth)).status).toBe(409);
    expect((await api().post('/api/game/shop/avatar-1/buy').set(u.auth)).status).toBe(409);
    const wheelOnly = await api().post('/api/game/shop/frame-wheel/buy').set(u.auth);
    expect(wheelOnly.status).toBe(403);
    expect(wheelOnly.body.code).toBe('ITEM_LOCKED');
    const tierLocked = await api().post('/api/game/shop/frame-gold/buy').set(u.auth);
    expect(tierLocked.status).toBe(403);
    expect(tierLocked.body.required_tier).toBe('gold');
    expect((await api().post('/api/game/shop/nope-1/buy').set(u.auth)).status).toBe(404);

    // Kademe çerçevesi: kademeye ulaşınca ücretsiz
    await pool.query('UPDATE users SET arena_rating = 1300 WHERE id = $1', [u.id]);
    const gold = await api().post('/api/game/shop/frame-gold/buy').set(u.auth);
    expect(gold.status).toBe(200);
    expect(gold.body.data.profile.coins).toBe(900);

    // Kuşanma
    const eq = await api().post('/api/game/cosmetics/equip').set(u.auth).send({ avatar_id: 'avatar-4', frame_id: 'frame-gold' });
    expect(eq.status).toBe(200);
    expect(eq.body.data.profile).toMatchObject({ avatar_id: 'avatar-4', frame_id: 'frame-gold', title: null });
    expect((await api().post('/api/game/cosmetics/equip').set(u.auth).send({ avatar_id: 'avatar-5' })).body.code).toBe('ITEM_NOT_OWNED');
    expect((await api().post('/api/game/cosmetics/equip').set(u.auth).send({ title_id: 'title-boga' })).status).toBe(403);
    expect((await api().post('/api/game/cosmetics/equip').set(u.auth).send({ frame_id: 'avatar-2' })).body.code).toBe('INVALID_ITEM');
    expect((await api().post('/api/game/cosmetics/equip').set(u.auth).send({})).status).toBe(400);

    await api().post('/api/game/shop/title-boga/buy').set(u.auth).expect(200);
    const t = await api().post('/api/game/cosmetics/equip').set(u.auth).send({ title_id: 'title-boga', frame_id: null });
    expect(t.body.data.profile).toMatchObject({ frame_id: null, title: { id: 'title-boga', label: 'Boğa' }, coins: 700 });

    // Reyting düşse de kazanılmış kademe çerçevesi kalır
    await pool.query('UPDATE users SET arena_rating = 1000 WHERE id = $1', [u.id]);
    const after = await Shop.list(u.id);
    expect(after.items.find((i) => i.id === 'frame-gold')?.owned).toBe(true);
  });

  it('eşzamanlı satın almalar jetonu eksiye düşürmez', async () => {
    const u = await createUser();
    await GameService.award(u.id, { coins: 300, reason: 'test' });
    const results = await Promise.allSettled([Shop.buy(u.id, 'avatar-7'), Shop.buy(u.id, 'avatar-8'), Shop.buy(u.id, 'avatar-9')]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    expect((await user(u.id)).coins).toBeGreaterThanOrEqual(0);
  });
});

describe('sorumlu oyun', () => {
  it('assertCanPlay: 18+ → mola → kişisel günlük sınır', async () => {
    const u = await createUser();
    await expectGameError(ResponsiblePlay.assertCanPlay(u.id), 403, 'ADULT_CONFIRM_REQUIRED');
    await confirmAdult(u.id);
    await expect(ResponsiblePlay.assertCanPlay(u.id)).resolves.toBeUndefined();

    await ResponsiblePlay.update(u.id, { daily_round_limit: 5 });
    await insertRounds(u.id, [null, null, null, null]);
    await expect(ResponsiblePlay.assertCanPlay(u.id)).resolves.toBeUndefined();
    await insertRounds(u.id, [null]);
    const lim = await expectGameError(ResponsiblePlay.assertCanPlay(u.id), 429, 'ARENA_PERSONAL_LIMIT');
    expect(lim.extra).toMatchObject({ limit: 5, rounds_today: 5 });
    expect((await ResponsiblePlay.getSettings(u.id)).rounds_today).toBe(5);

    // Dünkü turlar sayılmaz
    await pool.query(`UPDATE arena_entries SET joined_at = now() - INTERVAL '2 days' WHERE user_id = $1`, [u.id]);
    await expect(ResponsiblePlay.assertCanPlay(u.id)).resolves.toBeUndefined();

    // Sınırı kaldır
    await ResponsiblePlay.update(u.id, { daily_round_limit: null });
    expect((await ResponsiblePlay.getSettings(u.id)).daily_round_limit).toBeNull();

    const s = await ResponsiblePlay.startBreak(u.id, '24h');
    expect(Date.parse(s.break_until!)).toBeGreaterThan(Date.now() + 23 * 3600_000);
    const br = await expectGameError(ResponsiblePlay.assertCanPlay(u.id), 403, 'ARENA_BREAK');
    expect(br.extra.break_until).toBe(s.break_until);
  });

  it('mola kısaltılamaz; süresi geçince oynanabilir', async () => {
    const u = await createUser();
    await confirmAdult(u.id);
    const long = await ResponsiblePlay.startBreak(u.id, '7d');
    const short = await ResponsiblePlay.startBreak(u.id, '24h');
    expect(short.break_until).toBe(long.break_until);
    const later = new Date(Date.now() + 8 * DAY);
    await expect(ResponsiblePlay.assertCanPlay(u.id, pool, later)).resolves.toBeUndefined();
    const logs = await pool.query(`SELECT activity_type FROM activity_logs WHERE user_id = $1 AND activity_type = 'game_break'`, [u.id]);
    expect(logs.rows).toHaveLength(2);
  });

  it('lossStreak: en son art arda zararlı turlar', async () => {
    const u = await createUser();
    expect(await ResponsiblePlay.lossStreak(u.id)).toBe(0);
    await insertRounds(u.id, [1.5, -0.5, -2, -0.1]); // eskiden yeniye
    expect(await ResponsiblePlay.lossStreak(u.id)).toBe(3);
    await insertRounds(u.id, [0.2], { minutesAgoStart: 0 });
    expect(await ResponsiblePlay.lossStreak(u.id)).toBe(0);
  });

  it('uçtan uca: POST /api/arena/rounds gerçek kontrolden geçer (18+ → mola → kişisel sınır)', async () => {
    // BTCUSD için saatlik fiyat geçmişi (arena.test.ts ile aynı desen; ON CONFLICT DO NOTHING)
    const HOUR = 3_600_000;
    const start = Math.floor(Date.now() / HOUR) * HOUR - 100 * HOUR;
    const times = Array.from({ length: 100 }, (_, i) => new Date(start + i * HOUR).toISOString());
    const prices = times.map((_, i) => Number((118_000 * (1 + 0.02 * Math.sin(i / 4))).toPrecision(10)));
    await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency)
       SELECT 'crypto', 'BTC', 'hour', x.bs, x.p, 'USD' FROM unnest($1::timestamptz[], $2::numeric[]) AS x(bs, p)
       ON CONFLICT DO NOTHING`,
      [times, prices]
    );
    clearAvailabilityCache();
    const body = { duration_s: 60, instruments: ['BTCUSD'] };

    const u = await createUser();
    const denied = await api().post('/api/arena/rounds').set(u.auth).send(body);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ADULT_CONFIRM_REQUIRED');
    await api().post('/api/game/responsible/confirm-adult').set(u.auth).send({ confirm: true }).expect(200);
    expect((await api().post('/api/arena/rounds').set(u.auth).send(body)).status).toBe(201);

    const onBreak = await createUser();
    await confirmAdult(onBreak.id);
    await api().post('/api/game/responsible/break').set(onBreak.auth).send({ duration: '24h' }).expect(200);
    const br = await api().post('/api/arena/rounds').set(onBreak.auth).send(body);
    expect(br.status).toBe(403);
    expect(br.body.code).toBe('ARENA_BREAK');
    expect(br.body.break_until).toBeTruthy();

    const limited = await createUser();
    await confirmAdult(limited.id);
    await api().put('/api/game/responsible').set(limited.auth).send({ daily_round_limit: 5 }).expect(200);
    await insertRounds(limited.id, [0.1, 0.2, -0.1, 0.3, 0.4]);
    const lim = await api().post('/api/arena/rounds').set(limited.auth).send(body);
    expect(lim.status).toBe(429);
    expect(lim.body.code).toBe('ARENA_PERSONAL_LIMIT');
  });

  it('API: GET/PUT /responsible, confirm-adult, break', async () => {
    const u = await createUser();
    const g = await api().get('/api/game/responsible').set(u.auth);
    expect(g.status).toBe(200);
    expect(g.body.data).toMatchObject({ adult_confirmed: false, daily_round_limit: null, session_reminder_minutes: null, break_until: null, rounds_today: 0, loss_streak: 0 });
    expect(g.body.data.options).toMatchObject({ daily_round_limit: { min: 5, max: 50 }, session_reminder_minutes: [15, 30, 60] });

    expect((await api().put('/api/game/responsible').set(u.auth).send({ daily_round_limit: 4 })).status).toBe(400);
    expect((await api().put('/api/game/responsible').set(u.auth).send({ daily_round_limit: 51 })).status).toBe(400);
    expect((await api().put('/api/game/responsible').set(u.auth).send({ session_reminder_minutes: 20 })).status).toBe(400);
    expect((await api().put('/api/game/responsible').set(u.auth).send({})).status).toBe(400);
    const p = await api().put('/api/game/responsible').set(u.auth).send({ daily_round_limit: 10, session_reminder_minutes: 30 });
    expect(p.status).toBe(200);
    expect(p.body.data).toMatchObject({ daily_round_limit: 10, session_reminder_minutes: 30 });
    const p2 = await api().put('/api/game/responsible').set(u.auth).send({ session_reminder_minutes: null });
    expect(p2.body.data).toMatchObject({ daily_round_limit: 10, session_reminder_minutes: null });

    expect((await api().post('/api/game/responsible/break').set(u.auth).send({ duration: '1h' })).status).toBe(400);
    const b = await api().post('/api/game/responsible/break').set(u.auth).send({ duration: '24h' });
    expect(b.status).toBe(200);
    expect(b.body.data.break_until).toBeTruthy();

    // Çerezle gelen istekte CSRF başlığı zorunlu
    const cookie = `pg_session=${u.token}`;
    expect((await api().post('/api/game/responsible/confirm-adult').set('Cookie', cookie).send({ confirm: true })).status).toBe(403);
    expect((await api().post('/api/game/responsible/confirm-adult').set('Cookie', cookie).set(W).send({ confirm: true })).status).toBe(200);
    expect((await api().get('/api/game/responsible')).status).toBe(401);
  });
});

describe('profil, liderlik, defter, herkese açık profil', () => {
  it('GET /profile sözleşmesi', async () => {
    const u = await createUser();
    const r = await api().get('/api/game/profile').set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      coins: 0,
      xp: 0,
      level: 1,
      level_progress: { xp_in_level: 0, needed: 100, pct: 0 },
      rating: 1000,
      tier: { id: 'bronze', label: 'Bronz', min: 0, next_min: 1100 },
      streak: { current: 0, best: 0, today_done: false },
      avatar_id: 'avatar-1',
      frame_id: null,
      title: null,
      spins: { free_available: true, extra: 0, next_free_at: null },
      quests: { unclaimed: 0, completed_today: 0, total_today: 3 },
      responsible: {
        adult_confirmed: false,
        daily_round_limit: null,
        rounds_today: 0,
        session_reminder_minutes: null,
        break_until: null,
        loss_streak: 0,
      },
    });
    expect((await api().get('/api/game/profile')).status).toBe(401);
  });

  it('liderlik tablosu (reyting / seviye), me; botlar ve yasaklılar hariç', async () => {
    const a = await createUser();
    const b = await createUser();
    const banned = await createUser();
    await pool.query(`UPDATE users SET arena_rating = 2500, xp = 99000 WHERE id = $1`, [a.id]);
    await pool.query(`UPDATE users SET arena_rating = 2400, xp = 99500 WHERE id = $1`, [b.id]);
    await pool.query(`UPDATE users SET arena_rating = 2600, xp = 99999, is_banned = TRUE WHERE id = $1`, [banned.id]);

    const r = await api().get('/api/game/leaderboard').query({ type: 'rating', limit: 5 }).set(a.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.items[0]).toMatchObject({ rank: 1, username: a.username, value: 2500, tier: { id: 'diamond' } });
    expect(r.body.data.items[1]).toMatchObject({ rank: 2, username: b.username });
    expect(r.body.data.items.find((i: any) => i.username === banned.username)).toBeUndefined();
    expect(r.body.data.me).toMatchObject({ rank: 1, username: a.username });
    expect(r.body.data.items[0]).not.toHaveProperty('id');

    const l = await api().get('/api/game/leaderboard').query({ type: 'level' });
    expect(l.body.data.items[0]).toMatchObject({ username: b.username, value: 99500 });
    expect(l.body.data.items[0].level).toBeGreaterThan(1);
    expect(l.body.data.me).toBeNull();

    const fresh = await createUser();
    const m = await api().get('/api/game/leaderboard').set(fresh.auth);
    expect(m.body.data.me).toMatchObject({ rank: null, username: fresh.username, value: 1000 });
    expect((await api().get('/api/game/leaderboard').query({ type: 'coins' })).status).toBe(400);
  });

  it('defter listesi', async () => {
    const u = await createUser();
    await GameService.award(u.id, { coins: 5, xp: 1, reason: 'a' });
    await GameService.award(u.id, { coins: 7, reason: 'b' });
    const r = await api().get('/api/game/ledger').query({ limit: 1 }).set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(2);
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.items[0]).toMatchObject({ coins: 7, xp: 0, reason: 'b' });
    expect(r.body.data.items[0].created_at).toBeTruthy();
  });

  it('herkese açık profil: özel veri yok', async () => {
    const u = await createUser();
    await pool.query(`UPDATE users SET xp = 500, arena_rating = 1260, title_id = 'title-boga' WHERE id = $1`, [u.id]);
    const r = await api().get(`/api/game/public-profile/${u.username}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      username: u.username,
      avatar_id: 'avatar-1',
      frame_id: null,
      title: { id: 'title-boga', label: 'Boğa' },
      level: 3,
      tier: { id: 'gold', label: 'Altın', min: 1250, next_min: 1400 },
      rating: 1260,
      duel_record: null,
    });
    expect((await api().get('/api/game/public-profile/yok_boyle_biri')).status).toBe(404);
  });
});

describe('arena olay dinleyicileri', () => {
  const finished = (kind: 'solo' | 'duel' | 'challenge' | 'scenario', entries: any[]) => ({
    round_id: crypto.randomUUID(),
    kind,
    finished_at: new Date().toISOString(),
    entries: entries.map((e) => ({ trades_count: 2, equity_final: 10000, ...e })),
  });

  it('insan düellosu: ELO ±16, geçmiş, ödüller, seri, görevler; tekrar yayın etkisiz', async () => {
    const a = await createUserWithQuests(['duel_win', 'duel_play']);
    const b = await createUser();
    const ev = finished('duel', [
      { user_id: a.id, return_pct: 2, rank: 1 },
      { user_id: b.id, return_pct: -1, rank: 2 },
    ]);
    arenaEvents.emit('round_finished', ev);
    await GameListeners.idle();

    expect((await user(a.id)).rating).toBe(1016);
    expect((await user(b.id)).rating).toBe(984);
    const h = await pool.query(`SELECT user_id, rating_before, rating_after FROM game_rating_history WHERE ref_id = $1 ORDER BY rating_after`, [ev.round_id]);
    expect(h.rows).toHaveLength(2);
    expect(await ledgerRows(a.id)).toEqual([{ coins: 30, xp: 40, reason: 'duel_win', ref_type: 'arena_round', ref_id: ev.round_id }]);
    expect(await ledgerRows(b.id)).toEqual([{ coins: 5, xp: 15, reason: 'duel_loss', ref_type: 'arena_round', ref_id: ev.round_id }]);
    expect((await Streak.get(a.id)).today_done).toBe(true);
    expect((await questRow(a.id, 'duel_win')).completed_at).toBeTruthy();
    expect((await questRow(a.id, 'duel_play')).completed_at).toBeTruthy();

    arenaEvents.emit('round_finished', ev);
    await GameListeners.idle();
    expect((await user(a.id)).rating).toBe(1016);
    expect((await user(a.id)).coins).toBe(30);

    const pub = await api().get(`/api/game/public-profile/${a.username}`);
    expect(pub.body.data.duel_record).toEqual({ wins: 1, losses: 0, draws: 0 });

    // Tur sonu ekranı: bu turdan kazanılanlar (yalnızca kendi satırları)
    const rw = await api().get(`/api/game/rewards/round/${ev.round_id}`).set(a.auth);
    expect(rw.status).toBe(200);
    expect(rw.body.data).toMatchObject({ round_id: ev.round_id, ready: true, coins: 30, xp: 40, rating: { before: 1000, after: 1016, delta: 16 } });
    expect(rw.body.data.items).toEqual([{ reason: 'duel_win', coins: 30, xp: 40 }]);
    const rwB = await api().get(`/api/game/rewards/round/${ev.round_id}`).set(b.auth);
    expect(rwB.body.data).toMatchObject({ coins: 5, xp: 15, rating: { delta: -16 } });
    const none = await api().get(`/api/game/rewards/round/${crypto.randomUUID()}`).set(a.auth);
    expect(none.body.data).toMatchObject({ ready: false, coins: 0, xp: 0, items: [], rating: null });
    expect((await api().get('/api/game/rewards/round/abc').set(a.auth)).status).toBe(400);
    expect((await api().get(`/api/game/rewards/round/${ev.round_id}`)).status).toBe(401);
  });

  it('beraberlik ve bota karşı düello (reyting değişmez, jeton yok)', async () => {
    const a = await createUser();
    const b = await createUser();
    arenaEvents.emit('round_finished', finished('duel', [
      { user_id: a.id, return_pct: 0, rank: 1 },
      { user_id: b.id, return_pct: 0, rank: 1 },
    ]));
    await GameListeners.idle();
    expect((await user(a.id)).rating).toBe(1000);
    expect((await ledgerRows(a.id))[0]).toMatchObject({ reason: 'duel_draw', xp: 25, coins: 15 });

    const bot = await createUser();
    const ev = finished('duel', [
      { user_id: a.id, return_pct: 3, rank: 1 },
      { user_id: bot.id, return_pct: -3, rank: 2, is_bot: true },
    ]);
    arenaEvents.emit('round_finished', ev);
    await GameListeners.idle();
    expect((await user(a.id)).rating).toBe(1000);
    expect((await user(bot.id)).rating).toBe(1000);
    expect((await pool.query(`SELECT 1 FROM game_rating_history WHERE ref_id = $1`, [ev.round_id])).rows).toHaveLength(0);
    expect((await ledgerRows(a.id))[1]).toMatchObject({ reason: 'duel_win', xp: 40, coins: 0 });
    expect(await ledgerRows(bot.id)).toHaveLength(0);
  });

  it('meydan okuma: ikili ELO + katılım ve ilk 3 ödülleri', async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    arenaEvents.emit('round_finished', finished('challenge', [
      { user_id: a.id, return_pct: 3, rank: 1 },
      { user_id: b.id, return_pct: 1, rank: 2 },
      { user_id: c.id, return_pct: -1, rank: 3 },
    ]));
    await GameListeners.idle();
    expect([(await user(a.id)).rating, (await user(b.id)).rating, (await user(c.id)).rating]).toEqual([1008, 1000, 992]);
    expect((await ledgerRows(a.id)).map((x) => [x.reason, x.coins, x.xp])).toEqual([
      ['challenge', 20, 50],
      ['challenge_top3', 100, 50],
      ['level_up', 50, 0], // 100 XP → seviye 2
    ]);
    expect((await user(c.id)).coins).toBe(20 + 30);
  });

  it('solo tur: XP + getiri bonusu; kademe atlama bildirimi + çerçeve', async () => {
    const s = await createUser();
    arenaEvents.emit('round_finished', finished('solo', [{ user_id: s.id, return_pct: 1.2, rank: 1 }]));
    await GameListeners.idle();
    expect(await ledgerRows(s.id)).toMatchObject([{ reason: 'arena_round', xp: 15 + 12, coins: 10 }]);
    expect((await user(s.id)).rating).toBe(1000);

    const a = await createUser();
    const b = await createUser();
    await pool.query(`UPDATE users SET arena_rating = 1090 WHERE id = ANY($1::uuid[])`, [[a.id, b.id]]);
    arenaEvents.emit('round_finished', finished('duel', [
      { user_id: a.id, return_pct: 1, rank: 1 },
      { user_id: b.id, return_pct: 0, rank: 2 },
    ]));
    await GameListeners.idle();
    expect((await user(a.id)).rating).toBe(1106);
    const n = await pool.query(`SELECT title FROM notifications WHERE user_id = $1 AND type = 'game.tier_up'`, [a.id]);
    expect(n.rows.map((x: any) => x.title)).toEqual(['Gümüş kademesine yükseldin!']);
    const inv = await pool.query(`SELECT item_id FROM game_inventory WHERE user_id = $1 ORDER BY item_id`, [a.id]);
    expect(inv.rows.map((x: any) => x.item_id)).toEqual(['frame-bronze', 'frame-silver']);
  });

  it('position_closed (sl) ve farklı enstrüman sayısı; round_started (challenge)', async () => {
    const u = await createUserWithQuests(['arena_use_sl', 'arena_3_instruments']);
    const [roundId] = await insertRounds(u.id, [null], { minutesAgoStart: 0 });
    for (const inst of ['BTC', 'ETH', 'XAU']) {
      await pool.query(
        `INSERT INTO arena_positions (round_id, user_id, instrument, side, qty, amount, entry_price, entry_tick, last_checked_tick)
         VALUES ($1, $2, $3, 'long', 1, 100, 100, 0, 0)`,
        [roundId, u.id, inst]
      );
    }
    arenaEvents.emit('position_closed', {
      round_id: roundId,
      user_id: u.id,
      position: { instrument: 'BTC', side: 'long', pnl: -5, close_reason: 'sl', amount: 100, opened_tick: 0, closed_tick: 3, stop_loss: 95, take_profit: null },
    });
    await GameListeners.idle();
    expect((await questRow(u.id, 'arena_use_sl')).completed_at).toBeTruthy();
    expect(await questRow(u.id, 'arena_3_instruments')).toMatchObject({ progress: 3 });

    const c = await createUserWithQuests(['challenge_join']);
    arenaEvents.emit('round_started', { round_id: crypto.randomUUID(), kind: 'challenge', user_ids: [c.id] });
    await GameListeners.idle();
    expect((await questRow(c.id, 'challenge_join')).completed_at).toBeTruthy();
  });
});

describe('ana portföy ve lig kancaları', () => {
  it('günün ilk işlemi +10 XP (günde bir kez), seri, main_buy görevi', async () => {
    const u = await createUserWithQuests(['main_buy']);
    const sym = uniqueSymbol('G');
    await setMarketPrice(sym, 10);
    const res = await api().post('/api/transactions/buy').set(u.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 });
    expect(res.status).toBe(200);
    for (let i = 0; i < 60 && (await ledgerRows(u.id)).length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    await GameService.onMainTrade(u.id, 'sell');
    const rows = await ledgerRows(u.id);
    expect(rows).toEqual([{ coins: 0, xp: 10, reason: 'first_trade', ref_type: 'day', ref_id: istanbulDay() }]);
    expect((await Streak.get(u.id)).today_done).toBe(true);
    expect((await questRow(u.id, 'main_buy')).completed_at).toBeTruthy();
  });

  it('lige katılım +20 XP (lig başına bir kez)', async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const lg = await api().post('/api/leagues').set(owner.auth).send({ name: 'Oyun Ligi' });
    expect(lg.status).toBe(201);
    const j = await api().post('/api/leagues/join').set(joiner.auth).send({ code: lg.body.data.invite_code });
    expect(j.status).toBe(200);
    expect(await ledgerRows(joiner.id)).toEqual([{ coins: 0, xp: 20, reason: 'league_join', ref_type: 'league', ref_id: lg.body.data.id }]);
    expect(await ledgerRows(owner.id)).toEqual([]);
  });
});
