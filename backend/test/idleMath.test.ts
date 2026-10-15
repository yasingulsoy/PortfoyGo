import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_BY_ID, OFFLINE_CAP_EXTENDED_S, OFFLINE_CAP_S, PRESTIGE_THRESHOLD } from '../src/services/idle/config';
import {
  IdleRuleError,
  UPGRADES,
  accrue,
  applyAccrual,
  applyPrestige,
  buildingMultiplier,
  buyBuilding,
  buyUpgrade,
  costFor,
  emptyState,
  globalMultipliers,
  incomeEach,
  incomePerSec,
  isUnlocked,
  isUpgradeAvailable,
  maxAffordable,
  milestonesReached,
  nextOwnedMilestone,
  prestigeInfo,
  tapValue,
  type IdleState,
} from '../src/services/idle/math';
import { computeMarket, marketMultiplier, multipliersOf, type DayRow } from '../src/services/idle/market';
import { TapLimiter } from '../src/services/idle/tapLimiter';
import { buildStateDto, buildTips } from '../src/services/idle/view';

const NOW = new Date('2030-06-15T12:00:00.000Z');
const state = (patch: Partial<IdleState> = {}): IdleState => ({ ...emptyState(NOW), ...patch });

describe('idle math: income', () => {
  it('sums base income × owned without multipliers', () => {
    const s = state({ buildings: { kumbara: 3, doviz: 2 } });
    expect(incomePerSec(s)).toBeCloseTo(3 * 0.5 + 2 * 4, 10);
    expect(incomeEach(s, 'doviz', {})).toBe(4);
  });

  it('applies ×2 owned milestones at 25, 50, 100, 200', () => {
    expect([0, 24, 25, 49, 50, 99, 100, 199, 200, 500].map(milestonesReached)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 25, 60, 150, 200].map(nextOwnedMilestone)).toEqual([25, 50, 100, 200, null]);
    expect(incomePerSec(state({ buildings: { kumbara: 24 } }))).toBeCloseTo(12, 10);
    expect(incomePerSec(state({ buildings: { kumbara: 25 } }))).toBeCloseTo(25, 10);
    expect(incomePerSec(state({ buildings: { kumbara: 100 } }))).toBeCloseTo(100 * 0.5 * 8, 10);
    expect(incomePerSec(state({ buildings: { kumbara: 200 } }))).toBeCloseTo(200 * 0.5 * 16, 10);
  });

  it('applies building upgrades, market multipliers and global multipliers', () => {
    const s = state({ buildings: { altin: 10 }, upgrades: ['altin_1', 'altin_2'] });
    expect(incomePerSec(s)).toBeCloseTo(10 * 35 * 4, 8);
    expect(incomePerSec(s, { altin: 1.07 })).toBeCloseTo(10 * 35 * 4 * 1.07, 8);
    // Kumbara piyasa bağsızdır ama çarpan haritası verilirse yine uygulanır (servis vermez)
    expect(buildingMultiplier(s, 'altin', { altin: 0.6 })).toBeCloseTo(4 * 0.6, 10);

    const book = state({ buildings: { kumbara: 10 }, upgrades: ['bilesik_faiz'] });
    expect(incomePerSec(book)).toBeCloseTo(5 * 1.1, 10);
  });

  it('diversification bonus needs the upgrade AND ≥ 4 building types', () => {
    const three = state({ buildings: { kumbara: 1, doviz: 1, altin: 1 }, upgrades: ['cesitlendirme'] });
    expect(globalMultipliers(three).diversification_active).toBe(false);
    const four = state({ buildings: { kumbara: 1, doviz: 1, altin: 1, hisse: 1 }, upgrades: ['cesitlendirme'] });
    expect(globalMultipliers(four).diversification_active).toBe(true);
    const base = 0.5 + 4 + 35 + 380;
    expect(incomePerSec(four)).toBeCloseTo(base * 1.25, 8);
    const noUpgrade = state({ buildings: four.buildings });
    expect(incomePerSec(noUpgrade)).toBeCloseTo(base, 8);
  });

  it('prestige shares add +2% each, multiplicatively with other boosts', () => {
    const s = state({ buildings: { doviz: 10 }, prestige_shares: 10, upgrades: ['bilesik_faiz'] });
    expect(globalMultipliers(s).prestige).toBeCloseTo(1.2, 12);
    expect(incomePerSec(s, { doviz: 1.5 })).toBeCloseTo(10 * 4 * 1.5 * 1.1 * 1.2, 8);
  });

  it('tap value is max(1, 1% of income/s)', () => {
    expect(tapValue(0)).toBe(1);
    expect(tapValue(50)).toBe(1);
    expect(tapValue(250)).toBeCloseTo(2.5, 12);
    expect(tapValue(NaN)).toBe(1);
  });
});

