import crypto from 'crypto';
import type { HourlyPoint } from './instruments';

/**
 * Arena fiyat yolu üretimi (SAF; veritabanına bağlanmaz — birim testli).
 *
 * 1) Pencere seçimi (pickWindows): son 14 günün saatlik GERÇEK noktalarından ardışık 36 noktalık bir
 *    pencere, tohumlu RNG ile seçilir. Tüm enstrümanların ortak zaman damgaları yeterliyse AYNI
 *    zaman aralığı kullanılır (enstrümanlar zamanda "birlikte" hareket eder); değilse her enstrüman
 *    aynı rastgele oranla kendi serisinden pencere alır.
 * 2) Yol (buildPath): pencere duration_s saniyeye sıkıştırılır (1 tick/sn, tick 0..duration_s).
 *    Gerçek noktalar eşit aralıklı çapa tick'lerine yerleşir; aralarına tohumlu bir Brown köprüsü
 *    (log fiyatta) üretilir. Köprü her çapadan TAM OLARAK geçer (çapa tick'inde değer gerçek fiyattır).
 *    Oynaklık pencerenin gerçekleşen saatlik log-getiri oynaklığından türetilir: bir saatlik bölüm L
 *    tick'e bölündüğünde tick başına σ = σ_saat · ölçek / √L (bölüm toplam varyansı ≈ σ_saat²).
 *    Çıktı (tohum, pencere) ikilisinden tamamen deterministiktir.
 */

export const WINDOW_POINTS = 36;

/**
 * Tur süresine göre oynatılacak gerçek saatlik nokta sayısı.
 * Kısa turlarda daha kısa bir gerçek kesit oynatılır; böylece saniye başına düşen hareket makul kalır
 * (ör. 60 sn → ~8 saat, 5 dk → ~16 saat, 10 dk → ~26 saat, ≥ 15 dk → 36 saat).
 */
export function windowPointsForDuration(durationS: number): number {
  return Math.min(WINDOW_POINTS, Math.max(7, Math.round(6 + durationS / 30)));
}
export const HISTORY_MAX_POINTS = 300;
/** Saatlik oynaklık için alt / varsayılan değer (log-getiri) */
const MIN_HOURLY_VOL = 2e-5;
const DEFAULT_HOURLY_VOL = 0.002;

/** Bir enstrümanın penceresi: from/to = ilk/son kova (ISO), points = [unix_sn, fiyat] */
export interface WindowSpec {
  from: string;
  to: string;
  points: [number, number][];
}

export type RoundWindow = Record<string, WindowSpec>;

/** Deterministik PRNG (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** (tohum, tuz) → 32 bit tohum */
export function deriveSeed(seed: string | number | bigint, salt: string): number {
  return crypto.createHash('sha256').update(`${String(seed)}|${salt}`).digest().readUInt32LE(0);
}

/** Standart normal (Box–Muller) */
export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Rastgele 48 bit pozitif tohum (BIGINT sütununa sığar, JS'te güvenli tamsayı) */
export function randomSeed(): number {
  return crypto.randomBytes(6).readUIntBE(0, 6);
}

const toSpec = (pts: HourlyPoint[]): WindowSpec => ({
  from: new Date(pts[0].t).toISOString(),
  to: new Date(pts[pts.length - 1].t).toISOString(),
  points: pts.map((p) => [Math.floor(p.t / 1000), p.p] as [number, number]),
});

/**
 * Tohumlu pencere seçimi. En az 2 noktası olmayan enstrümanlar sonuçta yer almaz.
 */
export function pickWindows(
  series: Map<string, HourlyPoint[]>,
  seed: string | number | bigint,
  windowPoints: number = WINDOW_POINTS
): RoundWindow {
  const rand = mulberry32(deriveSeed(seed, 'window'));
  const u = rand();
  const usable = [...series.entries()].filter(([, pts]) => pts.length >= 2);
  const out: RoundWindow = {};
  if (usable.length === 0) return out;

  // Ortak zaman damgaları (artan)
  let common: number[] = usable[0][1].map((p) => p.t);
  for (const [, pts] of usable.slice(1)) {
    const set = new Set(pts.map((p) => p.t));
    common = common.filter((t) => set.has(t));
  }

  if (common.length >= windowPoints) {
    const start = Math.floor(u * (common.length - windowPoints + 1));
    const times = common.slice(start, start + windowPoints);
    for (const [code, pts] of usable) {
      const byT = new Map(pts.map((p) => [p.t, p.p]));
      out[code] = toSpec(times.map((t) => ({ t, p: byT.get(t)! })));
    }
    return out;
  }

  for (const [code, pts] of usable) {
    const w = Math.min(windowPoints, pts.length);
    const start = Math.floor(u * (pts.length - w + 1));
    out[code] = toSpec(pts.slice(start, start + w));
  }
  return out;
}

/** Pencerenin gerçekleşen saatlik log-getiri oynaklığı (std) */
export function realizedHourlyVol(prices: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) rets.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (rets.length === 0) return DEFAULT_HOURLY_VOL;
  if (rets.length === 1) return Math.max(Math.abs(rets[0]), MIN_HOURLY_VOL);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  return Number.isFinite(sd) && sd > MIN_HOURLY_VOL ? sd : MIN_HOURLY_VOL;
}

