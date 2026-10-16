import { describe, expect, it } from 'vitest';
import {
  cleanSeries,
  clampWeight,
  equalSplit,
  equalizeRows,
  estimateInitialCost,
  estimateTrade,
  fmtPct,
  fmtPoints,
  maxBuyAmount,
  normalizeTo100,
  parseDecimal,
  remainderToCash,
  scaleToHundred,
  seriesChangePct,
  shockImpact,
  sumWeights,
  weightStatus,
} from './model';

describe('ağırlık normalleştirme', () => {
  it('toplam ve durum (±0,01 tolerans)', () => {
    expect(sumWeights([{ weight: 33.33 }, { weight: 33.33 }], 33.34)).toBe(100);
    expect(weightStatus(100.005)).toBe('ok');
    expect(weightStatus(99.5)).toBe('under');
    expect(weightStatus(100.5)).toBe('over');
  });

  it('eşit bölme: kuruş farkı dağıtılır, toplam tam', () => {
    expect(equalSplit(3)).toEqual([33.34, 33.33, 33.33]);
    expect(equalSplit(3, 90)).toEqual([30, 30, 30]);
    expect(equalSplit(7, 100).reduce((s, x) => s + x, 0)).toBeCloseTo(100, 10);
    expect(equalSplit(0)).toEqual([]);
  });

  it('eşit ağırlık nakdi sabit tutar', () => {
    const rows = equalizeRows([{ weight: 5 }, { weight: 80 }, { weight: 0 }], 10);
    expect(rows.map((r) => r.weight)).toEqual([30, 30, 30]);
    expect(sumWeights(rows, 10)).toBe(100);
  });

  it('kalan nakde; aşımda nakit 0', () => {
    expect(remainderToCash([{ weight: 40 }, { weight: 35.5 }])).toBe(24.5);
    expect(remainderToCash([{ weight: 70 }, { weight: 40 }])).toBe(0);
  });

  it('oranları koruyarak %100 e ölçekleme', () => {
    const r = scaleToHundred([{ weight: 30 }, { weight: 30 }], 20); // toplam 80
    expect(r.rows.map((x) => x.weight)).toEqual([37.5, 37.5]);
    expect(r.cash_weight).toBe(25);
    const thirds = scaleToHundred([{ weight: 1 }, { weight: 1 }, { weight: 1 }], 0);
    expect(sumWeights(thirds.rows, thirds.cash_weight)).toBe(100);
    expect(scaleToHundred([{ weight: 0 }], 0)).toEqual({ rows: [{ weight: 0 }], cash_weight: 100 });
  });

  it('clampWeight', () => {
    expect(clampWeight(-3)).toBe(0);
    expect(clampWeight(120)).toBe(100);
    expect(clampWeight(12.345)).toBe(12.35);
    expect(clampWeight(NaN)).toBe(0);
  });

  it('ilk kurulum maliyet tahmini (komisyon kuruşa yukarı)', () => {
    expect(estimateInitialCost([{ weight: 50 }, { weight: 30 }], 100_000, 25)).toEqual({ gross: 80_000, commission: 200 });
    expect(estimateInitialCost([{ weight: 0.01 }], 100_000, 25)).toEqual({ gross: 10, commission: 0.03 }); // 0,025 → 0,03
  });
});

