import { describe, expect, it } from 'vitest';
import type { MarketAsset } from '@/types';
import { marqueeDuration, marqueeHalf, tickerItem, tickerItems, tickerTabs } from './tickerModel';

const norm = (s: string | null | undefined) => (s == null ? s : s.replace(/[  ]/g, ' '));
const TL = { currency: 'TRY' as const, usdTry: 40 };
const USD = { currency: 'USD' as const, usdTry: 40 };

const asset = (over: Partial<MarketAsset> & Pick<MarketAsset, 'type' | 'symbol'>): MarketAsset => ({
  key: `${over.type}:${over.symbol}`,
  name: over.symbol,
  priceTRY: 4000,
  priceUSD: null,
  changePercent: 0,
  ...over,
});

describe('tickerTabs', () => {
  it('yalnızca gerçek veri olan pazarlar; izleme listesi doluysa eklenir', () => {
    expect(tickerTabs(false).map((t) => t.value)).toEqual(['stock', 'crypto', 'currency', 'commodity']);
    expect(tickerTabs(true).map((t) => t.label)).toEqual(['ABD Hisseleri', 'Kripto', 'Döviz', 'Emtia', 'İzleme listem']);
  });
});

describe('tickerItem', () => {
  it('hisse: TL görünümde TL, USD görünümde kendi USD kotasyonu; mutlak ve yüzde değişim', () => {
    const aapl = asset({ type: 'stock', symbol: 'AAPL', priceTRY: 4400, priceUSD: 110, changePercent: 10 });
    const tl = tickerItem(aapl, TL)!;
    expect(norm(tl.price)).toBe('₺4.400,00');
    expect(norm(tl.change)).toBe('+₺400,00');
    expect(tl.percent).toBe('+%10,00');
    expect(tl.trend).toBe('up');
    expect(tl.href).toBe('/asset/AAPL?type=stock');

    const us = tickerItem(aapl, USD)!;
    expect(norm(us.price)).toBe('$110,00');
    expect(norm(us.change)).toBe('+$10,00');
  });

  it('döviz kur olarak okunur; USD her zaman TL', () => {
    const eur = asset({ type: 'currency', symbol: 'EUR', priceTRY: 48, changePercent: -1 });
    const usd = asset({ type: 'currency', symbol: 'USD', priceTRY: 40 });
    expect(norm(tickerItem(eur, TL)!.price)).toBe('1 EUR = ₺48,00');
    expect(norm(tickerItem(eur, USD)!.price)).toBe('1 EUR = $1,20');
    expect(tickerItem(eur, USD)!.trend).toBe('down');
    expect(norm(tickerItem(usd, USD)!.price)).toBe('1 USD = ₺40,00');
    // Kur bilinmiyorsa USD tercihinde de TL
    expect(norm(tickerItem(eur, { currency: 'USD', usdTry: null })!.price)).toBe('1 EUR = ₺48,00');
  });

  it('TL kotasyonlu emtia USD görünümde kurla çevrilir; fiyatsız varlık atlanır', () => {
    const gau = asset({ type: 'commodity', symbol: 'GAU', priceTRY: 6600 });
    expect(norm(tickerItem(gau, USD)!.price)).toBe('$165,00');
    expect(tickerItem(asset({ type: 'stock', symbol: 'X', priceTRY: null }), TL)).toBeNull();
    expect(tickerItems([gau, asset({ type: 'stock', symbol: 'X', priceTRY: null })], TL).map((i) => i.symbol)).toEqual(['GAU']);
    expect(tickerItems(Array.from({ length: 80 }, (_, i) => asset({ type: 'crypto', symbol: `C${i}` })), TL)).toHaveLength(60);
  });
});

describe('marquee', () => {
  it('kısa listeler yarıyı dolduracak kadar tekrarlanır; anahtarlar benzersiz', () => {
    const items = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const half = marqueeHalf(items, 7);
    expect(half.map((h) => h.key)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a']);
    expect(new Set(half.map((h) => h.loopKey)).size).toBe(half.length);
    expect(marqueeHalf([], 10)).toEqual([]);
    const long = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}` }));
    expect(marqueeHalf(long, 10)).toHaveLength(30);
  });

  it('süre genişlikle orantılı (sabit hız), alt sınırlı', () => {
    expect(marqueeDuration(4500, 45)).toBe(100);
    expect(marqueeDuration(9000, 45)).toBe(200);
    expect(marqueeDuration(100, 45, 15)).toBe(15);
    expect(marqueeDuration(0)).toBe(60);
  });
});