describe('idle math: costs', () => {
  it('uses a ×1.15 geometric series', () => {
    expect(costFor(15, 0, 1)).toBeCloseTo(15, 10);
    expect(costFor(15, 1, 1)).toBeCloseTo(17.25, 10);
    let manual = 0;
    for (let k = 3; k < 13; k++) manual += 15 * Math.pow(1.15, k);
    expect(costFor(15, 3, 10)).toBeCloseTo(manual, 8);
    expect(costFor(15, 0, 0)).toBe(0);
  });

  it('max affordable is the largest quantity whose total cost fits', () => {
    expect(maxAffordable(15, 0, 14.99)).toBe(0);
    expect(maxAffordable(15, 0, 15)).toBe(1);
    const cash = costFor(120, 5, 7) + 0.01;
    expect(maxAffordable(120, 5, cash)).toBe(7);
    expect(maxAffordable(120, 5, costFor(120, 5, 7) - 0.01)).toBe(6);
    for (const c of [1, 100, 12345, 9.87e6, 4.2e12]) {
      const q = maxAffordable(1400, 3, c);
      expect(costFor(1400, 3, q)).toBeLessThanOrEqual(c * (1 + 1e-12));
      expect(costFor(1400, 3, q + 1)).toBeGreaterThan(c);
    }
    expect(maxAffordable(15, 0, 1e300, 1000)).toBe(1000);
  });

  it('buyBuilding validates cash for 1 / 10 / max', () => {
    const s = state({ cash: 400 });
    const ten = buyBuilding(s, 'kumbara', 10);
    expect(ten.quantity).toBe(10);
    expect(ten.state.buildings.kumbara).toBe(10);
    expect(ten.state.cash).toBeCloseTo(400 - costFor(15, 0, 10), 8);

    const max = buyBuilding(s, 'kumbara', 'max');
    expect(max.quantity).toBe(maxAffordable(15, 0, 400));
    expect(() => buyBuilding(state({ cash: 10 }), 'kumbara', 1)).toThrow(IdleRuleError);
    expect(() => buyBuilding(state({ cash: 10 }), 'kumbara', 'max')).toThrow(/yeterli/);
    expect(() => buyBuilding(state({ cash: 200 }), 'kumbara', 10)).toThrow(IdleRuleError);
  });

  it('upgrades: requirements, chain, cost and offline cap', () => {
    expect(UPGRADES).toHaveLength(BUILDINGS.length * 3 + 3);
    const k1 = UPGRADES.find((u) => u.id === 'kumbara_1')!;
    expect(k1.cost).toBe(15 * 50 * 10);
    expect(UPGRADES.find((u) => u.id === 'holding_3')!.cost).toBe(3_500_000 * 50 * 1000);

    const few = state({ cash: 1e9, buildings: { kumbara: 9 } });
    expect(isUpgradeAvailable(few, k1)).toBe(false);
    expect(() => buyUpgrade(few, 'kumbara_1')).toThrow(expect.objectContaining({ code: 'UPGRADE_LOCKED' }));

    const ok = state({ cash: 1e9, buildings: { kumbara: 30 } });
    expect(() => buyUpgrade(ok, 'kumbara_2')).toThrow(expect.objectContaining({ code: 'UPGRADE_LOCKED' }));
    const after = buyUpgrade(ok, 'kumbara_1');
    expect(after.upgrades).toEqual(['kumbara_1']);
    expect(after.cash).toBeCloseTo(1e9 - 7500, 6);
    expect(() => buyUpgrade(after, 'kumbara_1')).toThrow(expect.objectContaining({ code: 'UPGRADE_OWNED' }));
    expect(buyUpgrade(after, 'kumbara_2').upgrades).toEqual(['kumbara_1', 'kumbara_2']);

    expect(() => buyUpgrade(state({ cash: 100, buildings: { kumbara: 10 } }), 'kumbara_1')).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_CASH' })
    );
    expect(() => buyUpgrade(ok, 'nope')).toThrow(expect.objectContaining({ code: 'UNKNOWN_UPGRADE' }));

    const night = buyUpgrade(state({ cash: 1e6, total_earned: 1e6 }), 'gece_vardiyasi');
    expect(night.offline_cap_s).toBe(OFFLINE_CAP_EXTENDED_S);
    expect(() => buyUpgrade(state({ cash: 1e6, total_earned: 10 }), 'gece_vardiyasi')).toThrow(/kilitli/);
    expect(() => buyUpgrade(state({ cash: 1e6, buildings: { kumbara: 1, doviz: 1, altin: 1 } }), 'cesitlendirme')).toThrow(/kilitli/);
  });

  it('unlocks buildings at 25% of base cost (first building always open)', () => {
    expect(isUnlocked(state(), 'kumbara')).toBe(true);
    expect(isUnlocked(state(), 'doviz')).toBe(false);
    expect(isUnlocked(state({ total_earned: 30 }), 'doviz')).toBe(true);
    expect(isUnlocked(state({ total_earned: 349 }), 'altin')).toBe(false);
    expect(isUnlocked(state({ total_earned: 350 }), 'altin')).toBe(true);
    expect(isUnlocked(state({ buildings: { holding: 1 } }), 'holding')).toBe(true);
  });
});

