import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameService } from '../src/services/game/service';
import { costFor, maxAffordable } from '../src/services/idle/math';
import { clearMarketCache, getMarket } from '../src/services/idle/market';
import { IdleService } from '../src/services/idle/service';
import { api, createUser, pool, type TestUser } from './helpers';

/**
 * /api/idle — Yatırım İmparatorluğu. GameService (B2) gerçek modüldür; award / progressQuest burada izlenir
 * (spy) ve sahte sonuç döndürür.
 */

type AwardArgs = Parameters<typeof GameService.award>;

let awardMode: 'ok' | 'fail' | 'duplicate' = 'ok';
let awardSpy: ReturnType<typeof vi.spyOn>;
let questSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  awardMode = 'ok';
  clearMarketCache();
  awardSpy = vi.spyOn(GameService, 'award').mockImplementation(async (...args: AwardArgs) => {
    const input = args[1];
    if (awardMode === 'fail') return null;
    return {
      awarded: awardMode === 'ok',
      coins: input.coins ?? 0,
      xp: input.xp ?? 0,
      level_up_coins: 0,
      level_before: 1,
      level_after: 1,
      balance: { coins: 0, xp: 0 },
    };
  });
  questSpy = vi.spyOn(GameService, 'progressQuest').mockImplementation(async () => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Seed {
  cash?: number;
  total_earned?: number;
  buildings?: Record<string, number>;
  upgrades?: string[];
  prestige_shares?: number;
  secondsAgo?: number;
  offline_cap_s?: number;
  milestones_awarded?: number[];
}

async function seed(userId: string, s: Seed): Promise<void> {
  await pool.query(
    `INSERT INTO idle_states (user_id, cash, total_earned, buildings, upgrades, prestige_shares, last_tick_at, offline_cap_s, milestones_awarded)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::timestamptz, $8, $9::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       cash = EXCLUDED.cash, total_earned = EXCLUDED.total_earned, buildings = EXCLUDED.buildings,
       upgrades = EXCLUDED.upgrades, prestige_shares = EXCLUDED.prestige_shares, last_tick_at = EXCLUDED.last_tick_at,
       offline_cap_s = EXCLUDED.offline_cap_s, milestones_awarded = EXCLUDED.milestones_awarded`,
    [
      userId,
      s.cash ?? 0,
      s.total_earned ?? s.cash ?? 0,
      JSON.stringify(s.buildings ?? {}),
      JSON.stringify(s.upgrades ?? []),
      s.prestige_shares ?? 0,
      new Date(Date.now() - (s.secondsAgo ?? 0) * 1000).toISOString(),
      s.offline_cap_s ?? 28800,
      JSON.stringify(s.milestones_awarded ?? []),
    ]
  );
}

const getState = (u: TestUser) => api().get('/api/idle/state').set(u.auth);
const building = (data: any, id: string) => data.buildings.find((b: any) => b.id === id);
const upgrade = (data: any, id: string) => data.upgrades.find((x: any) => x.id === id);

describe('/api/idle auth & validation', () => {
  it('requires authentication', async () => {
    expect((await api().get('/api/idle/state')).status).toBe(401);
    expect((await api().post('/api/idle/tap').send({ count: 1 })).status).toBe(401);
    expect((await api().post('/api/idle/buy').send({ building_id: 'kumbara' })).status).toBe(401);
  });

  it('validates bodies', async () => {
    const u = await createUser();
    const cases: [string, object][] = [
      ['/api/idle/buy', { building_id: 'castle' }],
      ['/api/idle/buy', { building_id: 'kumbara', quantity: 5 }],
      ['/api/idle/buy', { building_id: 'kumbara', quantity: '10' }],
      ['/api/idle/upgrade', { upgrade_id: 'nope' }],
      ['/api/idle/upgrade', {}],
      ['/api/idle/tap', { count: 0 }],
      ['/api/idle/tap', { count: 21 }],
      ['/api/idle/tap', { count: 1.5 }],
    ];
    for (const [path, body] of cases) {
      const res = await api().post(path).set(u.auth).send(body);
      expect(res.status, `${path} ${JSON.stringify(body)}`).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('GET /api/idle/state', () => {
  it('creates a fresh empire with the full contract', async () => {
    const u = await createUser();
    const res = await getState(u);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;
    expect(Date.parse(d.server_now)).toBeGreaterThan(0);
    expect(d).toMatchObject({ cash: 0, total_earned: 0, income_per_sec: 0, tap_value: 1, offline_cap_s: 28800 });
    expect(d.buildings.map((b: any) => b.id)).toEqual(['kumbara', 'doviz', 'altin', 'hisse', 'kripto', 'holding']);
    for (const b of d.buildings) {
      for (const k of [
        'name', 'description', 'owned', 'next_cost', 'cost_x10', 'max_affordable', 'income_each', 'income_total',
        'multiplier', 'milestone_next', 'unlocked', 'market', 'art_key',
      ]) {
        expect(b, `${b.id}.${k}`).toHaveProperty(k);
      }
      if (b.market) {
        expect(b.market.multiplier).toBeGreaterThanOrEqual(0.6);
        expect(b.market.multiplier).toBeLessThanOrEqual(1.8);
        expect(typeof b.market.label).toBe('string');
        expect(typeof b.market.headline).toBe('string');
      }
    }
    expect(building(d, 'kumbara')).toMatchObject({ owned: 0, next_cost: 15, unlocked: true, market: null, milestone_next: 25 });
    expect(building(d, 'doviz')).toMatchObject({ unlocked: false });
    expect(building(d, 'doviz').market).toMatchObject({ asset_type: 'currency', symbol: 'USD' });
    expect(building(d, 'holding').market).toMatchObject({ asset_type: 'mixed', symbol: 'ALL' });
    expect(d.upgrades).toHaveLength(21);
    expect(upgrade(d, 'bilesik_faiz')).toMatchObject({ building_id: null, purchased: false, available: false });
    expect(d.prestige).toMatchObject({ shares: 0, bonus_pct: 0, available: false, shares_on_reset: 0, threshold: 1e7 });
    expect(d.offline).toMatchObject({ earned: 0, seconds: 0, capped: false });
    expect(d.milestones.map((m: any) => m.at)).toEqual([1e3, 1e5, 1e7, 1e9, 1e11]);
    expect(d.milestones.every((m: any) => m.reached === false)).toBe(true);
    expect(d.tips[0]).toContain('Kumbara');
    expect(d.rewards_granted).toEqual([]);
  });

  it('accrues online income without a cap and without a quest tick', async () => {
    const u = await createUser();
    await seed(u.id, { buildings: { kumbara: 10 }, secondsAgo: 60 });
    const d = (await getState(u)).body.data;
    expect(d.cash).toBeGreaterThan(299);
    expect(d.cash).toBeLessThan(302);
    expect(d.offline.earned).toBe(0);
    expect(d.income_per_sec).toBe(5);
    expect(questSpy).not.toHaveBeenCalled();
  });

  it('collects offline earnings once and progresses the idle_collect quest', async () => {
    const u = await createUser();
    await seed(u.id, { buildings: { kumbara: 10 }, secondsAgo: 3 * 3600 });
    const first = (await getState(u)).body.data;
    expect(first.offline.earned).toBeGreaterThan(53_999);
    expect(first.offline.earned).toBeLessThan(54_010);
    expect(first.offline).toMatchObject({ capped: false, cap_seconds: 28800 });
    expect(first.offline.seconds).toBeGreaterThanOrEqual(10_800);
    expect(first.cash).toBeCloseTo(first.offline.earned, 0);
    expect(questSpy).toHaveBeenCalledTimes(1);
    expect(questSpy).toHaveBeenCalledWith(u.id, 'idle_collect', 1);

    const second = (await getState(u)).body.data;
    expect(second.offline.earned).toBe(0);
    expect(second.cash).toBeGreaterThanOrEqual(first.cash);
    expect(questSpy).toHaveBeenCalledTimes(1);
  });

  it('caps offline earnings at 8 hours (and does not tick the quest without income)', async () => {
    const u = await createUser();
    await seed(u.id, { buildings: { kumbara: 10 }, secondsAgo: 20 * 3600 });
    const d = (await getState(u)).body.data;
    expect(d.offline).toMatchObject({ capped: true, credited_seconds: 28800, earned: 144_000 });
    expect(d.offline.seconds).toBeGreaterThanOrEqual(72_000);
    expect(d.tips.some((t: string) => t.includes('Gece Vardiyası'))).toBe(true);

    const idle = await createUser();
    await seed(idle.id, { secondsAgo: 5 * 3600 });
    questSpy.mockClear();
    await getState(idle);
    expect(questSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/idle/tap', () => {
  it('adds max(1, 1% of income) per tap', async () => {
    const u = await createUser();
    const res = await api().post('/api/idle/tap').set(u.auth).send({ count: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ gained: 5, accepted: 5, tap_value: 1, cash: 5, total_earned: 5 });

    const rich = await createUser();
    await seed(rich.id, { buildings: { kumbara: 200 } }); // 200 × 0,5 × 16 = 1600/sn → dokunuş 16
    const r2 = await api().post('/api/idle/tap').set(rich.auth).send({ count: 2 });
    expect(r2.body.data.tap_value).toBe(16);
    expect(r2.body.data.gained).toBe(32);
  });

  it('rate-limits taps (burst 20, 10/s): extra taps are dropped, none left → 429', async () => {
    const u = await createUser();
    const first = await api().post('/api/idle/tap').set(u.auth).send({ count: 20 });
    expect(first.body.data.accepted).toBe(20);
    const second = await api().post('/api/idle/tap').set(u.auth).send({ count: 20 });
    if (second.status === 200) expect(second.body.data.accepted).toBeLessThan(20);
    else expect(second.body.code).toBe('RATE_LIMITED');

    // Deterministik: aynı an → jeton yok
    const v = await createUser();
    const t0 = new Date();
    await IdleService.tap(v.id, 20, t0);
    await expect(IdleService.tap(v.id, 1, t0)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    const later = await IdleService.tap(v.id, 20, new Date(t0.getTime() + 1000));
    expect(later.accepted).toBe(10);
  });
});

describe('POST /api/idle/buy', () => {
  it('buys ×1, ×10 and max with geometric costs', async () => {
    const u = await createUser();
    const poor = await api().post('/api/idle/buy').set(u.auth).send({ building_id: 'kumbara', quantity: 1 });
    expect(poor.status).toBe(400);
    expect(poor.body.code).toBe('INSUFFICIENT_CASH');
    expect(poor.body.message).toMatch(/yeterli/);

    await seed(u.id, { cash: 1000 });
    const ten = await api().post('/api/idle/buy').set(u.auth).send({ building_id: 'kumbara', quantity: 10 });
    expect(ten.status).toBe(200);
    const d = ten.body.data;
    expect(building(d, 'kumbara').owned).toBe(10);
    expect(d.cash).toBeCloseTo(1000 - costFor(15, 0, 10), 2);
    expect(d.income_per_sec).toBe(5);
    expect(building(d, 'kumbara').next_cost).toBeCloseTo(costFor(15, 10, 1), 3);

    const expected = maxAffordable(15, 10, d.cash);
    const max = await api().post('/api/idle/buy').set(u.auth).send({ building_id: 'kumbara', quantity: 'max' });
    expect(max.status).toBe(200);
    expect(building(max.body.data, 'kumbara').owned).toBeGreaterThanOrEqual(10 + expected);
    expect(building(max.body.data, 'kumbara').max_affordable).toBe(0);
  });

  it('serializes concurrent purchases (no double spend)', async () => {
    const u = await createUser();
    await seed(u.id, { cash: 20 });
    const results = await Promise.all([
      api().post('/api/idle/buy').set(u.auth).send({ building_id: 'kumbara', quantity: 1 }),
      api().post('/api/idle/buy').set(u.auth).send({ building_id: 'kumbara', quantity: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const row = await pool.query(`SELECT cash, buildings FROM idle_states WHERE user_id = $1`, [u.id]);
    expect(row.rows[0].buildings).toEqual({ kumbara: 1 });
    // 15'lik Kumbara alındı; kalan 5 + birkaç ms'lik gelir
    expect(Number(row.rows[0].cash)).toBeGreaterThanOrEqual(5);
    expect(Number(row.rows[0].cash)).toBeLessThan(6);

    const v = await createUser();
    await seed(v.id, { cash: 50 }); // 15 + 17,25 = 32,25 ≤ 50 < 52,09
    const many = await Promise.all(
      Array.from({ length: 5 }, () => api().post('/api/idle/buy').set(v.auth).send({ building_id: 'kumbara', quantity: 1 }))
    );
    expect(many.filter((r) => r.status === 200)).toHaveLength(2);
    expect(many.filter((r) => r.status === 400)).toHaveLength(3);
  });
});

describe('POST /api/idle/upgrade', () => {
  it('enforces requirements, cost and single purchase', async () => {
    const u = await createUser();
    await seed(u.id, { cash: 1e6, total_earned: 1e6, buildings: { kumbara: 10 } });
    const ok = await api().post('/api/idle/upgrade').set(u.auth).send({ upgrade_id: 'kumbara_1' });
    expect(ok.status).toBe(200);
    expect(upgrade(ok.body.data, 'kumbara_1')).toMatchObject({ purchased: true, available: false });
    expect(building(ok.body.data, 'kumbara')).toMatchObject({ income_each: 1, upgrades_purchased: 1 });
    expect(ok.body.data.cash).toBeCloseTo(1e6 - 7500, 0);

    const again = await api().post('/api/idle/upgrade').set(u.auth).send({ upgrade_id: 'kumbara_1' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('UPGRADE_OWNED');

    const locked = await api().post('/api/idle/upgrade').set(u.auth).send({ upgrade_id: 'kumbara_3' });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('UPGRADE_LOCKED');

    const div = await api().post('/api/idle/upgrade').set(u.auth).send({ upgrade_id: 'cesitlendirme' });
    expect(div.body.code).toBe('UPGRADE_LOCKED');

    const night = await api().post('/api/idle/upgrade').set(u.auth).send({ upgrade_id: 'gece_vardiyasi' });
    expect(night.status).toBe(200);
    expect(night.body.data.offline_cap_s).toBe(43200);

    const poor = await createUser();
    await seed(poor.id, { cash: 100, total_earned: 1000, buildings: { kumbara: 1 } });
    const r = await api().post('/api/idle/upgrade').set(poor.auth).send({ upgrade_id: 'bilesik_faiz' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('INSUFFICIENT_CASH');
  });
});

describe('POST /api/idle/prestige', () => {
  it('Halka Arz: needs 1e7, resets the run, keeps shares and lifetime total', async () => {
    const u = await createUser();
    const early = await api().post('/api/idle/prestige').set(u.auth).send({});
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('PRESTIGE_UNAVAILABLE');

    await seed(u.id, {
      cash: 5e7,
      total_earned: 1e8,
      buildings: { kumbara: 50, holding: 2 },
      upgrades: ['kumbara_1', 'gece_vardiyasi'],
      offline_cap_s: 43200,
      milestones_awarded: [1e3, 1e5, 1e7],
    });
    const before = (await getState(u)).body.data;
    expect(before.prestige).toMatchObject({ available: true, shares_on_reset: 10, bonus_after_pct: 20 });

    const res = await api().post('/api/idle/prestige').set(u.auth).send({});
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.prestige).toMatchObject({ shares: 10, bonus_pct: 20, count: 1, available: false, shares_on_reset: 0 });
    expect(d.cash).toBe(0);
    expect(d.total_earned).toBeGreaterThanOrEqual(1e8);
    expect(d.buildings.every((b: any) => b.owned === 0)).toBe(true);
    expect(d.upgrades.every((x: any) => !x.purchased)).toBe(true);
    expect(d.offline_cap_s).toBe(28800);
    expect(d.boosts.prestige_pct).toBe(20);

    const again = await api().post('/api/idle/prestige').set(u.auth).send({});
    expect(again.status).toBe(409);

    // Kalıcı bonus: yeni Kumbara 0,5 × 1,2
    await pool.query(`UPDATE idle_states SET cash = 15 WHERE user_id = $1`, [u.id]);
    const buy = await api().post('/api/idle/buy').set(u.auth).send({ building_id: 'kumbara', quantity: 1 });
    expect(buy.body.data.income_per_sec).toBeCloseTo(0.6, 6);
  });
});

describe('earn milestones → GameService.award', () => {
  it('awards each milestone once (idempotent ref) and records it', async () => {
    const u = await createUser();
    await seed(u.id, { total_earned: 999.5 });
    await api().post('/api/idle/tap').set(u.auth).send({ count: 1 }).expect(200);
    expect(awardSpy).toHaveBeenCalledTimes(1);
    expect(awardSpy).toHaveBeenCalledWith(u.id, {
      coins: 10,
      xp: 15,
      reason: 'idle_milestone',
      ref_type: 'idle_milestone',
      ref_id: '1000',
    });

    const d = (await getState(u)).body.data;
    expect(d.milestones[0]).toMatchObject({ at: 1000, reached: true, awarded: true });
    expect(d.milestones[1]).toMatchObject({ reached: false, awarded: false });
    expect(awardSpy).toHaveBeenCalledTimes(1);
    const row = await pool.query(`SELECT milestones_awarded FROM idle_states WHERE user_id = $1`, [u.id]);
    expect(row.rows[0].milestones_awarded).toEqual([1000]);
  });

  it('retries after a failed award and reports newly granted rewards', async () => {
    const u = await createUser();
    await seed(u.id, { total_earned: 2e5, cash: 0 });
    awardMode = 'fail';
    const failed = (await getState(u)).body.data;
    expect(awardSpy).toHaveBeenCalledTimes(2);
    expect(failed.milestones.slice(0, 2).map((m: any) => m.awarded)).toEqual([false, false]);
    expect(failed.rewards_granted).toEqual([]);

    awardMode = 'ok';
    const ok = (await getState(u)).body.data;
    expect(awardSpy).toHaveBeenCalledTimes(4);
    expect(ok.rewards_granted).toEqual([
      { at: 1e3, coins: 10, xp: 15 },
      { at: 1e5, coins: 25, xp: 30 },
    ]);
    expect(ok.milestones.slice(0, 2).map((m: any) => m.awarded)).toEqual([true, true]);

    await getState(u);
    expect(awardSpy).toHaveBeenCalledTimes(4);

    // GameService "zaten verilmiş" derse kaydedilir ama yeniden bildirilmez
    const v = await createUser();
    await seed(v.id, { total_earned: 5000 });
    awardMode = 'duplicate';
    const dup = (await getState(v)).body.data;
    expect(dup.rewards_granted).toEqual([]);
    expect(dup.milestones[0].awarded).toBe(true);
  });
});

describe('market link (price_history day buckets)', () => {
  const NOW = new Date('2035-03-15T12:00:00.000Z');
  const insert = async (asset: string, symbol: string, dayUtc: string, price: number, currency = 'USD') =>
    pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency)
       VALUES ($1, $2, 'day', $3::timestamptz, $4, $5)
       ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price`,
      [asset, symbol, `${dayUtc}T21:00:00.000Z`, price, currency]
    );

  it('derives multipliers from crafted rows and feeds them into income', async () => {
    await insert('currency', 'USD', '2035-03-13', 40, 'TRY');
    await insert('currency', 'USD', '2035-03-14', 40.4, 'TRY');
    await insert('commodity', 'GAU', '2035-03-13', 3000, 'TRY');
    await insert('commodity', 'GAU', '2035-03-14', 2964, 'TRY');
    await insert('crypto', 'BTC', '2035-03-13', 100_000);
    await insert('crypto', 'BTC', '2035-03-14', 103_000);
    await insert('stock', 'IDLEA', '2035-03-13', 100);
    await insert('stock', 'IDLEA', '2035-03-14', 103);
    await insert('stock', 'IDLEB', '2035-03-13', 50);
    await insert('stock', 'IDLEB', '2035-03-14', 49.5);
    await insert('stock', 'IDLEC', '2035-03-11', 10);
    await insert('stock', 'IDLEC', '2035-03-12', 30);

    const m = await getMarket(NOW);
    expect(m.kumbara).toBeNull();
    expect(m.doviz).toMatchObject({ symbol: 'USD', change_pct: 1, multiplier: 1.08, as_of: '2035-03-15' });
    expect(m.doviz!.headline).toBe('Bugün dolar %1,0 yükseldi → Döviz Bürosu ×1,08');
    expect(m.altin).toMatchObject({ symbol: 'GAU', change_pct: -1.2, multiplier: 0.928 });
    expect(m.kripto).toMatchObject({ symbol: 'BTC', change_pct: 3, multiplier: 1.09 });
    expect(m.hisse).toMatchObject({ symbol: 'BASKET', components: 2, change_pct: 1, multiplier: 1.05 });
    // (0,01 − 0,012 + 0,01 + 0,03) / 4 = 0,0095 → 1 + 4 × 0,0095
    expect(m.holding).toMatchObject({ components: 4, change_pct: 0.95, multiplier: 1.038 });

    const u = await createUser();
    await seed(u.id, { buildings: { doviz: 10, altin: 1 } });
    clearMarketCache();
    const d = await IdleService.getState(u.id, NOW);
    expect(building(d, 'doviz').income_each).toBeCloseTo(4 * 1.08, 6);
    expect(building(d, 'doviz').multiplier).toBeCloseTo(1.08, 6);
    expect(building(d, 'altin').income_each).toBeCloseTo(35 * 0.928, 6);
    expect(d.income_per_sec).toBeCloseTo(10 * 4 * 1.08 + 35 * 0.928, 6);
  });

  it('missing data → multiplier 1 with reason "veri yok"; stale → "veri eski"', async () => {
    const empty = await getMarket(new Date('2036-06-15T12:00:00.000Z'));
    for (const id of ['doviz', 'altin', 'hisse', 'kripto', 'holding'] as const) {
      expect(empty[id]).toMatchObject({ multiplier: 1, change_pct: null, reason: 'veri yok' });
    }

    clearMarketCache();
    await insert('currency', 'USD', '2037-01-01', 40, 'TRY');
    await insert('currency', 'USD', '2037-01-02', 41, 'TRY');
    const stale = await getMarket(new Date('2037-01-12T12:00:00.000Z'));
    expect(stale.doviz).toMatchObject({ multiplier: 1, reason: 'veri eski' });
  });
});

describe('GET /api/idle/leaderboard', () => {
  it('ranks by lifetime total (public; me when signed in; banned / unverified hidden)', async () => {
    const [a, b, c, banned, unverified] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
      createUser({ verified: false }),
    ]);
    await seed(a.id, { total_earned: 5e24, prestige_shares: 7 });
    await seed(b.id, { total_earned: 4e24 });
    await seed(c.id, { total_earned: 3e24 });
    await seed(banned.id, { total_earned: 9e24 });
    await seed(unverified.id, { total_earned: 8e24 });
    await pool.query(`UPDATE users SET is_banned = true WHERE id = $1`, [banned.id]);
    // Büyük sayıların yazımı (≥ 1e21) da çalışmalı
    await api().post('/api/idle/tap').set(a.auth).send({ count: 1 }).expect(200);

    const pub = await api().get('/api/idle/leaderboard?limit=3');
    expect(pub.status).toBe(200);
    expect(pub.body.data.me).toBeNull();
    expect(pub.body.data.items.map((i: any) => i.username)).toEqual([a.username, b.username, c.username]);
    expect(pub.body.data.items[0]).toMatchObject({ rank: 1, prestige_shares: 7 });
    expect(pub.body.data.items[0].total_earned).toBeCloseTo(5e24, -12);

    const mine = await api().get('/api/idle/leaderboard?limit=1').set(b.auth);
    expect(mine.body.data.items).toHaveLength(1);
    expect(mine.body.data.me).toMatchObject({ rank: 2, username: b.username });

    const fresh = await createUser();
    expect((await api().get('/api/idle/leaderboard').set(fresh.auth)).body.data.me).toBeNull();
  });
});
