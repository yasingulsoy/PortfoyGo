/**
 * Portföy danışmanı için saf (yan etkisiz) sayısal yardımcılar:
 * tohumlu RNG, normal / gamma / Dirichlet örnekleme, Cholesky, simetrik özdeğer (Jacobi),
 * en yakın pozitif yarı-tanımlı matris, yüzdelik.
 *
 * Hepsi deterministiktir: aynı tohum + aynı girdi → aynı çıktı.
 */

export type Matrix = number[][];

/** mulberry32: hızlı, 32 bit durumlu tohumlu RNG. [0, 1) döndürür. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** (0, 1) aralığında (uç değerler hariç) düzgün sayı — log(0) olmasın. */
function openUnit(rng: () => number): number {
  let u = rng();
  while (u <= 0) u = rng();
  return u;
}

/** Standart normal üreteci (Box–Muller, ikinci değeri saklar). */
export function createNormal(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = openUnit(rng);
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/** Gamma(alpha, 1) — Marsaglia–Tsang; alpha < 1 için alpha+1 ve U^(1/alpha) düzeltmesi. */
export function sampleGamma(alpha: number, rng: () => number, normal: () => number): number {
  if (alpha < 1) {
    return sampleGamma(alpha + 1, rng, normal) * Math.pow(openUnit(rng), 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = openUnit(rng);
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Simetrik Dirichlet(alpha) örneği (k boyutlu, toplamı 1). */
export function sampleDirichlet(k: number, alpha: number, rng: () => number, normal: () => number): number[] {
  const g = new Array<number>(k);
  let sum = 0;
  for (let i = 0; i < k; i++) {
    g[i] = sampleGamma(alpha, rng, normal);
    sum += g[i];
  }
  if (!(sum > 0)) return new Array<number>(k).fill(1 / k);
  for (let i = 0; i < k; i++) g[i] /= sum;
  return g;
}

export const dot = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function matVec(m: Matrix, v: number[]): number[] {
  return m.map((row) => dot(row, v));
}

/** w' Σ w */
export function quadForm(m: Matrix, w: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] === 0) continue;
    const row = m[i];
    let r = 0;
    for (let j = 0; j < w.length; j++) r += row[j] * w[j];
    s += w[i] * r;
  }
  return s;
}

export const zeros = (n: number, m = n): Matrix => Array.from({ length: n }, () => new Array<number>(m).fill(0));

/**
 * Pozitif YARI-tanımlı matrisler için Cholesky (L L' = A, L alt üçgen).
 * Pivot ~0 olan sütunlar (ör. oynaklığı sıfır olan TL nakit) sıfır bırakılır.
 */
export function cholesky(a: Matrix, eps = 1e-14): Matrix {
  const n = a.length;
  const l = zeros(n);
  for (let j = 0; j < n; j++) {
    let s = a[j][j];
    for (let k = 0; k < j; k++) s -= l[j][k] * l[j][k];
    if (s <= eps) {
      // Bu yönde varyans yok (veya sayısal gürültü): sütunu sıfırla
      continue;
    }
    const d = Math.sqrt(s);
    l[j][j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = a[i][j];
      for (let k = 0; k < j; k++) t -= l[i][k] * l[j][k];
      l[i][j] = t / d;
    }
  }
  return l;
}

/** Simetrik matrisin özdeğer/özvektörleri (klasik Jacobi). Küçük (≤ 10×10) matrisler içindir. */
export function symmetricEigen(a: Matrix, maxSweeps = 100): { values: number[]; vectors: Matrix } {
  const n = a.length;
  const m = a.map((row) => row.slice());
  const v = zeros(n);
  for (let i = 0; i < n; i++) v[i][i] = 1;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p][q] * m[p][q];
    if (off < 1e-24) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p][q]) < 1e-300) continue;
        const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k][p];
          const mkq = m[k][q];
          m[k][p] = c * mkp - s * mkq;
          m[k][q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p][k];
          const mqk = m[q][k];
          m[p][k] = c * mpk - s * mqk;
          m[q][k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: m.map((row, i) => row[i]), vectors: v };
}

/** Negatif özdeğerleri `floor`'a kırparak simetrik matrisi pozitif yarı-tanımlı hale getirir. */
export function nearestPsd(a: Matrix, floor = 0): Matrix {
  const n = a.length;
  const sym = a.map((row, i) => row.map((x, j) => (x + a[j][i]) / 2));
  const { values, vectors } = symmetricEigen(sym);
  if (values.every((x) => x >= floor)) return sym;
  const clipped = values.map((x) => Math.max(x, floor));
  const out = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors[i][k] * clipped[k] * vectors[j][k];
      out[i][j] = s;
    }
  }
  return out;
}

/** Sıralı dizide doğrusal enterpolasyonlu yüzdelik (p ∈ [0, 1]). */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = Math.min(Math.max(p, 0), 1) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n - 1);
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, digits: number) => {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
};
