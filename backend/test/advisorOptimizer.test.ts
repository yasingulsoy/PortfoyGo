import { describe, expect, it } from 'vitest';
import { cholesky, nearestPsd, percentileSorted, symmetricEigen } from '../src/services/advisor/math';
import {
  assertFeasible,
  constraintCorners,
  efficientFrontier,
  optimize,
  projectToBounds,
  roundToPercents,
} from '../src/services/advisor/optimizer';
import { PROFILE_IDS, PROFILES } from '../src/services/advisor/questionnaire';
import { computeStats } from '../src/services/advisor/stats';
import { ASSET_CLASSES, buildUniverse } from '../src/services/advisor/universe';

const priorStats = computeStats({
  specs: buildUniverse({ historyCounts: new Map(), cachedStocks: [] }).classes,
  series: new Map(),
  cashReturn: 0.4,
});

const boundsOf = (id: (typeof PROFILE_IDS)[number]) => ({
  min: ASSET_CLASSES.map((c) => PROFILES[id].constraints[c].min),
  max: ASSET_CLASSES.map((c) => PROFILES[id].constraints[c].max),
});

const runProfile = (id: (typeof PROFILE_IDS)[number], seed = 42) =>
  optimize({
    expected: priorStats.expected_return,
    cov: priorStats.cov,
    riskFree: priorStats.cash_return,
    ...boundsOf(id),
    volBand: PROFILES[id].vol_band,
    samples: 4_000,
    seed,
  });

describe('advisor math helpers', () => {
  it('cholesky reconstructs a PSD matrix, including a zero-variance (cash) row', () => {
    const a = [
      [0, 0, 0],
      [0, 0.04, 0.012],
      [0, 0.012, 0.09],
    ];
    const l = cholesky(a);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += l[i][k] * l[j][k];
        expect(s).toBeCloseTo(a[i][j], 12);
      }
    }
  });

  it('nearestPsd clips negative eigenvalues; symmetricEigen is accurate', () => {
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    expect(Math.min(...symmetricEigen(bad).values)).toBeLessThan(0);
    const fixed = nearestPsd(bad);
    expect(Math.min(...symmetricEigen(fixed).values)).toBeGreaterThan(-1e-10);
    const { values } = symmetricEigen([
      [2, 1],
      [1, 2],
    ]);
    expect([...values].sort()).toEqual([expect.closeTo(1, 10), expect.closeTo(3, 10)]);
  });

  it('percentileSorted interpolates', () => {
    expect(percentileSorted([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentileSorted([0, 10], 0.25)).toBe(2.5);
  });
});