/**
 * Çapa tick'leri: n nokta [0, durationS] aralığına eşit aralıklarla yerleşir. n − 1 > durationS ise
 * (çok kısa tur) noktalar eşit aralıklı alt kümeye indirgenir; dönen `indices` kullanılan noktalardır.
 */
export function anchorLayout(n: number, durationS: number): { ticks: number[]; indices: number[] } {
  if (n < 2) throw new Error('En az 2 nokta gerekli');
  const T = Math.max(1, Math.floor(durationS));
  const indices: number[] = [];
  if (n - 1 > T) {
    for (let k = 0; k <= T; k++) indices.push(Math.round((k * (n - 1)) / T));
  } else {
    for (let j = 0; j < n; j++) indices.push(j);
  }
  const m = indices.length;
  const ticks = indices.map((_, j) => Math.round((j * T) / (m - 1)));
  return { ticks, indices };
}

/**
 * Tick başına orta fiyat yolu (uzunluk durationS + 1). Çapa tick'lerinde değer gerçek fiyata
 * birebir eşittir; aradaki tick'ler tohumlu Brown köprüsüdür.
 */
export function buildPath(
  points: [number, number][],
  durationS: number,
  seed: string | number | bigint,
  code: string,
  volScale = 1
): number[] {
  const T = Math.max(1, Math.floor(durationS));
  const prices = points.map((p) => p[1]);
  if (prices.length === 0) throw new Error('Pencere boş');
  if (prices.length === 1) return new Array(T + 1).fill(prices[0]);

  const { ticks, indices } = anchorLayout(prices.length, T);
  const anchors = indices.map((i) => prices[i]);
  const sigmaHour = realizedHourlyVol(prices) * volScale;
  const rand = mulberry32(deriveSeed(seed, `path:${code}`));

  const mids = new Array<number>(T + 1);
  for (let j = 0; j < anchors.length - 1; j++) {
    const a = ticks[j];
    const b = ticks[j + 1];
    const pa = anchors[j];
    const pb = anchors[j + 1];
    mids[a] = pa;
    mids[b] = pb;
    const L = b - a;
    if (L <= 1) continue;
    // Bölümdeki saat sayısı (alt kümeye indirgenmişse > 1)
    const hours = Math.max(1, indices[j + 1] - indices[j]);
    const sigma = (sigmaHour * Math.sqrt(hours)) / Math.sqrt(L);
    const W = new Array<number>(L + 1);
    W[0] = 0;
    for (let k = 1; k <= L; k++) W[k] = W[k - 1] + sigma * gaussian(rand);
    const la = Math.log(pa);
    const lb = Math.log(pb);
    for (let k = 1; k < L; k++) {
      const f = k / L;
      mids[a + k] = Math.exp(la + f * (lb - la) + (W[k] - f * W[L]));
    }
  }
  return mids;
}

/**
 * Seriyi en fazla `max` noktaya indirger (eşit aralıklı; ilk ve son nokta korunur).
 * `ticks` her değerin tick indeksidir.
 */
export function downsample(values: number[], max: number = HISTORY_MAX_POINTS): { values: number[]; ticks: number[] } {
  const n = values.length;
  if (n <= max) return { values: [...values], ticks: values.map((_, i) => i) };
  const ticks: number[] = [];
  for (let k = 0; k < max; k++) ticks.push(Math.round((k * (n - 1)) / (max - 1)));
  const uniq = [...new Set(ticks)];
  return { values: uniq.map((i) => values[i]), ticks: uniq };
}

// ---------------------------------------------------------------------------
// Yol önbelleği (tur ID'sine göre LRU)
// ---------------------------------------------------------------------------

export class PathCache {
  private readonly map = new Map<string, Map<string, number[]>>();
  constructor(private readonly max = 256) {}

  get(key: string): Map<string, number[]> | undefined {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: Map<string, number[]>): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Turun tüm enstrümanları için yollar */
export function buildRoundPaths(window: RoundWindow, durationS: number, seed: string | number | bigint): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [code, spec] of Object.entries(window)) {
    if (spec?.points?.length) out.set(code, buildPath(spec.points, durationS, seed, code));
  }
  return out;
}
