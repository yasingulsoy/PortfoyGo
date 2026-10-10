import { createNormal, createRng, dot, Matrix, quadForm, sampleDirichlet } from './math';

/**
 * Kısıtlı, yalnızca uzun pozisyonlu portföy seçimi (Modern Portföy Teorisi, örneklemeyle).
 *
 *  1. Aday kümesi: kısıt politopunun köşeleri (her sınıf sırası için "önce min, sonra sırayla max'a
 *     kadar doldur") + N tohumlu Dirichlet örneği (min'lerin üstüne dağıtılır, max'a izdüşürülür).
 *  2. Her aday için beklenen getiri w·E ve oynaklık √(w'Σw).
 *  3. Oynaklığı profil bandında olanlar arasından en yüksek Sharpe ((E − rf)/σ, rf = TL nakit).
 *     Bantta aday yoksa banda en yakın olan (eşitlikte yüksek Sharpe).
 *  4. Ağırlıklar %1'e yuvarlanır (toplam tam %100, kısıtlar korunur), metrikler yeniden hesaplanır.
 *  5. Etkin sınır: adayların oynaklık aralığı 25 dilime bölünür; her dilimin en yüksek getirisi,
 *     en düşük oynaklıktan başlayarak getirisi artan noktalar (üst zarf).
 *
 * Saf ve deterministiktir (aynı girdi + tohum → aynı sonuç).
 */

export interface OptimizeInput {
  /** Basit yıllık beklenen getiriler */
  expected: number[];
  /** Yıllık kovaryans */
  cov: Matrix;
  /** Risksiz oran (TL nakit getirisi) */
  riskFree: number;
  min: number[];
  max: number[];
  volBand: [number, number];
  samples?: number;
  seed?: number;
  frontierPoints?: number;
}

export interface PortfolioPoint {
  weights: number[];
  expected_return: number;
  volatility: number;
  sharpe: number;
}

export interface FrontierPoint {
  volatility: number;
  expected_return: number;
}

export interface OptimizeResult extends PortfolioPoint {
  /** Yuvarlanmış ağırlıkların oynaklığı profil bandında mı */
  in_band: boolean;
  /** Ağırlıklar yüzde olarak (tamsayı, toplam 100) */
  percents: number[];
  frontier: FrontierPoint[];
  candidates: number;
}

export const DEFAULT_SAMPLES = 20_000;
export const DEFAULT_SEED = 20_240_601;
export const DIRICHLET_ALPHAS = [1, 0.35];
const EPS = 1e-9;

export function evaluate(w: number[], expected: number[], cov: Matrix, riskFree: number): PortfolioPoint {
  const ret = dot(w, expected);
  const vol = Math.sqrt(Math.max(quadForm(cov, w), 0));
  return { weights: w, expected_return: ret, volatility: vol, sharpe: vol > 1e-6 ? (ret - riskFree) / vol : 0 };
}

/** Kısıtların uygulanabilir olup olmadığını denetler */
export function assertFeasible(min: number[], max: number[]): void {
  if (min.length !== max.length) throw new Error('min/max boyutları farklı');
  for (let i = 0; i < min.length; i++) {
    if (min[i] < 0 || max[i] > 1 || min[i] > max[i] + EPS) throw new Error(`Geçersiz sınır (indeks ${i})`);
  }
  const sMin = min.reduce((s, x) => s + x, 0);
  const sMax = max.reduce((s, x) => s + x, 0);
  if (sMin > 1 + EPS || sMax < 1 - EPS) throw new Error('Kısıtlar uygulanabilir değil (Σmin ≤ 1 ≤ Σmax olmalı)');
}

/** {Σw = 1, min ≤ w ≤ max} kümesine Öklid izdüşümü (τ üzerinde ikiye bölme). */
export function projectToBounds(v: number[], min: number[], max: number[]): number[] {
  const n = v.length;
  let total = 0;
  let inside = true;
  for (let i = 0; i < n; i++) {
    total += v[i];
    if (v[i] < min[i] || v[i] > max[i]) inside = false;
  }
  if (inside && Math.abs(total - 1) < 1e-12) return v.slice();

  const sumAt = (tau: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const x = v[i] - tau;
      s += x < min[i] ? min[i] : x > max[i] ? max[i] : x;
    }
    return s;
  };
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, v[i] - max[i]);
    hi = Math.max(hi, v[i] - min[i]);
  }
  lo -= 1;
  hi += 1;
  for (let it = 0; it < 64; it++) {
    const mid = (lo + hi) / 2;
    if (sumAt(mid) > 1) lo = mid;
    else hi = mid;
  }
  const tau = (lo + hi) / 2;
  const w = v.map((x, i) => Math.min(max[i], Math.max(min[i], x - tau)));
  // Kalan sayısal hatayı serbest bir bileşene yükle
  const err = 1 - w.reduce((s, x) => s + x, 0);
  if (err !== 0) {
    for (let i = 0; i < n; i++) {
      const nw = w[i] + err;
      if (nw >= min[i] - EPS && nw <= max[i] + EPS) {
        w[i] = nw;
        break;
      }
    }
  }
  return w;
}

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const perm = Array.from({ length: n }, (_, i) => i);
  const used = new Array<boolean>(n).fill(false);
  const cur: number[] = [];
  const rec = () => {
    if (cur.length === n) {
      out.push(cur.slice());
      return;
    }
    for (const i of perm) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  return out;
}