describe('advisor optimizer', () => {
  it('projectToBounds and corners stay feasible', () => {
    const min = [0.1, 0, 0, 0.2];
    const max = [0.5, 0.3, 0.1, 0.8];
    const w = projectToBounds([0.9, 0.5, 0.4, 0.1], min, max);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    w.forEach((x, i) => {
      expect(x).toBeGreaterThanOrEqual(min[i] - 1e-12);
      expect(x).toBeLessThanOrEqual(max[i] + 1e-12);
    });
    const corners = constraintCorners(min, max);
    expect(corners.length).toBeGreaterThan(1);
    for (const c of corners) {
      expect(c.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
      c.forEach((x, i) => expect(x).toBeGreaterThanOrEqual(min[i] - 1e-12));
    }
    expect(() => assertFeasible([0.6, 0.6], [1, 1])).toThrow();
    expect(() => assertFeasible([0, 0], [0.4, 0.4])).toThrow();
  });

  it('roundToPercents sums to exactly 100 and respects bounds', () => {
    const cases: [number[], number[], number[]][] = [
      [[1 / 3, 1 / 3, 1 / 3], [0, 0, 0], [1, 1, 1]],
      [[0.105, 0.105, 0.79], [0.1, 0.1, 0], [0.11, 0.11, 0.8]],
      [[0.4, 0.004, 0.596], [0.4, 0, 0], [0.9, 0.3, 0.6]],
    ];
    for (const [w, min, max] of cases) {
      const p = roundToPercents(w, min, max);
      expect(p.reduce((s, x) => s + x, 0)).toBe(100);
      p.forEach((x, i) => {
        expect(Number.isInteger(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(Math.round(min[i] * 100));
        expect(x).toBeLessThanOrEqual(Math.round(max[i] * 100));
      });
    }
  });

  it.each(PROFILE_IDS)('profile %s: weights respect constraints, sum to 100%%, vol inside band', (id) => {
    const r = runProfile(id);
    const { min, max } = boundsOf(id);
    expect(r.percents.reduce((s, x) => s + x, 0)).toBe(100);
    expect(r.weights.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    r.percents.forEach((p, i) => {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(Math.round(min[i] * 100));
      expect(p).toBeLessThanOrEqual(Math.round(max[i] * 100));
    });
    expect(r.in_band).toBe(true);
    const [lo, hi] = PROFILES[id].vol_band;
    expect(r.volatility).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(r.volatility).toBeLessThanOrEqual(hi + 1e-9);
    // Etkin sınır: ≤ 25 nokta, oynaklık ve getiri artan
    expect(r.frontier.length).toBeGreaterThan(1);
    expect(r.frontier.length).toBeLessThanOrEqual(25);
    for (let k = 1; k < r.frontier.length; k++) {
      expect(r.frontier[k].volatility).toBeGreaterThan(r.frontier[k - 1].volatility);
      expect(r.frontier[k].expected_return).toBeGreaterThan(r.frontier[k - 1].expected_return);
    }
  });

  it('riskier profiles get higher volatility and expected return', () => {
    const vols = PROFILE_IDS.map((id) => runProfile(id).volatility);
    const rets = PROFILE_IDS.map((id) => runProfile(id).expected_return);
    for (let i = 1; i < vols.length; i++) {
      expect(vols[i]).toBeGreaterThan(vols[i - 1]);
      expect(rets[i]).toBeGreaterThan(rets[i - 1]);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = runProfile('dengeli', 7);
    const b = runProfile('dengeli', 7);
    expect(a.percents).toEqual(b.percents);
    expect(a.frontier).toEqual(b.frontier);
    expect(a.expected_return).toBe(b.expected_return);
  });

  it('cash + one risky asset: equal Sharpe along the line → picks the lowest-vol in-band mix', () => {
    const r = optimize({
      expected: [0.1, 0.2],
      cov: [
        [0, 0],
        [0, 0.04],
      ],
      riskFree: 0.1,
      min: [0, 0],
      max: [1, 1],
      volBand: [0.05, 0.1],
      samples: 2_000,
      seed: 1,
    });
    expect(r.percents).toEqual([75, 25]);
    expect(r.volatility).toBeCloseTo(0.05, 10);
    expect(r.sharpe).toBeCloseTo(0.5, 10);
  });

  it('unreachable band → nearest edge, flagged out of band', () => {
    const r = optimize({
      expected: [0.1, 0.2],
      cov: [
        [0, 0],
        [0, 0.04],
      ],
      riskFree: 0.1,
      min: [0, 0],
      max: [1, 0.5],
      volBand: [0.5, 0.6],
      samples: 500,
      seed: 1,
    });
    expect(r.in_band).toBe(false);
    expect(r.percents).toEqual([50, 50]); // en yüksek oynaklık = 0.1
  });

  it('efficientFrontier keeps only the upper envelope', () => {
    const pts = [
      { volatility: 0.1, expected_return: 0.1 },
      { volatility: 0.2, expected_return: 0.05 },
      { volatility: 0.3, expected_return: 0.2 },
      { volatility: 0.31, expected_return: 0.15 },
    ];
    expect(efficientFrontier(pts, 3)).toEqual([
      { volatility: 0.1, expected_return: 0.1 },
      { volatility: 0.3, expected_return: 0.2 },
    ]);
  });
});