describe('idle math: accrual', () => {
  const base = (secondsAgo: number, cap = OFFLINE_CAP_S) =>
    state({ last_tick_at: new Date(NOW.getTime() - secondsAgo * 1000), offline_cap_s: cap, buildings: { kumbara: 10 } });

  it('online (≤ 2 min): full elapsed, no cap', () => {
    const acc = accrue(base(90), NOW, 5);
    expect(acc).toMatchObject({ mode: 'online', credited_s: 90, earned: 450, capped: false });
    const next = applyAccrual(base(90), acc, NOW);
    expect(next.cash).toBe(450);
    expect(next.total_earned).toBe(450);
    expect(next.last_tick_at!.getTime()).toBe(NOW.getTime());
  });

  it('offline: credited up to the cap (8 h, or 12 h with Gece Vardiyası)', () => {
    const three = accrue(base(3 * 3600), NOW, 5);
    expect(three).toMatchObject({ mode: 'offline', credited_s: 10800, earned: 54000, capped: false });

    const long = accrue(base(20 * 3600), NOW, 5);
    expect(long).toMatchObject({ mode: 'offline', elapsed_s: 72000, credited_s: OFFLINE_CAP_S, capped: true });
    expect(long.earned).toBe(5 * OFFLINE_CAP_S);

    const ext = accrue(base(20 * 3600, OFFLINE_CAP_EXTENDED_S), NOW, 5);
    expect(ext.credited_s).toBe(OFFLINE_CAP_EXTENDED_S);
  });

  it('no accrual without a previous tick or when the clock goes backwards', () => {
    expect(accrue(state({ last_tick_at: null }), NOW, 5).mode).toBe('none');
    const future = state({ last_tick_at: new Date(NOW.getTime() + 60_000) });
    const acc = accrue(future, NOW, 5);
    expect(acc).toMatchObject({ mode: 'none', earned: 0 });
    expect(applyAccrual(future, acc, NOW).last_tick_at!.getTime()).toBe(NOW.getTime() + 60_000);
  });
});

describe('idle math: prestige (Halka Arz)', () => {
  it('requires 1e7 total and grants floor(sqrt(total/1e6)) shares', () => {
    expect(prestigeInfo(state({ total_earned: PRESTIGE_THRESHOLD - 1 })).available).toBe(false);
    const p = prestigeInfo(state({ total_earned: 1e8 }));
    expect(p).toMatchObject({ available: true, shares_on_reset: 10, shares: 0, threshold: 1e7 });
    expect(() => applyPrestige(state({ total_earned: 9e6 }), NOW)).toThrow(expect.objectContaining({ code: 'PRESTIGE_UNAVAILABLE' }));
  });

  it('resets cash, buildings and upgrades but keeps shares and lifetime total', () => {
    const s = state({
      cash: 5e7,
      total_earned: 1e8,
      buildings: { kumbara: 50, holding: 3 },
      upgrades: ['kumbara_1', 'gece_vardiyasi'],
      offline_cap_s: OFFLINE_CAP_EXTENDED_S,
    });
    const { state: after, gained } = applyPrestige(s, NOW);
    expect(gained).toBe(10);
    expect(after).toMatchObject({ cash: 0, prestige_shares: 10, prestige_count: 1, total_earned: 1e8 });
    expect(after.buildings).toEqual({});
    expect(after.upgrades).toEqual([]);
    expect(after.offline_cap_s).toBe(OFFLINE_CAP_S);
    // Aynı toplamla yeni pay yok
    expect(prestigeInfo(after)).toMatchObject({ available: false, shares_on_reset: 0, shares: 10, bonus_pct: 20 });
    // 1,21e8'de bir pay daha
    expect(prestigeInfo({ ...after, total_earned: 1.21e8 }).shares_on_reset).toBe(1);
  });
});

