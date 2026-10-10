import { describe, expect, it } from 'vitest';
import type { AdvisorAllocation } from '@/types';
import {
  FAN_BASE_TIME,
  arcPath,
  compactTRY,
  donutSegments,
  fanSummary,
  formatAmountInput,
  gaugeAngle,
  gaugeAngleFromRatio,
  gaugeSegments,
  layoutFrontier,
  mixColors,
  monthFromTime,
  monthToTime,
  parseAmount,
  pct,
  planBuys,
  polar,
  profileIndex,
  roundPercents,
  toFanSeries,
  toPlan,
  toPlanSummaries,
  toProfileResult,
  toQuestionnaire,
} from './model';

describe('pct', () => {
  it('formats fractions as Turkish percentages', () => {
    expect(pct(0.1234)).toBe('%12,3');
    expect(pct(0.1234, { digits: 0 })).toBe('%12');
    expect(pct(0.05, { digits: 2 })).toBe('%5,00');
  });

  it('adds a sign only when asked and never shows negative zero', () => {
    expect(pct(0.08, { sign: true })).toBe('+%8,0');
    expect(pct(-0.08, { sign: true })).toBe('-%8,0');
    expect(pct(-0.08)).toBe('-%8,0');
    expect(pct(-0.0001)).toBe('%0,0');
    expect(pct(0, { sign: true })).toBe('%0,0');
  });

  it('rounds halves away from zero despite float error', () => {
    expect(pct(0.12345, { digits: 2 })).toBe('%12,35');
    expect(pct(-0.12345, { digits: 2 })).toBe('-%12,35');
  });

  it('treats junk as zero', () => {
    expect(pct(Number.NaN)).toBe('%0,0');
    expect(pct(undefined)).toBe('%0,0');
  });
});

describe('roundPercents', () => {
  it('always sums to exactly 100', () => {
    const r = roundPercents([1 / 3, 1 / 3, 1 / 3]);
    expect(r.reduce((s, x) => s + x, 0)).toBe(100);
    expect(r.sort()).toEqual([33, 33, 34]);
  });

  it('gives the extra point to the largest remainder', () => {
    expect(roundPercents([0.125, 0.125, 0.75])).toEqual([13, 12, 75]);
    expect(roundPercents([0.255, 0.245, 0.5])).toEqual([26, 24, 50]);
  });

  it('supports decimals, ignores negatives and handles empty input', () => {
    const r = roundPercents([0.2, 0.3, 0.5, -0.1], 1);
    expect(r).toEqual([20, 30, 50, 0]);
    expect(roundPercents([0, 0])).toEqual([0, 0]);
  });
});

describe('donutSegments / arcPath', () => {
  it('maps weights to clockwise angles that cover the circle', () => {
    const s = donutSegments([0.5, 0.25, 0.25]);
    expect(s).toEqual([
      { index: 0, start: 0, end: 180 },
      { index: 1, start: 180, end: 270 },
      { index: 2, start: 270, end: 360 },
    ]);
  });

  it('skips empty slices but keeps original indices', () => {
    const s = donutSegments([0, 1, 0, 1]);
    expect(s.map((x) => x.index)).toEqual([1, 3]);
    expect(s[1].start).toBe(180);
  });

  it('applies gaps only between several slices', () => {
    const [a, b] = donutSegments([1, 1], 2);
    expect(a.start).toBe(1);
    expect(a.end).toBe(179);
    expect(b.start).toBe(181);
    expect(donutSegments([1], 2)[0]).toEqual({ index: 0, start: 0, end: 360 });
    expect(donutSegments([])).toEqual([]);
  });

  it('builds a closed ring path with correct large-arc flags', () => {
    expect(polar(50, 50, 10, 0)).toEqual({ x: 50, y: 40 });
    expect(polar(50, 50, 10, 90)).toEqual({ x: 60, y: 50 });
    const small = arcPath(50, 50, 40, 30, 0, 90);
    expect(small.startsWith('M50 10A40 40 0 0 1 90 50L80 50A30 30 0 0 0 50 20')).toBe(true);
    expect(small.endsWith('Z')).toBe(true);
    expect(arcPath(50, 50, 40, 30, 0, 270)).toContain('A40 40 0 1 1');
    // Tam halka: uç noktalar çakışmasın
    expect(arcPath(50, 50, 40, 30, 0, 360)).not.toContain('NaN');
  });
});

