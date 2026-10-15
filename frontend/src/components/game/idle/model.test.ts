import { describe, expect, it } from 'vitest';
import {
  buyOption,
  cashAt,
  costOf,
  formatAway,
  formatCoins,
  formatRate,
  formatShort,
  growthFrom,
  marketChipText,
  marketHref,
  maxAffordable,
  milestoneProgress,
  nextAccountMilestone,
  skylineLevel,
  spokenShort,
  takeTapBatch,
  toIdleState,
} from './model';

describe('formatShort (Türkçe kısa ölçek)', () => {
  it('küçük sayılar', () => {
    expect(formatShort(0)).toBe('0');
    expect(formatShort(0.5)).toBe('0,5');
    expect(formatShort(1.256)).toBe('1,25');
    expect(formatShort(12.46)).toBe('12,4');
    expect(formatShort(845.9)).toBe('845');
  });

  it('birimler: Bin, Mn, Mr, Tn, Kat, Kent', () => {
    expect(formatShort(1_000)).toBe('1 Bin');
    expect(formatShort(1_234)).toBe('1,23 Bin');
    expect(formatShort(45_678)).toBe('45,6 Bin');
    expect(formatShort(999_999)).toBe('999 Bin');
    expect(formatShort(12_400_000)).toBe('12,4 Mn');
    expect(formatShort(1.5e9)).toBe('1,5 Mr');
    expect(formatShort(2e12)).toBe('2 Tn');
    expect(formatShort(3.3e15)).toBe('3,3 Kat');
    expect(formatShort(7.77e18)).toBe('7,77 Kent');
  });

  it('yuvarlama modu ve birim taşması', () => {
    expect(formatShort(999_999, { mode: 'round' })).toBe('1 Mn');
    expect(formatShort(1_001, { mode: 'ceil' })).toBe('1,01 Bin');
    expect(formatShort(1_234.5, { mode: 'floor' })).toBe('1,23 Bin');
  });

  it('negatif, NaN ve çok büyük değerler', () => {
    expect(formatShort(-1_500)).toBe('-1,5 Bin');
    expect(formatShort(NaN)).toBe('0');
    expect(formatShort(undefined)).toBe('0');
    expect(formatShort(1e40)).toMatch(/^1e40$/);
  });

  it('para ve gelir biçimleri', () => {
    expect(formatCoins(12_400_000)).toBe('₺12,4 Mn');
    expect(formatRate(1_250)).toBe('+₺1,25 Bin/sn');
    expect(spokenShort('₺12,4 Mn')).toBe('₺12,4 milyon');
  });
});

describe('cashAt (bakiye ara değerlemesi)', () => {
  const anchor = { cash: 100, income_per_sec: 2.5, at: 10_000 };

  it('geçen süreyle gelir ekler', () => {
    expect(cashAt(anchor, 10_000)).toBe(100);
    expect(cashAt(anchor, 14_000)).toBe(110);
  });

  it('saat geri giderse eksiye düşmez, bekleyen dokunuş kazancını ekler', () => {
    expect(cashAt(anchor, 9_000)).toBe(100);
    expect(cashAt(anchor, 10_000, 7)).toBe(107);
  });

  it('senkron gelmezse en fazla 120 sn ileri koşar', () => {
    expect(cashAt(anchor, 10_000 + 600_000)).toBe(100 + 2.5 * 120);
  });

  it('geçersiz gelir 0 sayılır', () => {
    expect(cashAt({ cash: 5, income_per_sec: NaN, at: 0 }, 5_000)).toBe(5);
  });
});

describe('dokunuş partileri', () => {
  it('en fazla 20 dokunuş gönderir', () => {
    expect(takeTapBatch(0)).toEqual({ send: 0, rest: 0 });
    expect(takeTapBatch(7)).toEqual({ send: 7, rest: 0 });
    expect(takeTapBatch(45)).toEqual({ send: 20, rest: 25 });
  });
});

