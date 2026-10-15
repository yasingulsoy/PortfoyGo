import { describe, expect, it } from 'vitest';
import { addDays, istanbulDay, istanbulDayStart, nextIstanbulMidnight } from '../src/services/game/common';
import {
  dativeSuffix,
  LEVELS,
  QUEST_POOL,
  QUESTS_PER_DAY,
  SHOP_ITEMS,
  TIERS,
  WHEEL_SEGMENTS,
  levelInfo,
  tierFor,
  totalXpForLevel,
  xpForLevel,
} from '../src/services/game/config';
import { duelOutcome, roundReward } from '../src/services/game/listeners';
import { questsForDay } from '../src/services/game/quests';
import { challengeDeltas, duelDeltas, expectedScore } from '../src/services/game/rating';
import { pickSegmentIndex, segmentDtos, totalWeight } from '../src/services/game/wheel';

/** Tohumlu PRNG (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (max: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * max);
  };
}

describe('seviye matematiği', () => {
  it('seviye n → n+1 için round(100·n^1.5) XP gerekir (kümülatif)', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(283);
    expect(xpForLevel(4)).toBe(800);
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(3)).toBe(383);
  });

  it('levelInfo: seviye, seviye içi XP, gereken, yüzde', () => {
    expect(levelInfo(0)).toEqual({ level: 1, xp_in_level: 0, needed: 100, pct: 0 });
    expect(levelInfo(99)).toEqual({ level: 1, xp_in_level: 99, needed: 100, pct: 99 });
    expect(levelInfo(100)).toEqual({ level: 2, xp_in_level: 0, needed: 283, pct: 0 });
    expect(levelInfo(383)).toMatchObject({ level: 3, xp_in_level: 0, needed: 520 });
    expect(levelInfo(-5).level).toBe(1);
    const max = levelInfo(totalXpForLevel(LEVELS.maxLevel) + 10);
    expect(max).toMatchObject({ level: LEVELS.maxLevel, needed: 0, pct: 100 });
  });

  it('seviyeler monoton artar', () => {
    let prev = 1;
    for (let xp = 0; xp < 50_000; xp += 37) {
      const l = levelInfo(xp).level;
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});

describe('Türkçe yönelme eki', () => {
  it('sayıya göre -e/-a/-ye/-ya', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n}${dativeSuffix(n)}`)).toEqual([
      "1'e", "2'ye", "3'e", "4'e", "5'e", "6'ya", "7'ye", "8'e", "9'a",
    ]);
    expect([10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => `${n}${dativeSuffix(n)}`)).toEqual([
      "10'a", "20'ye", "30'a", "40'a", "50'ye", "60'a", "70'e", "80'e", "90'a", "100'e",
    ]);
  });
});

describe('kademeler', () => {
  it('reyting → kademe eşlemesi', () => {
    expect(tierFor(0).id).toBe('bronze');
    expect(tierFor(1099)).toEqual({ id: 'bronze', label: 'Bronz', min: 0, next_min: 1100 });
    expect(tierFor(1100).id).toBe('silver');
    expect(tierFor(1249).id).toBe('silver');
    expect(tierFor(1250)).toEqual({ id: 'gold', label: 'Altın', min: 1250, next_min: 1400 });
    expect(tierFor(1399).id).toBe('gold');
    expect(tierFor(1400).id).toBe('platinum');
    expect(tierFor(1599).label).toBe('Platin');
    expect(tierFor(1600)).toEqual({ id: 'diamond', label: 'Elmas', min: 1600, next_min: null });
    expect(TIERS.map((t) => t.id)).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
  });
});

describe('ELO', () => {
  it('eşit reytingde galibiyet ±16 (K=32), toplam sıfır', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(duelDeltas(1000, 1000, 1)).toEqual([16, -16]);
    expect(duelDeltas(1000, 1000, 0)).toEqual([-16, 16]);
  });

  it('beraberlik: eşitte 0, güçlü taraf puan kaybeder', () => {
    const [a, b] = duelDeltas(1000, 1000, 0.5);
    expect(a + 0).toBe(0);
    expect(b + 0).toBe(0);
    const [strong, weak] = duelDeltas(1200, 1000, 0.5);
    expect(strong).toBe(-8);
    expect(weak).toBe(8);
  });

  it('sürpriz galibiyet daha çok puan getirir', () => {
    const [upset] = duelDeltas(1000, 1400, 1);
    const [expected] = duelDeltas(1400, 1000, 1);
    expect(upset).toBeGreaterThan(expected);
    expect(upset).toBe(29);
    expect(expected).toBe(3);
  });

  it('meydan okuma: ikili ELO, K = 16/(n−1)', () => {
    const d = challengeDeltas([
      { user_id: 'a', rating: 1000, rank: 1 },
      { user_id: 'b', rating: 1000, rank: 2 },
      { user_id: 'c', rating: 1000, rank: 3 },
    ]);
    expect(d.get('a')).toBe(8);
    expect(d.get('b')! + 0).toBe(0);
    expect(d.get('c')).toBe(-8);
    // Eşit sıra = beraberlik
    const tie = challengeDeltas([
      { user_id: 'a', rating: 1000, rank: 1 },
      { user_id: 'b', rating: 1000, rank: 1 },
    ]);
    expect(tie.get('a')! + 0).toBe(0);
    // Tek katılımcı: değişim yok
    expect(challengeDeltas([{ user_id: 'a', rating: 1000, rank: 1 }]).get('a')).toBe(0);
  });

  it('meydan okuma: kişi başı değişim ±cap ile sınırlı', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ user_id: `u${i}`, rating: 1000, rank: i + 1 }));
    const d = challengeDeltas(players, 400, 40);
    expect(d.get('u0')).toBe(40);
    expect(d.get('u9')).toBe(-40);
    for (const v of d.values()) expect(Math.abs(v)).toBeLessThanOrEqual(40);
    // Varsayılan K=16'da hiçbir değişim 16'yı aşamaz
    const def = challengeDeltas(players);
    for (const v of def.values()) expect(Math.abs(v)).toBeLessThanOrEqual(16);
  });

  it('düello sonucu: önce sıra, yoksa getiri', () => {
    const e = (rank: number | null, ret: number) => ({ user_id: 'x', return_pct: ret, rank, trades_count: 1, equity_final: 1 });
    expect(duelOutcome(e(1, -5), e(2, 5))).toBe('win');
    expect(duelOutcome(e(1, 0), e(1, 0))).toBe('draw');
    expect(duelOutcome(e(null, 1), e(null, 2))).toBe('loss');
    expect(duelOutcome(e(null, 1), e(null, 1))).toBe('draw');
  });
});

describe('tur ödülleri', () => {
  const entry = (ret: number) => ({ user_id: 'x', return_pct: ret, rank: 1, trades_count: 1, equity_final: 1 });
  it('solo/senaryo: +15 XP +10 jeton, pozitif getiriye en fazla +20 XP', () => {
    expect(roundReward('solo', entry(-1), {}).base).toMatchObject({ xp: 15, coins: 10 });
    expect(roundReward('solo', entry(0.5), {}).base).toMatchObject({ xp: 20, coins: 10 });
    expect(roundReward('scenario', entry(9), {}).base).toMatchObject({ xp: 35, coins: 10 });
  });
  it('düello: galibiyet/mağlubiyet/beraberlik; bota karşı jeton yok', () => {
    expect(roundReward('duel', entry(1), { outcome: 'win' }).base).toMatchObject({ xp: 40, coins: 30, reason: 'duel_win' });
    expect(roundReward('duel', entry(1), { outcome: 'loss' }).base).toMatchObject({ xp: 15, coins: 5, reason: 'duel_loss' });
    expect(roundReward('duel', entry(1), { outcome: 'draw' }).base).toMatchObject({ xp: 25, coins: 15, reason: 'duel_draw' });
    expect(roundReward('duel', entry(1), { outcome: 'win', vsBot: true }).base).toMatchObject({ xp: 40, coins: 0 });
  });
  it('meydan okuma: katılım + ilk 3 bonusu', () => {
    const r1 = roundReward('challenge', entry(1), { rank: 1 });
    expect(r1.base).toMatchObject({ xp: 50, coins: 20 });
    expect(r1.bonus).toMatchObject({ xp: 50, coins: 100, reason: 'challenge_top3' });
    expect(roundReward('challenge', entry(1), { rank: 4 }).bonus).toBeUndefined();
  });
});

describe('günlük görev seçimi', () => {
  it('(kullanıcı, gün) için deterministik, gün başına 3 farklı görev', () => {
    const uid = '7b0d1b7e-2f4c-4f43-9a40-9d2b3c0f1a11';
    const a = questsForDay(uid, '2026-10-11').map((q) => q.key);
    const b = questsForDay(uid, '2026-10-11').map((q) => q.key);
    expect(a).toEqual(b);
    expect(a).toHaveLength(QUESTS_PER_DAY);
    expect(new Set(a).size).toBe(QUESTS_PER_DAY);
    const sets = new Set<string>();
    for (let i = 0; i < 14; i++) sets.add(questsForDay(uid, addDays('2026-10-01', i)).map((q) => q.key).sort().join(','));
    expect(sets.size).toBeGreaterThan(3);
  });

  it('havuz: 6–8 görev, ödüller 30–80 jeton ve 20–60 XP', () => {
    expect(QUEST_POOL.length).toBeGreaterThanOrEqual(6);
    expect(QUEST_POOL.length).toBeLessThanOrEqual(8);
    for (const q of QUEST_POOL) {
      expect(q.reward.coins).toBeGreaterThanOrEqual(30);
      expect(q.reward.coins).toBeLessThanOrEqual(80);
      expect(q.reward.xp).toBeGreaterThanOrEqual(20);
      expect(q.reward.xp).toBeLessThanOrEqual(60);
    }
  });
});

describe('şans çarkı', () => {
  it('8 dilim, olasılıklar toplamı %100', () => {
    expect(WHEEL_SEGMENTS).toHaveLength(8);
    expect(totalWeight()).toBe(100);
    const sum = segmentDtos().reduce((s, x) => s + x.probability_pct, 0);
    expect(sum).toBeCloseTo(100, 6);
    expect(segmentDtos().find((s) => s.id === 'coins-20')!.probability_pct).toBe(28);
    expect(segmentDtos().find((s) => s.kind === 'cosmetic')).toMatchObject({ item_id: 'frame-wheel', probability_pct: 3 });
  });

  it('ağırlıklı seçim sınırları', () => {
    expect(pickSegmentIndex(() => 0)).toBe(0);
    expect(pickSegmentIndex(() => 27)).toBe(0);
    expect(pickSegmentIndex(() => 28)).toBe(1);
    expect(pickSegmentIndex(() => 99)).toBe(WHEEL_SEGMENTS.length - 1);
    // Geçersiz RNG çıktısı ilk dilime düşer
    expect(pickSegmentIndex(() => 1000)).toBe(0);
  });

  it('tohumlu RNG ile dağılım ağırlıklara yakınsar (100k çevirme)', () => {
    const rand = seeded(20261011);
    const n = 100_000;
    const counts = new Array(WHEEL_SEGMENTS.length).fill(0);
    for (let i = 0; i < n; i++) counts[pickSegmentIndex(rand)] += 1;
    WHEEL_SEGMENTS.forEach((s, i) => {
      expect(Math.abs((counts[i] / n) * 100 - s.weight)).toBeLessThan(0.75);
    });
  });

  it('gerçek crypto RNG ile örnekleme tüm dilimleri üretir', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(pickSegmentIndex());
    expect(seen.size).toBe(WHEEL_SEGMENTS.length);
  });
});

describe('mağaza tanımları', () => {
  it('avatar-1..12, ilk 3 varsayılan; fiyatlar 100–600', () => {
    const avatars = SHOP_ITEMS.filter((i) => i.kind === 'avatar');
    expect(avatars.map((a) => a.id)).toEqual(Array.from({ length: 12 }, (_, i) => `avatar-${i + 1}`));
    expect(avatars.slice(0, 3).every((a) => a.unlock.type === 'default')).toBe(true);
    for (const a of avatars.slice(3)) {
      expect(a.unlock.type).toBe('coins');
      const v = (a.unlock as { value: number }).value;
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(600);
    }
    expect(SHOP_ITEMS.find((i) => i.id === 'frame-wheel')?.unlock.type).toBe('wheel');
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    for (const i of SHOP_ITEMS) expect(i.id.length).toBeLessThanOrEqual(32);
  });
});

describe('İstanbul günü', () => {
  it('UTC 21:00 → İstanbul gece yarısı', () => {
    expect(istanbulDay(new Date('2026-03-01T20:59:59Z'))).toBe('2026-03-01');
    expect(istanbulDay(new Date('2026-03-01T21:00:00Z'))).toBe('2026-03-02');
    expect(istanbulDayStart(new Date('2026-03-02T10:00:00Z')).toISOString()).toBe('2026-03-01T21:00:00.000Z');
    expect(nextIstanbulMidnight(new Date('2026-03-02T10:00:00Z')).toISOString()).toBe('2026-03-02T21:00:00.000Z');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});