describe('risk gauge', () => {
  it('splits the half circle into equal segments', () => {
    const s = gaugeSegments(5, 0);
    expect(s[0]).toEqual({ start: -90, end: -54 });
    expect(s[4]).toEqual({ start: 54, end: 90 });
  });

  it('points the needle at the middle of the profile segment', () => {
    expect(gaugeAngle(0, 5)).toBe(-72);
    expect(gaugeAngle(2, 5)).toBe(0);
    expect(gaugeAngle(4, 5)).toBe(72);
    expect(gaugeAngle(9, 5)).toBe(72);
    expect(gaugeAngle(-1, 5)).toBe(-72);
    expect(gaugeAngleFromRatio(0.5)).toBe(0);
    expect(gaugeAngleFromRatio(2)).toBe(90);
  });

  it('finds the profile index, falling back to the score ratio', () => {
    const profiles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    expect(profileIndex(profiles, 'c')).toBe(2);
    expect(profileIndex(profiles, 'x', 0.95)).toBe(4);
    expect(profileIndex(profiles, 'x', 0)).toBe(0);
    expect(profileIndex(profiles, 'x', 1)).toBe(4);
  });
});

describe('fan chart mapping', () => {
  const sim = {
    months: [0, 1, 2, 3],
    p5: [100, 90, 85, 80],
    p25: [100, 97, 96, 95],
    p50: [100, 101, 102, 104],
    p75: [100, 104, 107, 110],
    p95: [100, 110, 118, 125],
  };

  it('encodes months as ascending chart times', () => {
    const s = toFanSeries(sim);
    expect(s.p50.map((p) => p.time)).toEqual([0, 1, 2, 3].map(monthToTime));
    expect(s.p95[3]).toEqual({ time: FAN_BASE_TIME + 3 * 86_400, value: 125 });
    expect(monthFromTime(s.p50[2].time)).toBe(2);
  });

  it('drops unsorted or broken points and truncates to the shortest series', () => {
    const s = toFanSeries({ ...sim, months: [0, 2, 1, 3], p5: [100, Number.NaN, 85] });
    expect(s.p50.map((p) => monthFromTime(p.time))).toEqual([0, 1]);
    expect(s.p5.length).toBe(s.p95.length);
  });

  it('summarises the last point', () => {
    expect(fanSummary(sim)).toEqual({ month: 3, p5: 80, p25: 95, p50: 104, p75: 110, p95: 125 });
    expect(fanSummary({ months: [], p5: [], p25: [], p50: [], p75: [], p95: [] })).toBeNull();
  });

  it('turns growth multiples into lira and spreads a month count', () => {
    const plan = toPlan({
      amount_try: 10_000,
      allocation: [{ class: 'usd', weight: 1 }],
      simulation: { months: 12, p5: [1, 0.9, 0.8], p25: [1, 0.95, 0.9], p50: [1, 1.02, 1.05], p75: [1, 1.1, 1.2], p95: [1, 1.2, 1.4] },
    });
    expect(plan.simulation.months).toEqual([0, 6, 12]);
    expect(plan.simulation.p50).toEqual([10_000, 10_200, 10_500]);
  });

  it('accepts row-shaped simulations', () => {
    const plan = toPlan({ amount_try: 50, simulation: [{ month: 0, p5: 50, p25: 50, p50: 50, p75: 50, p95: 50 }, { month: 6, p5: 40, p25: 45, p50: 52, p75: 60, p95: 70 }] });
    expect(plan.simulation.months).toEqual([0, 6]);
    expect(plan.simulation.p95).toEqual([50, 70]);
  });
});

describe('mixColors', () => {
  it('blends hex and rgb colours', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mixColors('#465fff', '#ffffff', 0)).toBe('rgb(70, 95, 255)');
    expect(mixColors('rgb(0, 0, 0)', '#fff', 1)).toBe('rgb(255, 255, 255)');
    expect(mixColors('var(--x)', '#fff', 0.5)).toBe('var(--x)');
  });
});

describe('layoutFrontier', () => {
  const box = { width: 100, height: 100, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 };

  it('sorts by volatility and highlights the chosen point', () => {
    const l = layoutFrontier(
      [
        { volatility: 0.2, expected_return: 0.12 },
        { volatility: 0.05, expected_return: 0.04 },
      ],
      { volatility: 0.1, expected_return: 0.08 },
      box,
    );
    expect(l.points[0].x).toBeLessThan(l.points[1].x);
    expect(l.points[0].y).toBeGreaterThan(l.points[1].y);
    expect(l.path.startsWith('M0 100')).toBe(true);
    expect(l.chosen).toEqual({ x: 33.333, y: 50 });
    expect(l.xTicks.map((t) => t.value)).toEqual([0.05, 0.125, 0.2]);
  });

  it('returns an empty layout without points', () => {
    expect(layoutFrontier([], null, box).path).toBe('');
  });
});

