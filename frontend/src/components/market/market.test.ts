import { describe, expect, it } from 'vitest';
import type { MarketAsset } from '@/types';
import { filterAssets } from './MarketTable';
import { pickTopAssets } from './TopAssetCards';
import { topMovers } from './TrendingAssets';
import { sparklinePoints, sparklineTrend } from '@/components/asset/Sparkline';
import { axisPrice, withAlpha } from '@/components/asset/chartTheme';
import { absoluteChange } from '@/components/asset/AssetHeaderCard';
import { rangePosition } from '@/components/asset/AssetSummaryCard';
import { pageList } from '@/components/dashboard/RecentTransactionsCard';
import { filterNewsFor, normalizeNews } from '@/components/dashboard/useNews';

const asset = (type: MarketAsset['type'], symbol: string, changePercent: number, priceTRY: number | null = 10, name = symbol): MarketAsset => ({
  key: `${type}:${symbol}`,
  type,
  symbol,
  name,
  priceTRY,
  priceUSD: null,
  changePercent,
});

describe('pickTopAssets', () => {
  it('uses watchlist first and fills with popular defaults without duplicates', () => {
    const out = pickTopAssets([
      { asset_type: 'crypto', symbol: 'btc' },
      { asset_type: 'stock', symbol: 'TSLA' },
    ]);
    expect(out.map((r) => `${r.type}:${r.symbol}`)).toEqual(['crypto:BTC', 'stock:TSLA', 'stock:AAPL', 'currency:USD']);
  });

  it('caps at the requested count', () => {
    const watch = ['A', 'B', 'C', 'D', 'E'].map((s) => ({ asset_type: 'stock' as const, symbol: s }));
    expect(pickTopAssets(watch)).toHaveLength(4);
  });

  it('skips unavailable defaults in favour of backups', () => {
    const out = pickTopAssets([], 4, (r) => r.symbol !== 'GAU');
    expect(out.map((r) => r.symbol)).toEqual(['AAPL', 'BTC', 'USD', 'EUR']);
  });

  it('still returns popular cards when nothing is available', () => {
    expect(pickTopAssets([], 4, () => false).map((r) => r.symbol)).toEqual(['AAPL', 'BTC', 'USD', 'GAU']);
  });
});

describe('topMovers', () => {
  it('sorts by absolute change and drops unpriced assets', () => {
    const out = topMovers({
      stock: [asset('stock', 'A', 1), asset('stock', 'B', -5)],
      crypto: [asset('crypto', 'C', 3), asset('crypto', 'D', 9, null)],
    });
    expect(out.map((a) => a.symbol)).toEqual(['B', 'C', 'A']);
  });
});

describe('filterAssets', () => {
  const list = [asset('stock', 'AAPL', 0, 1, 'Apple Inc'), asset('currency', 'TRY', 0, 1, 'Türk Lirası')];
  it('matches symbol or name case-insensitively (Turkish locale)', () => {
    expect(filterAssets(list, 'apple').map((a) => a.symbol)).toEqual(['AAPL']);
    expect(filterAssets(list, 'LİRA').map((a) => a.symbol)).toEqual(['TRY']);
    expect(filterAssets(list, '  ')).toBe(list);
  });
});

describe('sparkline helpers', () => {
  it('maps values into the box with the max at the top', () => {
    expect(sparklinePoints([1, 3], 10, 10, 0)).toBe('0.00,10.00 10.00,0.00');
  });
  it('centers a flat series and ignores non-finite values', () => {
    expect(sparklinePoints([2, Number.NaN, 2], 10, 10)).toBe('0.00,5.00 10.00,5.00');
    expect(sparklinePoints([1], 10, 10)).toBe('');
  });
  it('detects the trend from finite first/last values', () => {
    expect(sparklineTrend([Number.NaN, 1, 2])).toBe('up');
    expect(sparklineTrend([3, 1])).toBe('down');
    expect(sparklineTrend(null)).toBe('flat');
  });
});

describe('chart theme helpers', () => {
  it('converts hex and rgb colors to rgba', () => {
    expect(withAlpha('#465fff', 0.2)).toBe('rgba(70, 95, 255, 0.2)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(withAlpha('rgb(18 183 106 / 0.15)', 0.5)).toBe('rgba(18, 183, 106, 0.5)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });
  it('formats axis prices by magnitude', () => {
    expect(axisPrice(4957883.4)).toBe('4.957.883');
    expect(axisPrice(245.1)).toBe('245,10');
    expect(axisPrice(0.0123)).toBe('0,0123');
  });
});

describe('absoluteChange', () => {
  it('derives the absolute move from price and percent', () => {
    expect(absoluteChange(110, 10)).toBeCloseTo(10);
    expect(absoluteChange(90, -10)).toBeCloseTo(-10);
    expect(absoluteChange(null, 5)).toBeNull();
    expect(absoluteChange(10, -100)).toBeNull();
  });
});

describe('rangePosition', () => {
  it('returns the clamped position within the day range', () => {
    expect(rangePosition(10, 20, 15)).toBe(50);
    expect(rangePosition(10, 20, 25)).toBe(100);
    expect(rangePosition(10, 10, 10)).toBeNull();
    expect(rangePosition(undefined, 20, 15)).toBeNull();
  });
});

describe('pageList', () => {
  it('lists all pages when few', () => {
    expect(pageList(1, 3)).toEqual([1, 2, 3]);
  });
  it('collapses distant pages', () => {
    expect(pageList(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageList(1, 10)).toEqual([1, 2, 'gap', 10]);
  });
});

describe('news helpers', () => {
  const items = normalizeNews({
    data: [
      { title: 'Apple yeni iPhone’u tanıttı', link: 'https://example.com/a', categories: ['Teknoloji'], description: '' },
      { title: 'Dolar/TL rekor kırdı', link: 'https://example.com/b', description: 'Kur güne yükselişle başladı' },
      { title: 'Zararlı bağlantı', link: 'javascript:alert(1)' },
      { title: 'Tekrar', link: 'https://example.com/a' },
      { title: 'SNAAPL değil', link: 'https://example.com/c' },
    ],
  });

  it('drops unsafe links and duplicates', () => {
    expect(items.map((n) => n.link)).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  });

  it('matches by whole-word symbol, company name or extra keywords', () => {
    expect(filterNewsFor(items, 'AAPL', 'Apple Inc.').map((n) => n.link)).toEqual(['https://example.com/a']);
    expect(filterNewsFor(items, 'USD', undefined, ['dolar']).map((n) => n.link)).toEqual(['https://example.com/b']);
    expect(filterNewsFor(items, 'X')).toEqual([]);
  });
});
