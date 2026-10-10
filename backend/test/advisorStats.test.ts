import { describe, expect, it } from 'vitest';
import { createNormal, createRng, symmetricEigen } from '../src/services/advisor/math';
import {
  computeStats,
  MIN_OBSERVATIONS,
  PRIOR_VOLATILITY,
  PriceSeries,
  priorExpectedReturn,
} from '../src/services/advisor/stats';
import { ASSET_CLASSES, buildUniverse, classifyHolding, seriesKey } from '../src/services/advisor/universe';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2025, 0, 1) - 3 * 60 * 60 * 1000; // İstanbul gece yarısı

const universe = buildUniverse({
  historyCounts: new Map(),
  cachedStocks: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
  ],
});

/** Tohumlu GBM fiyat serisi (günlük) */
function gbm(days: number, annualDrift: number, annualVol: number, seed: number, start = 100): PriceSeries {
  const rng = createRng(seed);
  const normal = createNormal(rng);
  const s: PriceSeries = new Map();
  let p = start;
  for (let d = 0; d < days; d++) {
    s.set(START + d * DAY, p);
    p *= Math.exp(annualDrift / 365 - (annualVol * annualVol) / 730 + (annualVol / Math.sqrt(365)) * normal());
  }
  return s;
}

function fullSeries(days: number, opts: { skip?: string[] } = {}): Map<string, PriceSeries> {
  const m = new Map<string, PriceSeries>();
  const add = (type: string, sym: string, s: PriceSeries) => {
    if (!opts.skip?.includes(seriesKey(type, sym))) m.set(seriesKey(type, sym), s);
  };
  add('currency', 'USD', gbm(days, 0.25, 0.1, 1, 40));
  add('currency', 'EUR', gbm(days, 0.27, 0.11, 2, 45));
  add('commodity', 'GOLD', gbm(days, 0.08, 0.15, 3, 2500));
  add('stock', 'AAPL', gbm(days, 0.1, 0.25, 4, 200));
  add('stock', 'MSFT', gbm(days, 0.12, 0.25, 5, 400));
  add('crypto', 'BTC', gbm(days, 0.3, 0.6, 6, 100_000));
  add('crypto', 'ETH', gbm(days, 0.3, 0.7, 7, 4_000));
  return m;
}

const isPsd = (m: number[][]) => Math.min(...symmetricEigen(m).values) > -1e-10;
const isSymmetric = (m: number[][]) => m.every((row, i) => row.every((x, j) => Math.abs(x - m[j][i]) < 1e-12));