describe('planBuys', () => {
  const allocation: AdvisorAllocation[] = [
    { class: 'cash_try', label: 'TL', weight: 0.2, expected_return: 0, volatility: 0, instruments: [] },
    {
      class: 'us_stocks',
      label: 'ABD',
      weight: 0.5,
      expected_return: 0.1,
      volatility: 0.2,
      instruments: [
        { symbol: 'SPY', asset_type: 'stock', name: 'SPY', weight: 0.6 },
        { symbol: 'QQQ', asset_type: 'stock', name: 'QQQ', weight: 0.4 },
      ],
    },
    { class: 'gold', label: 'Altın', weight: 0.3, expected_return: 0.08, volatility: 0.15, instruments: [{ symbol: 'GOLD', asset_type: 'commodity', name: 'Altın', weight: 1 }] },
  ];

  it('splits the amount by class and instrument weights, keeping TRY as cash', () => {
    const buys = planBuys(allocation, 10_000);
    expect(buys.map((b) => [b.symbol, b.amount])).toEqual([
      ['SPY', 3000],
      ['QQQ', 2000],
      ['GOLD', 3000],
    ]);
  });

  it('normalises instrument weights given as portfolio shares', () => {
    const alloc = [{ ...allocation[1], instruments: [{ ...allocation[1].instruments[0], weight: 0.3 }, { ...allocation[1].instruments[1], weight: 0.2 }] }];
    expect(planBuys(alloc, 1000).map((b) => b.amount)).toEqual([300, 200]);
  });
});

describe('compactTRY', () => {
  it('abbreviates large lira amounts for chart axes', () => {
    expect(compactTRY(9_500)).toBe('₺9.500');
    expect(compactTRY(125_000)).toBe('₺125 bin');
    expect(compactTRY(1_250_000)).toBe('₺1,25 mn');
  });
});

describe('amount input', () => {
  it('parses Turkish formatted amounts', () => {
    expect(parseAmount('₺12.500')).toBe(12500);
    expect(parseAmount('1.000,5')).toBe(1000.5);
    expect(parseAmount('abc')).toBe(0);
    expect(formatAmountInput(12500.9)).toBe('12.500');
    expect(formatAmountInput(0)).toBe('');
  });
});

describe('API adapters', () => {
  it('reads the questionnaire defensively', () => {
    const q = toQuestionnaire({
      version: 'v1',
      questions: [{ id: 'q1', text: 'Soru', options: [{ id: 'a', label: 'A' }] }, { id: 'q2', text: 'Boş', options: [] }],
      profiles: [{ id: 'balanced', label: 'Dengeli', description: 'x', vol_band: [8, 12] }],
    });
    expect(q.questions).toHaveLength(1);
    expect(q.questions[0].help).toBeNull();
    expect(q.profiles[0].vol_band).toEqual([0.08, 0.12]);
  });

  it('returns null for a missing profile', () => {
    expect(toProfileResult(null)).toBeNull();
    expect(toProfileResult({ id: 'p', score: 10, max_score: 20, profile: { id: 'x', label: 'X', vol_band: [0.1, 0.2] } })?.profile.label).toBe('X');
  });

  it('converts percentage-based plans to fractions', () => {
    const plan = toPlan({
      id: 'p1',
      data_quality: 'historical',
      allocation: [
        { class: 'usd', weight: 40, expected_return: 5, volatility: 10, instruments: [{ symbol: 'usd', asset_type: 'currency', weight: 100 }] },
        { class: 'gold', weight: 60, expected_return: 8, volatility: 15, instruments: [] },
      ],
      metrics: { expected_return: 6.8, volatility: 9, var95: -12, prob_loss: 20, max_drawdown_median: -10, max_drawdown_p95: -25, sharpe: 0.5 },
      current: { drift: [{ class: 'usd', target: 40, current: 10 }] },
    });
    expect(plan.allocation[0].weight).toBeCloseTo(0.4);
    expect(plan.allocation[0].label).toBe('ABD doları');
    expect(plan.allocation[0].instruments[0]).toMatchObject({ symbol: 'USD', weight: 1 });
    expect(plan.metrics.var95).toBeCloseTo(0.12);
    expect(plan.metrics.max_drawdown_p95).toBeCloseTo(0.25);
    expect(plan.metrics.sharpe).toBe(0.5);
    expect(plan.current.drift[0].diff).toBeCloseTo(-0.3);
    expect(plan.data_quality).toBe('historical');
  });

  it('reads plan summaries from {items}', () => {
    const items = toPlanSummaries({ items: [{ id: 'a', profile: { id: 'x' }, metrics: { expected_return: 0.07, volatility: 0.1 } }, { id: '' }] });
    expect(items).toHaveLength(1);
    expect(items[0].metrics.expected_return).toBe(0.07);
  });
});
