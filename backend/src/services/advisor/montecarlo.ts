import { cholesky, createNormal, createRng, Matrix, percentileSorted } from './math';

/**
 * Monte Carlo portföy simülasyonu: çok değişkenli geometrik Brown hareketi (Cholesky ile
 * korelasyonlu şoklar), aylık adımlar, her ay hedef ağırlıklara yeniden dengeleme.
 *
 *   x_i = (μ_i − σ_i²/2)·Δt + (L z)_i      (L L' = Σ·Δt, Δt = 1/12, z ~ N(0, I))
 *   V_{t+1} = V_t · Σ_i w_i · exp(x_i)
 *
 * μ: sürekli yıllık beklenen büyüme (ln(1 + E)), Σ: yıllık log getiri kovaryansı.
 * Çıktı: her ay için değer yüzdelikleri (p5…p95), vade sonunda zarar olasılığı, medyan getiri,
 * %95 VaR (başlangıç değerine oranla, kayıp yoksa 0) ve en büyük düşüş (max drawdown) dağılımı.
 *
 * Saf ve deterministiktir (aynı girdi + tohum → aynı sonuç).
 */

export interface SimulationInput {
  weights: number[];
  mu: number[];
  cov: Matrix;
  months: number;
  initial: number;
  paths?: number;
  seed?: number;
}

export interface SimulationResult {
  months: number[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  paths: number;
  /** Vade sonunda başlangıç değerinin altında kalma olasılığı */
  prob_loss: number;
  /** Medyan senaryoda vade sonu getirisi (p50 / başlangıç − 1) */
  median_return: number;
  /** Vade sonunda ortalama değer */
  mean_final: number;
  /** %95 güvenle en büyük kayıp (başlangıca oranla; 1 − p5/başlangıç, en az 0) */
  var95: number;
  /** Yol başına en büyük zirveden düşüş (oran): medyan ve en kötü %5'lik dilim (p95) */
  max_drawdown_median: number;
  max_drawdown_p95: number;
}

export const DEFAULT_PATHS = 5_000;
export const DEFAULT_MC_SEED = 7_919;

export function simulate(input: SimulationInput): SimulationResult {
  const { weights, mu, cov, initial } = input;
  const months = Math.max(1, Math.trunc(input.months));
  const paths = Math.max(1, Math.trunc(input.paths ?? DEFAULT_PATHS));
  const dt = 1 / 12;

  // Yalnızca ağırlığı olan varlıklar (hız)
  const active = weights.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
  const k = active.length;
  const w = active.map((i) => weights[i]);
  const drift = active.map((i) => (mu[i] - Math.max(cov[i][i], 0) / 2) * dt);
  const subCov = active.map((i) => active.map((j) => cov[i][j] * dt));
  const L = cholesky(subCov);
  const idle = Math.max(0, 1 - w.reduce((s, x) => s + x, 0));

  const rng = createRng(input.seed ?? DEFAULT_MC_SEED);
  const normal = createNormal(rng);

  // values[m][p]
  const values: Float64Array[] = Array.from({ length: months + 1 }, () => new Float64Array(paths));
  const drawdowns = new Float64Array(paths);
  const z = new Array<number>(k).fill(0);

  for (let p = 0; p < paths; p++) {
    let v = initial;
    let peak = initial;
    let maxDd = 0;
    values[0][p] = v;
    for (let m = 1; m <= months; m++) {
      for (let a = 0; a < k; a++) z[a] = normal();
      let growth = 0;
      for (let a = 0; a < k; a++) {
        let shock = 0;
        const row = L[a];
        for (let b = 0; b <= a; b++) shock += row[b] * z[b];
        growth += w[a] * Math.exp(drift[a] + shock);
      }
      // Ağırlıkların toplamı 1 değilse (ör. hiç ağırlık yok) kalan kısım sabit kalır
      if (idle > 0) growth += idle;
      v *= growth;
      values[m][p] = v;
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDd) maxDd = dd;
    }
    drawdowns[p] = maxDd;
  }

  const out: SimulationResult = {
    months: [],
    p5: [],
    p25: [],
    p50: [],
    p75: [],
    p95: [],
    paths,
    prob_loss: 0,
    median_return: 0,
    mean_final: 0,
    var95: 0,
    max_drawdown_median: 0,
    max_drawdown_p95: 0,
  };
  for (let m = 0; m <= months; m++) {
    const sorted = Float64Array.from(values[m]).sort();
    out.months.push(m);
    out.p5.push(percentileSorted(sorted, 0.05));
    out.p25.push(percentileSorted(sorted, 0.25));
    out.p50.push(percentileSorted(sorted, 0.5));
    out.p75.push(percentileSorted(sorted, 0.75));
    out.p95.push(percentileSorted(sorted, 0.95));
  }

  const final = values[months];
  let losses = 0;
  let sum = 0;
  for (let p = 0; p < paths; p++) {
    if (final[p] < initial) losses++;
    sum += final[p];
  }
  out.prob_loss = losses / paths;
  out.mean_final = sum / paths;
  out.median_return = initial > 0 ? out.p50[months] / initial - 1 : 0;
  out.var95 = initial > 0 ? Math.max(0, 1 - out.p5[months] / initial) : 0;
  const ddSorted = Float64Array.from(drawdowns).sort();
  out.max_drawdown_median = percentileSorted(ddSorted, 0.5);
  out.max_drawdown_p95 = percentileSorted(ddSorted, 0.95);
  return out;
}
