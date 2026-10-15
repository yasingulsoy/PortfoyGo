import { describe, expect, it } from 'vitest';
import { RARITY_META, rarityMeta, shopItemState, sortShopItems, tierLabel, toRarity, toShopItem, toShopItems, unlockHint } from './model';
import { DEFAULT_TIERS, podiumOrder, tierProgress, toGameLeaderboard, toTierSteps } from '../ranks/model';
import { isOnBreak, toResponsibleState } from '../responsible/model';

describe('nadirlik eşlemesi', () => {
  it('bilinen değerler ve büyük/küçük harf', () => {
    expect(toRarity('rare')).toBe('rare');
    expect(toRarity('LEGENDARY')).toBe('legendary');
    expect(toRarity('mythic')).toBe('common');
    expect(toRarity(undefined)).toBe('common');
  });

  it('etiket, sıra ve sınıf', () => {
    expect(rarityMeta('epic')).toEqual({ label: 'Destansı', order: 2, face: '--g-purple', edge: '--g-purple-edge', glow: true });
    expect(rarityMeta('common').glow).toBe(false);
    expect(RARITY_META.legendary.label).toBe('Efsanevi');
    expect(rarityMeta('???').label).toBe('Sıradan');
  });
});

describe('mağaza öğeleri', () => {
  const raw = [
    { id: 'avatar-1', kind: 'avatar', name: 'Çaylak Boğa', price_coins: null, rarity: 'common', owned: true, equipped: true, unlock: { type: 'default' } },
    {
      id: 'avatar-7',
      kind: 'avatar',
      name: 'Kartal Göz',
      price_coins: 250,
      rarity: 'rare',
      owned: false,
      equipped: false,
      unlock: { type: 'coins', value: 250 },
    },
    {
      id: 'frame-gold',
      kind: 'frame',
      name: 'Altın Çerçeve',
      price_coins: null,
      rarity: 'epic',
      owned: false,
      equipped: false,
      unlock: { type: 'tier', value: 'gold' },
    },
    {
      id: 'frame-wheel',
      kind: 'frame',
      name: 'Çark Çerçevesi',
      price_coins: null,
      rarity: 'legendary',
      owned: false,
      equipped: false,
      unlock: { type: 'wheel' },
    },
    {
      id: 'avatar-4',
      kind: 'avatar',
      name: 'Bilge Baykuş',
      price_coins: 100,
      rarity: 'common',
      owned: true,
      equipped: false,
      unlock: { type: 'coins', value: 100 },
    },
  ];

  it('normalize eder', () => {
    const items = toShopItems({ items: raw });
    expect(items).toHaveLength(5);
    expect(items[1].price_coins).toBe(250);
    expect(items[2].unlock).toEqual({ type: 'tier', value: 'gold' });
    expect(items[3].unlock).toEqual({ type: 'wheel', value: null });
    expect(toShopItem({ id: 'x', price_coins: 10 }).unlock.type).toBe('coins');
  });

  it('kart durumu', () => {
    const [eq, buy, tier, wheel, owned] = toShopItems({ items: raw });
    expect(shopItemState(eq, 0)).toBe('equipped');
    expect(shopItemState(owned, 0)).toBe('owned');
    expect(shopItemState(buy, 300)).toBe('buyable');
    expect(shopItemState(buy, 100)).toBe('too-expensive');
    expect(shopItemState(buy, null)).toBe('buyable');
    expect(shopItemState(tier, 9999)).toBe('locked');
    expect(shopItemState(wheel, 9999)).toBe('locked');
  });

  it('kilit ipuçları', () => {
    const [, buy, tier, wheel] = toShopItems({ items: raw });
    expect(unlockHint(tier)).toBe('Altın kademesine ulaşınca açılır');
    expect(unlockHint(wheel)).toBe('Günlük Çark’tan kazanılır');
    expect(unlockHint(buy)).toBe('250 jeton');
    expect(tierLabel('DIAMOND')).toBe('Elmas');
  });

  it('sıralama: kuşanılan → sahip olunan → satın alınabilir → kilitli', () => {
    expect(sortShopItems(toShopItems({ items: raw })).map((i) => i.id)).toEqual(['avatar-1', 'avatar-4', 'avatar-7', 'frame-gold', 'frame-wheel']);
  });
});

describe('kademeler ve sıralama', () => {
  it('kademe ilerlemesi', () => {
    expect(tierProgress(1000).current.id).toBe('bronze');
    const p = tierProgress(1175);
    expect(p.current.id).toBe('silver');
    expect(p.next?.id).toBe('gold');
    expect(p.pct).toBe(50);
    expect(p.toNext).toBe(75);
    expect(tierProgress(5000)).toMatchObject({ pct: 100, next: null, toNext: 0 });
  });

  it('sunucu eşikleri okunur; geçersizse varsayılan', () => {
    expect(
      toTierSteps([
        { id: 'bronze', min: 0 },
        { id: 'gold', min: 1300 },
      ]).map((t) => t.id),
    ).toEqual(['bronze', 'gold']);
    expect(toTierSteps({ bronze: 0, silver: 900 })[1]).toEqual({ id: 'silver', label: 'Gümüş', min: 900 });
    expect(toTierSteps(null)).toBe(DEFAULT_TIERS);
  });

  it('kürsü sırası 2-1-3', () => {
    expect(podiumOrder([{ rank: 3 }, { rank: 1 }, { rank: 2 }, { rank: 4 }]).map((r) => r.rank)).toEqual([2, 1, 3]);
    expect(podiumOrder([{ rank: 1 }]).map((r) => r.rank)).toEqual([1]);
  });

  it('liderlik tablosu', () => {
    const lb = toGameLeaderboard({ items: [{ username: 'a', value: '1200', tier: 'silver' }], me: { rank: 12, username: 'demo', value: 1000 } });
    expect(lb.items[0]).toMatchObject({ rank: 1, value: 1200, level: null });
    expect(lb.me?.rank).toBe(12);
    expect(toGameLeaderboard({ items: [{ rank: 1, username: 'x', tier: { id: 'gold', label: 'Altın' } }] }).items[0].tier).toBe('gold');
    expect(toGameLeaderboard({ items: [], me: { rank: null, username: 'demo', value: 1000 } }).me?.rank).toBeNull();
  });
});

describe('sorumlu oyun', () => {
  it('durum güvenle okunur', () => {
    const s = toResponsibleState({ adult_confirmed: true, daily_round_limit: 3, session_reminder_minutes: 45, loss_streak: '4', break_until: 'x' });
    expect(s).toMatchObject({ adult_confirmed: true, daily_round_limit: 5, session_reminder_minutes: null, loss_streak: 4, break_until: null });
    expect(toResponsibleState(undefined).adult_confirmed).toBe(false);
  });

  it('mola', () => {
    const now = Date.parse('2026-10-11T10:00:00Z');
    expect(isOnBreak({ break_until: '2026-10-11T11:00:00Z' }, now)).toBe(true);
    expect(isOnBreak({ break_until: '2026-10-11T09:00:00Z' }, now)).toBe(false);
    expect(isOnBreak(null, now)).toBe(false);
  });
});
