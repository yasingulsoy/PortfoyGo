import { describe, expect, it } from 'vitest';
import { sumWeights } from '@/components/sandbox/model';
import type { AssetSearchItem } from '@/components/sandbox/types';
import { advisorTemplateRows, balancedTemplate, cashTemplate, defaultBasket, equalTemplate, findGold } from './templates';

const item = (asset_type: AssetSearchItem['asset_type'], symbol: string, name = symbol): AssetSearchItem => ({
  asset_type,
  symbol,
  name,
  asset_class: asset_type === 'stock' ? 'hisse' : asset_type === 'crypto' ? 'kripto' : asset_type === 'currency' ? 'doviz' : 'emtia',
  price_usd: 10,
  quote_currency: 'USD',
  change_24h_pct: null,
});

const catalog = [
  item('stock', 'AAPL'),
  item('stock', 'MSFT'),
  item('stock', 'NVDA'),
  item('stock', 'AMZN'),
  item('stock', 'GOOGL'),
  item('stock', 'TSLA'),
  item('crypto', 'ETH'),
  item('crypto', 'BTC'),
  item('currency', 'EUR'),
  item('commodity', 'SILVER', 'Gümüş'),
  item('commodity', 'GAU', 'Gram Altın'),
];

describe('Model Portföy şablonları', () => {
  it('altın: ons önce, yoksa gram, yoksa adı altın olan', () => {
    expect(findGold(catalog)?.symbol).toBe('GAU');
    expect(findGold([...catalog, item('commodity', 'GOLD')])?.symbol).toBe('GOLD');
    expect(findGold([item('commodity', 'XYZ', 'Altın (ons)')])?.symbol).toBe('XYZ');
    expect(findGold([item('stock', 'AAPL')])).toBeNull();
  });

  it('varsayılan sepet çeşitli: 4 hisse + BTC + altın + EUR', () => {
    expect(defaultBasket(catalog).map((c) => c.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'BTC', 'GAU', 'EUR']);
  });

  it('eşit ağırlık: toplam tam 100, nakit 0; mevcut seçim korunur', () => {
    const t = equalTemplate([], catalog);
    expect(t.rows).toHaveLength(7);
    expect(t.cash_weight).toBe(0);
    expect(sumWeights(t.rows, t.cash_weight)).toBe(100);
    const mine = equalTemplate([{ asset_type: 'stock', symbol: 'TSLA', name: 'Tesla', weight: 80 }, { asset_type: 'crypto', symbol: 'ETH', name: 'Ether', weight: 5 }], catalog);
    expect(mine.rows.map((r) => [r.symbol, r.weight])).toEqual([
      ['TSLA', 50],
      ['ETH', 50],
    ]);
    expect(equalTemplate([], []).cash_weight).toBe(100);
  });

  it('dengeli: %50 hisse / %30 altın / %20 nakit; eksik kısım nakde', () => {
    const t = balancedTemplate(catalog);
    expect(t.rows.filter((r) => r.asset_type === 'stock').reduce((s, r) => s + r.weight, 0)).toBeCloseTo(50, 10);
    expect(t.rows.find((r) => r.symbol === 'GAU')?.weight).toBe(30);
    expect(t.cash_weight).toBe(20);
    expect(sumWeights(t.rows, t.cash_weight)).toBe(100);
    const noGold = balancedTemplate(catalog.filter((c) => c.asset_type !== 'commodity'));
    expect(noGold.cash_weight).toBe(50);
    expect(noGold.notes[0]).toMatch(/altın/);
  });

  it('tamamı nakit ve Sihirbaz eşlemesi', () => {
    expect(cashTemplate()).toEqual({ rows: [], cash_weight: 100, notes: [] });
    const a = advisorTemplateRows({
      plan_id: 'p',
      profile_label: 'Dengeli',
      created_at: '2026-10-01T00:00:00Z',
      weights: [{ asset_type: 'stock', symbol: 'AAPL', name: 'Apple', weight: 40, from_class: 'us_stocks' }],
      cash_weight: 60,
      moved_to_cash: [
        { label: 'TL Nakit', weight: 35, reason: 'TL nakit bu USD portföyde nakit olarak tutulur' },
        { label: 'Euro', weight: 0, reason: 'x' },
      ],
    });
    expect(a.rows).toEqual([{ asset_type: 'stock', symbol: 'AAPL', name: 'Apple', weight: 40 }]);
    expect(a.notes).toHaveLength(1);
    expect(sumWeights(a.rows, a.cash_weight)).toBe(100);
  });
});
