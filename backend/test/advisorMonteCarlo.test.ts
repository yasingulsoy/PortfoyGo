import { describe, expect, it } from 'vitest';
import { simulate } from '../src/services/advisor/montecarlo';

const twoAsset = {
  weights: [0.4, 0.6],
  mu: [Math.log(1.4), Math.log(1.5)],
  cov: [
    [0, 0],
    [0, 0.09],
  ],
};

describe('advisor monte carlo', () => {
  it('percentiles are ordered every month and start at the initial value', () => {
    const r = simulate({ ...twoAsset, months: 24, initial: 100_000, paths: 2_000, seed: 3 });
    expect(r.months).toEqual(Array.from({ length: 25 }, (_, i) => i));
    for (const key of ['p5', 'p25', 'p50', 'p75', 'p95'] as const) {
      expect(r[key]).toHaveLength(25);
      expect(r[key][0]).toBeCloseTo(100_000, 6);
    }
    for (let m = 0; m <= 24; m++) {
      expect(r.p5[m]).toBeLessThanOrEqual(r.p25[m]);
      expect(r.p25[m]).toBeLessThanOrEqual(r.p50[m]);
      expect(r.p50[m]).toBeLessThanOrEqual(r.p75[m]);
      expect(r.p75[m]).toBeLessThanOrEqual(r.p95[m]);
    }
    expect(r.prob_loss).toBeGreaterThanOrEqual(0);
    expect(r.prob_loss).toBeLessThanOrEqual(1);
    expect(r.max_drawdown_median).toBeLessThanOrEqual(r.max_drawdown_p95);
    expect(r.var95).toBeGreaterThanOrEqual(0);
    expect(r.median_return).toBeCloseTo(r.p50[24] / 100_000 - 1, 12);
  });

  it('is deterministic for the same seed and differs for another seed', () => {
    const a = simulate({ ...twoAsset, months: 12, initial: 50_000, paths: 1_000, seed: 11 });
    const b = simulate({ ...twoAsset, months: 12, initial: 50_000, paths: 1_000, seed: 11 });
    const c = simulate({ ...twoAsset, months: 12, initial: 50_000, paths: 1_000, seed: 12 });
    expect(a).toEqual(b);
    expect(c.p50[12]).not.toBe(a.p50[12]);
  });

  it('zero volatility → deterministic growth, no drawdown, no loss', () => {
    const r = simulate({
      weights: [1],
      mu: [Math.log(1.4)],
      cov: [[0]],
      months: 18,
      initial: 100_000,
      paths: 200,
      seed: 1,
    });
    const expected = 100_000 * Math.pow(1.4, 18 / 12);
    expect(r.p5[18]).toBeCloseTo(expected, 4);
    expect(r.p95[18]).toBeCloseTo(expected, 4);
    expect(r.max_drawdown_median).toBe(0);
    expect(r.max_drawdown_p95).toBe(0);
    expect(r.prob_loss).toBe(0);
    expect(r.var95).toBe(0);
  });

  it('zero volatility with negative drift → certain loss and drawdown equal to the decline', () => {
    const r = simulate({ weights: [1], mu: [Math.log(0.9)], cov: [[0]], months: 12, initial: 1_000, paths: 50, seed: 1 });
    expect(r.prob_loss).toBe(1);
    expect(r.max_drawdown_median).toBeCloseTo(0.1, 10);
    expect(r.var95).toBeCloseTo(0.1, 10);
  });

  it('single GBM asset: median ≈ exp((μ − σ²/2)T), higher vol → deeper drawdowns', () => {
    const sigma = 0.3;
    const mu = Math.log(1.2);
    const r = simulate({ weights: [1], mu: [mu], cov: [[sigma * sigma]], months: 12, initial: 1, paths: 5_000, seed: 5 });
    expect(r.p50[12]).toBeGreaterThan(Math.exp(mu - (sigma * sigma) / 2) * 0.97);
    expect(r.p50[12]).toBeLessThan(Math.exp(mu - (sigma * sigma) / 2) * 1.03);
    const calm = simulate({ weights: [1], mu: [mu], cov: [[0.05 * 0.05]], months: 12, initial: 1, paths: 5_000, seed: 5 });
    expect(r.max_drawdown_p95).toBeGreaterThan(calm.max_drawdown_p95);
    expect(r.prob_loss).toBeGreaterThan(calm.prob_loss);
  });
});