describe('satın alma maliyeti (x1 / x10 / MAX)', () => {
  // temel 15, ×1,15 büyüme
  const next = 15;
  const x10 = costOf(15, 10, 1.15);
  const b = { name: 'Kumbara', next_cost: next, cost_x10: x10 };

  it('cost_x10 / next_cost oranından büyümeyi çözer', () => {
    expect(growthFrom(next, x10)).toBeCloseTo(1.15, 6);
    expect(growthFrom(10, 100)).toBe(1);
    expect(growthFrom(0, 0)).toBe(1.15);
  });

  it('geometrik seri toplamı', () => {
    expect(costOf(15, 1)).toBeCloseTo(15, 9);
    expect(costOf(15, 2)).toBeCloseTo(15 + 17.25, 9);
    expect(costOf(15, 0)).toBe(0);
  });

  it('bakiyeyle alınabilecek en fazla adet', () => {
    expect(maxAffordable(14.99, 15)).toBe(0);
    expect(maxAffordable(15, 15)).toBe(1);
    expect(maxAffordable(32.25, 15)).toBe(2);
    expect(maxAffordable(32.24, 15)).toBe(1);
    expect(maxAffordable(1e300, 15)).toBe(1000);
  });

  it('x1 ve x10 çipleri fiyatı yukarı yuvarlar ve uygunluğu bildirir', () => {
    const one = buyOption(b, 1, 20);
    expect(one).toMatchObject({ count: 1, cost: 15, affordable: true, label: 'x1', price: '₺15' });
    const ten = buyOption(b, 10, 20);
    expect(ten.affordable).toBe(false);
    expect(ten.label).toBe('x10');
    expect(ten.price).toBe('₺305');
    expect(buyOption(b, 10, x10).affordable).toBe(true);
  });

  it('MAX çipi adet gösterir; bakiye yetmezse pasif', () => {
    const max = buyOption(b, 'max', 100);
    expect(max.count).toBe(4); // 15+17,25+19,84+22,81 = 74,9; 5. adet 101,1
    expect(max.price).toBe('×4');
    expect(max.cost).toBeLessThanOrEqual(100);
    expect(buyOption(b, 'max', 1)).toMatchObject({ count: 0, affordable: false, price: '×0' });
  });
});

describe('ilerleme ve piyasa çipi', () => {
  it('×2 eşiğine ilerleme önceki eşikten başlar', () => {
    expect(milestoneProgress(10, 25)).toEqual({ prev: 0, next: 25, pct: 40 });
    expect(milestoneProgress(30, 50).prev).toBe(25);
    expect(milestoneProgress(30, 50).pct).toBe(20);
    expect(milestoneProgress(250, null).pct).toBe(100);
  });

  it('hesap kilometre taşları', () => {
    const list = [
      { at: 1000, reached: true, reward: { coins: 10, xp: 5 } },
      { at: 100_000, reached: false, reward: { coins: 50, xp: 20 } },
    ];
    const r = nextAccountMilestone(list, 50_500);
    expect(r.reached).toBe(1);
    expect(r.next?.at).toBe(100_000);
    expect(Math.round(r.pct)).toBe(50);
  });

  it('piyasa çipi metni ve bağlantı', () => {
    const m = { asset_type: 'commodity', symbol: 'GOLD', label: 'Altın', change_pct: 1.2, multiplier: 1.07 };
    expect(marketChipText(m)).toBe('Bugün Altın %1,2 ↑ → ×1,07');
    expect(marketChipText({ ...m, change_pct: -0.84, multiplier: 0.95 })).toBe('Bugün Altın %0,8 ↓ → ×0,95');
    expect(marketHref(m)).toBe('/asset/GOLD?type=commodity');
    expect(marketHref({ ...m, symbol: '' })).toBeNull();
    // Sepet / tüm piyasalar: varlık sayfası yok; parantezli açıklama çipte kısaltılır
    const basket = { asset_type: 'stock', symbol: 'BASKET', label: 'Hisse sepeti (eşit ağırlık)', change_pct: -0.1, multiplier: 0.99 };
    expect(marketHref(basket)).toBeNull();
    expect(marketHref({ ...basket, asset_type: 'mixed', symbol: 'ALL' })).toBeNull();
    expect(marketChipText(basket)).toBe('Bugün Hisse sepeti %0,1 ↓ → ×0,99');
    expect(marketChipText({ ...m, change_pct: null, reason: 'veri eski', multiplier: 1 })).toBe('Altın: veri eski → ×1,00');
  });

  it('süre ve siluet seviyesi', () => {
    expect(formatAway(3725)).toBe('1 sa 2 dk');
    expect(formatAway(95)).toBe('1 dk 35 sn');
    expect(skylineLevel(0)).toBe(0);
    expect(skylineLevel(1)).toBe(1);
    expect(skylineLevel(1_000_000)).toBe(6);
  });
});

describe('toIdleState', () => {
  it('eksik alanları güvenle doldurur ve zarfı açar', () => {
    const s = toIdleState({
      success: true,
      data: {
        cash: '12.5',
        income_per_sec: 2,
        buildings: [{ id: 'kumbara', owned: '3', next_cost: 20, market: null }],
        prestige: { shares: 2, available: true },
        offline: { earned: 500, seconds: 3600, capped: false },
      },
    });
    expect(s.cash).toBe(12.5);
    expect(s.buildings[0]).toMatchObject({ id: 'kumbara', owned: 3, art_key: 'kumbara', unlocked: true });
    expect(s.prestige.available).toBe(true);
    expect(s.offline?.earned).toBe(500);
    expect(s.tap_value).toBe(1);
  });
});