describe('işlem tahmini', () => {
  const base = { price: 200, bps: 25, cash: 10_000, held: 5 };

  it('tutarla alış: miktar aşağı, komisyon yukarı', () => {
    expect(estimateTrade({ ...base, side: 'buy', mode: 'amount', value: 1_000 })).toEqual({ quantity: 5, gross: 1_000, commission: 2.5, net: 1_002.5, error: null });
  });

  it('yetersiz nakit / fazla satış / küçük işlem', () => {
    expect(estimateTrade({ ...base, side: 'buy', mode: 'amount', value: 10_000 }).error).toMatch(/Yetersiz/);
    expect(estimateTrade({ ...base, side: 'sell', mode: 'quantity', value: 6 }).error).toMatch(/fazlası/);
    expect(estimateTrade({ ...base, side: 'buy', mode: 'quantity', value: 0.001 }).error).toMatch(/1 USD/);
  });

  it('pozisyon değerine eşit satış tutarı = tamamı', () => {
    const e = estimateTrade({ ...base, side: 'sell', mode: 'amount', value: 1_000 });
    expect(e.quantity).toBe(5);
    expect(e.net).toBe(997.5);
  });

  it('en büyük alış tutarı komisyon dahil nakde sığar', () => {
    const g = maxBuyAmount(10_000, 25);
    expect(g).toBe(9_975.06);
    expect(g + Math.ceil(g * 0.25 - 1e-7) / 100).toBeLessThanOrEqual(10_000);
  });
});

describe('ne olursa? şok simülatörü', () => {
  const positions = [
    { key: 'stock:AAA', asset_class: 'hisse' as const, value_usd: 30_000 },
    { key: 'stock:BBB', asset_class: 'hisse' as const, value_usd: 20_000 },
    { key: 'commodity:GOLD', asset_class: 'emtia' as const, value_usd: 10_000 },
  ];

  it('etki = ağırlık × değişim (varlık)', () => {
    const r = shockImpact(positions, 40_000, { kind: 'asset', key: 'stock:AAA' }, -20);
    expect(r).toEqual({ exposure_usd: 30_000, weight_pct: 30, delta_usd: -6_000, new_equity_usd: 94_000, impact_pct: -6 });
  });

  it('sınıf şoku tüm sınıfı etkiler; nakit sabit', () => {
    const r = shockImpact(positions, 40_000, { kind: 'class', asset_class: 'hisse' }, 10);
    expect(r.weight_pct).toBe(50);
    expect(r.impact_pct).toBe(5);
    expect(shockImpact(positions, 40_000, { kind: 'class', asset_class: 'nakit' }, -50).impact_pct).toBe(0);
  });

  it('boş portföy → 0', () => {
    expect(shockImpact([], 0, { kind: 'class', asset_class: 'hisse' }, 30)).toMatchObject({ impact_pct: 0, new_equity_usd: 0 });
  });
});

describe('karşılaştırma normalleştirmesi', () => {
  it('ilk değer 100; sıralı ve tekil zaman', () => {
    const pts = normalizeTo100([
      { t: 3, v: 110_000 },
      { t: 1, v: 100_000 },
      { t: 2, v: 95_000 },
      { t: 2, v: 96_000 },
    ]);
    expect(pts).toEqual([
      { t: 1, v: 100 },
      { t: 2, v: 96 },
      { t: 3, v: 110 },
    ]);
    expect(normalizeTo100([{ t: 1, v: 0 }])).toEqual([]);
    expect(normalizeTo100([])).toEqual([]);
  });

  it('seri değişimi', () => {
    expect(seriesChangePct([{ t: 1, v: 200 }, { t: 2, v: 150 }])).toBe(-25);
    expect(seriesChangePct([{ t: 1, v: 200 }])).toBeNull();
    expect(cleanSeries([{ t: 2, v: NaN }, { t: 1, v: 5 }])).toEqual([{ t: 1, v: 5 }]);
  });
});

describe('biçimlendirme', () => {
  it('yüzde ve puan', () => {
    expect(fmtPct(12.345)).toBe('%12,3');
    expect(fmtPct(-0.04)).toBe('%0,0');
    expect(fmtPct(-3.21, { sign: true })).toBe('-%3,2');
    expect(fmtPct(2, { sign: true, digits: 2 })).toBe('+%2,00');
    expect(fmtPct(null)).toBe('—');
    expect(fmtPoints(1.234)).toBe('+1,23 puan');
    expect(fmtPoints(-0.5)).toBe('-0,50 puan');
  });

  it('ondalık ayrıştırma (virgül/nokta)', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('1.250,75')).toBe(1250.75);
    expect(parseDecimal('1250.75')).toBe(1250.75);
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('')).toBeNaN();
  });
});