describe('idle market: multipliers', () => {
  const day = (iso: string) => new Date(`${iso}T21:00:00.000Z`); // İstanbul gece yarısı (UTC+3)
  const row = (asset_type: string, symbol: string, d: string, price: number): DayRow => ({
    asset_type,
    symbol,
    bucket_start: day(d),
    price,
  });

  it('clamp(1 + k·change, 0.6, 1.8)', () => {
    expect(marketMultiplier(0.012, 6)).toBe(1.072);
    expect(marketMultiplier(-0.5, 3)).toBe(0.6);
    expect(marketMultiplier(0.5, 3)).toBe(1.8);
    expect(marketMultiplier(NaN, 3)).toBe(1);
  });

  it('computes per-building market info from the latest two day buckets', () => {
    const rows = [
      row('currency', 'USD', '2030-06-13', 40),
      row('currency', 'USD', '2030-06-14', 40.4),
      row('currency', 'USD', '2030-06-01', 10), // daha eski: yok sayılır
      row('commodity', 'GAU', '2030-06-13', 3000),
      row('commodity', 'GAU', '2030-06-14', 2964),
      row('crypto', 'BTC', '2030-06-13', 100_000),
      row('crypto', 'BTC', '2030-06-14', 130_000),
      row('stock', 'AAA', '2030-06-13', 100),
      row('stock', 'AAA', '2030-06-14', 103),
      row('stock', 'BBB', '2030-06-13', 50),
      row('stock', 'BBB', '2030-06-14', 49.5),
      row('stock', 'OLD', '2030-06-11', 10),
      row('stock', 'OLD', '2030-06-12', 20), // son kovası güncel değil → sepete girmez
    ];
    const m = computeMarket(rows, NOW);
    expect(m.kumbara).toBeNull();
    expect(m.doviz).toMatchObject({ asset_type: 'currency', symbol: 'USD', change_pct: 1, multiplier: 1.08, as_of: '2030-06-15' });
    expect(m.doviz!.reason).toBeUndefined();
    expect(m.doviz!.headline).toBe('Bugün dolar %1,0 yükseldi → Döviz Bürosu ×1,08');
    expect(m.altin).toMatchObject({ symbol: 'GAU', change_pct: -1.2, multiplier: 0.928 });
    expect(m.altin!.headline).toBe('Bugün altın %1,2 düştü → Altın Madeni ×0,93');
    expect(m.kripto).toMatchObject({ symbol: 'BTC', change_pct: 30, multiplier: 1.8 });
    expect(m.hisse).toMatchObject({ symbol: 'BASKET', components: 2, change_pct: 1, multiplier: 1.05 });
    // holding: (0.01 − 0.012 + 0.30 + 0.01) / 4 = 0.077 → 1 + 4·0.077
    expect(m.holding).toMatchObject({ asset_type: 'mixed', symbol: 'ALL', components: 4, change_pct: 7.7, multiplier: 1.308 });
    expect(multipliersOf(m)).toEqual({ doviz: 1.08, altin: 0.928, hisse: 1.05, kripto: 1.8, holding: 1.308 });
  });

  it('prefers GOLD over GAU and says "Son işlem gününde" for an older bucket', () => {
    const m = computeMarket(
      [
        row('commodity', 'GOLD', '2030-06-12', 2000),
        row('commodity', 'GOLD', '2030-06-13', 2010),
        row('commodity', 'GAU', '2030-06-13', 3000),
        row('commodity', 'GAU', '2030-06-14', 3300),
      ],
      NOW
    );
    expect(m.altin).toMatchObject({ symbol: 'GOLD', change_pct: 0.5, multiplier: 1.03, as_of: '2030-06-14' });
    expect(m.altin!.headline.startsWith('Son işlem gününde altın %0,5 yükseldi')).toBe(true);
  });

  it('falls back to multiplier 1 with reason for missing or stale data', () => {
    const empty = computeMarket([], NOW);
    for (const id of ['doviz', 'altin', 'hisse', 'kripto', 'holding'] as const) {
      expect(empty[id]).toMatchObject({ multiplier: 1, change_pct: null, reason: 'veri yok' });
    }
    // Tek kova yetmez
    expect(computeMarket([row('crypto', 'BTC', '2030-06-14', 1)], NOW).kripto!.reason).toBe('veri yok');

    const stale = computeMarket([row('currency', 'USD', '2030-06-01', 40), row('currency', 'USD', '2030-06-02', 44)], NOW);
    expect(stale.doviz).toMatchObject({ multiplier: 1, reason: 'veri eski', change_pct: 10 });
    expect(stale.holding).toMatchObject({ multiplier: 1, reason: 'veri yok' });
  });
});