/** Kısıt politopunun köşeleri (greedy doldurma; tekrarlar ayıklanır). n ≤ 8 için. */
export function constraintCorners(min: number[], max: number[]): number[][] {
  const n = min.length;
  const seen = new Set<string>();
  const out: number[][] = [];
  const baseRemaining = 1 - min.reduce((s, x) => s + x, 0);
  for (const order of permutations(n)) {
    const w = min.slice();
    let remaining = baseRemaining;
    for (const i of order) {
      const add = Math.min(max[i] - min[i], remaining);
      w[i] += add;
      remaining -= add;
      if (remaining <= EPS) break;
    }
    const key = w.map((x) => x.toFixed(6)).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(w);
    }
  }
  return out;
}

/**
 * Ağırlıkları tam yüzdeye yuvarlar (en büyük kalan yöntemi): toplam 100, min/max korunur.
 */
export function roundToPercents(w: number[], min: number[], max: number[]): number[] {
  const n = w.length;
  const lower = min.map((x) => Math.ceil(x * 100 - 1e-6));
  const upper = max.map((x) => Math.floor(x * 100 + 1e-6));
  const raw = w.map((x) => x * 100);
  const p = raw.map((x, i) => Math.min(upper[i], Math.max(lower[i], Math.floor(x + 1e-9))));
  let diff = 100 - p.reduce((s, x) => s + x, 0);
  // Kalan (kesirli kısım) büyükten küçüğe; eşitlikte indeks
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[b] - p[b] - (raw[a] - p[a]) || a - b);
  let guard = 0;
  while (diff > 0 && guard++ < 1000) {
    let moved = false;
    for (const i of order) {
      if (diff === 0) break;
      if (p[i] < upper[i]) {
        p[i]++;
        diff--;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const reverse = order.slice().reverse();
  while (diff < 0 && guard++ < 2000) {
    let moved = false;
    for (const i of reverse) {
      if (diff === 0) break;
      if (p[i] > lower[i]) {
        p[i]--;
        diff++;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return p;
}

export function efficientFrontier(points: { volatility: number; expected_return: number }[], buckets: number): FrontierPoint[] {
  if (points.length === 0) return [];
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of points) {
    if (p.volatility < vMin) vMin = p.volatility;
    if (p.volatility > vMax) vMax = p.volatility;
  }
  const width = (vMax - vMin) / buckets;
  const best: (FrontierPoint | null)[] = new Array(buckets).fill(null);
  for (const p of points) {
    const b = width > 0 ? Math.min(buckets - 1, Math.floor((p.volatility - vMin) / width)) : 0;
    const cur = best[b];
    if (!cur || p.expected_return > cur.expected_return) best[b] = { volatility: p.volatility, expected_return: p.expected_return };
  }
  const out: FrontierPoint[] = [];
  let maxRet = -Infinity;
  for (const p of best) {
    if (!p) continue;
    if (p.expected_return > maxRet + 1e-12) {
      out.push(p);
      maxRet = p.expected_return;
    }
  }
  return out;
}

export function optimize(input: OptimizeInput): OptimizeResult {
  const { expected, cov, riskFree, min, max, volBand } = input;
  const n = expected.length;
  const samples = input.samples ?? DEFAULT_SAMPLES;
  const seed = input.seed ?? DEFAULT_SEED;
  assertFeasible(min, max);

  const rng = createRng(seed);
  const normal = createNormal(rng);
  const candidates: number[][] = constraintCorners(min, max);
  const sMin = min.reduce((s, x) => s + x, 0);
  const free = 1 - sMin;
  // Yalnızca serbest (max > min) sınıflar üzerinde örnekle
  const freeIdx = min.map((m, i) => (max[i] - m > EPS ? i : -1)).filter((i) => i >= 0);
  if (freeIdx.length > 0) {
    for (let s = 0; s < samples; s++) {
      const d = sampleDirichlet(freeIdx.length, DIRICHLET_ALPHAS[s % DIRICHLET_ALPHAS.length], rng, normal);
      const v = min.slice();
      for (let j = 0; j < freeIdx.length; j++) v[freeIdx[j]] += free * d[j];
      candidates.push(projectToBounds(v, min, max));
    }
  }

  const [bandLo, bandHi] = volBand;
  const evaluated = candidates.map((w) => evaluate(w, expected, cov, riskFree));
  const distance = (vol: number) => (vol < bandLo ? bandLo - vol : vol > bandHi ? vol - bandHi : 0);

  let best: PortfolioPoint | null = null;
  let bestDist = Infinity;
  for (const p of evaluated) {
    const dist = distance(p.volatility);
    if (
      best === null ||
      dist < bestDist - 1e-12 ||
      (Math.abs(dist - bestDist) <= 1e-12 &&
        (p.sharpe > best.sharpe + 1e-12 || (Math.abs(p.sharpe - best.sharpe) <= 1e-12 && p.volatility < best.volatility)))
    ) {
      best = p;
      bestDist = dist;
    }
  }

  const percents = roundToPercents(best!.weights, min, max);
  const weights = percents.map((p) => p / 100);
  const final = evaluate(weights, expected, cov, riskFree);
  return {
    ...final,
    percents,
    in_band: final.volatility >= bandLo - 1e-9 && final.volatility <= bandHi + 1e-9,
    frontier: efficientFrontier(evaluated, input.frontierPoints ?? 25),
    candidates: candidates.length,
  };
}