describe('advisor universe', () => {
  it('prefers GAU when it has history, otherwise GOLD × USD/TRY', () => {
    const gold = (u: ReturnType<typeof buildUniverse>) => u.classes.find((c) => c.class === 'gold')!;
    expect(gold(universe).instruments[0].symbol).toBe('GOLD');
    expect(gold(universe).components[0].currency).toBe('USD');
    const withGau = buildUniverse({ historyCounts: new Map([['commodity:GAU', 300]]), cachedStocks: [] });
    expect(gold(withGau).instruments[0].symbol).toBe('GAU');
    expect(gold(withGau).components[0].currency).toBe('TRY');
  });

  it('builds an equal-weight stock basket from cached stocks with history (max 10), default list as fallback', () => {
    const cached = Array.from({ length: 14 }, (_, i) => ({ symbol: `S${String(i).padStart(2, '0')}`, name: `Stock ${i}` }));
    const counts = new Map(cached.map((s, i) => [seriesKey('stock', s.symbol), i < 12 ? 400 - i : 10]));
    const u = buildUniverse({ historyCounts: counts, cachedStocks: cached });
    const stocks = u.classes.find((c) => c.class === 'us_stocks')!;
    expect(stocks.instruments).toHaveLength(10);
    expect(stocks.instruments[0].symbol).toBe('S00');
    expect(stocks.instruments.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 12);

    const empty = buildUniverse({ historyCounts: new Map(), cachedStocks: [] });
    expect(empty.classes.find((c) => c.class === 'us_stocks')!.instruments.map((i) => i.symbol)).toEqual(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']);
    const crypto = empty.classes.find((c) => c.class === 'crypto')!;
    expect(crypto.instruments.map((i) => [i.symbol, i.weight])).toEqual([
      ['BTC', 0.7],
      ['ETH', 0.3],
    ]);
  });

  it('classifies holdings into advisor classes', () => {
    expect(classifyHolding('currency', 'usd')).toBe('usd');
    expect(classifyHolding('currency', 'EUR')).toBe('eur');
    expect(classifyHolding('currency', 'GBP')).toBe('other');
    expect(classifyHolding('commodity', 'GAU')).toBe('gold');
    expect(classifyHolding('commodity', 'SILVER')).toBe('other');
    expect(classifyHolding('stock', 'AAPL')).toBe('us_stocks');
    expect(classifyHolding('crypto', 'SOL')).toBe('crypto');
  });
});

describe('advisor market stats', () => {
  it('no history → documented prior parameters', () => {
    const s = computeStats({ specs: universe.classes, series: new Map(), cashReturn: 0.4 });
    expect(s.data_quality).toBe('prior');
    expect(s.observations).toBe(0);
    ASSET_CLASSES.forEach((c, i) => {
      expect(s.expected_return[i]).toBeCloseTo(priorExpectedReturn(c, 0.4), 10);
      expect(s.mu[i]).toBeCloseTo(Math.log(1 + s.expected_return[i]), 12);
    });
    expect(s.volatility[0]).toBe(0);
    expect(s.volatility[ASSET_CLASSES.indexOf('crypto')]).toBeCloseTo(PRIOR_VOLATILITY.crypto, 6);
    expect(isSymmetric(s.cov)).toBe(true);
    expect(isPsd(s.cov)).toBe(true);
    expect(s.sources.cash_try).toBe('fixed');
    expect(s.sources.crypto).toBe('prior');
  });

  it(`short history (< ${MIN_OBSERVATIONS} aligned days) falls back to prior`, () => {
    const s = computeStats({ specs: universe.classes, series: fullSeries(60), cashReturn: 0.4 });
    expect(s.data_quality).toBe('prior');
    const p = computeStats({ specs: universe.classes, series: new Map(), cashReturn: 0.4 });
    expect(s.expected_return).toEqual(p.expected_return);
  });

  it('cash return follows the configured parameter', () => {
    const s = computeStats({ specs: universe.classes, series: new Map(), cashReturn: 0.3 });
    expect(s.expected_return[0]).toBeCloseTo(0.3, 12);
    expect(s.cash_return).toBe(0.3);
  });

  it('≥ 1 year of aligned history → historical; shrunk toward priors; PSD covariance', () => {
    const s = computeStats({ specs: universe.classes, series: fullSeries(400), cashReturn: 0.4 });
    expect(s.data_quality).toBe('historical');
    expect(s.observations).toBe(399);
    expect(s.as_of).toBe(new Date(START + 399 * DAY).toISOString());
    for (const c of ['usd', 'eur', 'gold', 'us_stocks', 'crypto'] as const) expect(s.sources[c]).toBe('historical');
    expect(isSymmetric(s.cov)).toBe(true);
    expect(isPsd(s.cov)).toBe(true);
    // Oynaklıklar makul aralıkta (TL bazında)
    const vol = (c: string) => s.volatility[ASSET_CLASSES.indexOf(c as never)];
    expect(vol('usd')).toBeGreaterThan(0.05);
    expect(vol('usd')).toBeLessThan(0.2);
    expect(vol('crypto')).toBeGreaterThan(vol('us_stocks'));
    expect(vol('crypto')).toBeLessThan(1);
    // Beklenen getiriler sonlu ve absürt değil
    for (const e of s.expected_return) {
      expect(Number.isFinite(e)).toBe(true);
      expect(e).toBeGreaterThan(-0.5);
      expect(e).toBeLessThan(3);
    }
  });

  it('between MIN_OBSERVATIONS and 1 year → mixed', () => {
    const s = computeStats({ specs: universe.classes, series: fullSeries(200), cashReturn: 0.4 });
    expect(s.data_quality).toBe('mixed');
    expect(s.observations).toBe(199);
  });

  it('a class without history uses its prior while others are historical (mixed)', () => {
    const s = computeStats({ specs: universe.classes, series: fullSeries(400, { skip: ['crypto:ETH'] }), cashReturn: 0.4 });
    expect(s.data_quality).toBe('mixed');
    expect(s.sources.crypto).toBe('prior');
    expect(s.sources.us_stocks).toBe('historical');
    const i = ASSET_CLASSES.indexOf('crypto');
    expect(s.expected_return[i]).toBeCloseTo(priorExpectedReturn('crypto', 0.4), 10);
    expect(isPsd(s.cov)).toBe(true);
  });

  it('absurd price jumps are clipped (finite, bounded drift)', () => {
    const series = fullSeries(400);
    const btc = series.get('crypto:BTC')!;
    let k = 0;
    for (const d of [...btc.keys()]) btc.set(d, 100 * Math.pow(1.05, k++)); // günde %5 artış
    const s = computeStats({ specs: universe.classes, series, cashReturn: 0.4 });
    const e = s.expected_return[ASSET_CLASSES.indexOf('crypto')];
    expect(Number.isFinite(e)).toBe(true);
    // Tarihsel sürüklenme 1.5'e kırpılır, önselle 50/50 → e^(0.5·1.5 + 0.5·ln 1.568) − 1 ≈ 1.65
    expect(e).toBeLessThan(1.7);
  });
});