describe('idle tap limiter', () => {
  it('allows a burst of 20, then 10 taps per second', () => {
    const l = new TapLimiter({ perSecond: 10, burst: 20, perMinute: 1500 });
    const t0 = 1_000_000;
    expect(l.take('u', 20, t0)).toBe(20);
    expect(l.take('u', 5, t0)).toBe(0);
    expect(l.take('u', 20, t0 + 500)).toBe(5);
    expect(l.take('u', 20, t0 + 2500)).toBe(20);
    expect(l.take('other', 3, t0)).toBe(3);
  });

  it('caps taps per rolling minute', () => {
    const l = new TapLimiter({ perSecond: 1000, burst: 1000, perMinute: 1500 });
    const t0 = 5_000_000;
    expect(l.take('u', 1000, t0)).toBe(1000);
    expect(l.take('u', 1000, t0 + 1000)).toBe(500);
    expect(l.take('u', 10, t0 + 30_000)).toBe(0);
    expect(l.take('u', 10, t0 + 60_001)).toBe(10);
  });
});

describe('idle view', () => {
  it('builds the state DTO with costs, unlocks, market and milestones', () => {
    const s = state({ cash: 500, total_earned: 1500, buildings: { kumbara: 12, doviz: 2 } });
    const market = computeMarket([], NOW);
    const dto = buildStateDto({ state: s, market, accrual: null, now: NOW, awarded: [1000] });
    expect(dto.server_now).toBe(NOW.toISOString());
    expect(dto.buildings.map((b) => b.id)).toEqual(['kumbara', 'doviz', 'altin', 'hisse', 'kripto', 'holding']);
    const k = dto.buildings[0];
    expect(k).toMatchObject({ owned: 12, milestone_next: 25, unlocked: true, market: null, art_key: 'kumbara' });
    expect(k.next_cost).toBeCloseTo(costFor(15, 12, 1), 3);
    expect(k.cost_x10).toBeCloseTo(costFor(15, 12, 10), 3);
    expect(k.max_affordable).toBe(maxAffordable(15, 12, 500));
    expect(dto.buildings[2]).toMatchObject({ id: 'altin', unlocked: true });
    expect(dto.buildings[3]).toMatchObject({ id: 'hisse', unlocked: false });
    expect(dto.buildings[1].market).toMatchObject({ reason: 'veri yok', multiplier: 1 });
    expect(dto.income_per_sec).toBeCloseTo(12 * 0.5 + 2 * 4, 6);
    expect(dto.tap_value).toBe(1);
    expect(dto.milestones[0]).toEqual({ at: 1000, reached: true, awarded: true, reward: { coins: 10, xp: 15 } });
    expect(dto.milestones[1]).toMatchObject({ at: 100000, reached: false, awarded: false });
    expect(dto.offline).toEqual({ earned: 0, seconds: 0, credited_seconds: 0, capped: false, cap_seconds: OFFLINE_CAP_S });
    expect(dto.upgrades.find((u) => u.id === 'kumbara_1')).toMatchObject({ available: true, affordable: false, purchased: false });
    expect(dto.upgrades.find((u) => u.id === 'bilesik_faiz')).toMatchObject({ kind: 'global', building_id: null, available: true });
    expect(dto.tips.length).toBeGreaterThan(0);
    expect(dto.tips.length).toBeLessThanOrEqual(3);
  });

  it('tips mention diversification and prestige when relevant', () => {
    const market = computeMarket([], NOW);
    const two = buildTips(state({ buildings: { kumbara: 3, doviz: 1 } }), market, null, NOW);
    expect(two.some((t) => t.includes('Çeşitlendirme') && t.includes('+%25'))).toBe(true);
    const rich = buildTips(state({ total_earned: 4e8, buildings: { kumbara: 3 } }), market, null, NOW);
    expect(rich[0]).toContain('Halka Arz hazır: 20 pay');
    expect(buildTips(state(), market, null, NOW)[0]).toContain('İlk Kumbaranı');
  });

  it('every building has a positive cost/income and a unique art key', () => {
    expect(new Set(BUILDINGS.map((b) => b.art_key)).size).toBe(BUILDINGS.length);
    for (const b of BUILDINGS) expect(b.base_cost > 0 && b.base_income > 0).toBe(true);
    expect(BUILDING_BY_ID.holding.market?.kind).toBe('composite');
  });
});
