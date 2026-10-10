import pool from '../../config/database';
import { clamp, Matrix, nearestPsd, zeros } from './math';
import {
  ASSET_CLASSES,
  AssetClass,
  ClassSpec,
  getTryCashReturn,
  HISTORY_DAYS,
  loadUniverse,
  seriesKey,
  Universe,
  USD_SERIES_KEY,
} from './universe';

/**
 * Piyasa istatistikleri (TL bazında, yıllık): beklenen getiri vektörü ve kovaryans matrisi.
 *
 * Yöntem (deterministik, açıklanabilir):
 *  1. price_history günlük kovalarından (son ≤ 2 yıl) her sınıf için hizalanmış TL günlük getiri serisi.
 *     Sepetler (hisse, kripto) her gün yeniden dengelenen sabit ağırlıklı sepettir; USD fiyatlı
 *     bileşenler USD/TRY (currency:USD) ile çevrilir.
 *  2. Yıllıklaştırma takvim günüyle (×365): price_history her gün bir kova üretir (hafta sonu dahil).
 *  3. Kovaryans: Ledoit–Wolf tarzı sabit korelasyon hedefine COV_SHRINKAGE oranında büzülür,
 *     sonra veri uzunluğuna göre (h = min(1, n/365)) önsel kovaryansla karıştırılır.
 *  4. Beklenen getiri: tarihsel sürüklenme (sınırlandırılmış) önselle karıştırılır;
 *     tarihsel ağırlık = MEAN_HISTORY_WEIGHT × h (≥1 yıl veride 50/50).
 *  5. Hizalanmış gözlem MIN_OBSERVATIONS'tan azsa yalnızca önsel parametreler kullanılır.
 *  data_quality: 'prior' (yalnız önsel) | 'mixed' (kısa geçmiş veya bazı sınıflar önsel) | 'historical'.
 */

export type DataQuality = 'prior' | 'mixed' | 'historical';

/** Bu sayıdan az hizalanmış günlük getiri varsa tamamen önsel parametrelere düşülür */
export const MIN_OBSERVATIONS = 120;
/** Ledoit–Wolf tarzı sabit korelasyon büzülme oranı */
export const COV_SHRINKAGE = 0.3;
/** ≥ 1 yıllık veride tarihsel ortalamanın ağırlığı (kalanı önsel) */
export const MEAN_HISTORY_WEIGHT = 0.5;
/** Tarihsel yıllık sürüklenme (sürekli) bu aralığa kırpılır — kısa/sentetik verideki uç değerlere karşı */
export const HIST_DRIFT_BOUNDS: [number, number] = [-0.5, 1.5];
/** Tek günlük log getiri bu aralığa kırpılır (hatalı fiyat noktalarına karşı) */
export const DAILY_LOG_RETURN_CAP = 0.5;
export const STATS_CACHE_MS = 60 * 60 * 1000;

/**
 * ÖNSEL PARAMETRELER (TL bazında, yıllık).
 * Beklenen getiri, TL nakit getirisinin ÜZERİNE eklenen bir risk primiyle tanımlanır:
 *   E_i = (1 + nakit) × (1 + prim_i) − 1
 * Böylece ADVISOR_TRY_CASH_RETURN değiştiğinde önseller tutarlı kalır (uzun vadede kurun faiz
 * farkı kadar değer kaybettiği "denge" varsayımı). Oynaklık ve korelasyonlar TL bazındadır
 * (USD/TRY dalgalanması dahil).
 */
export const PRIOR_PREMIUM_OVER_CASH: Record<Exclude<AssetClass, 'cash_try'>, number> = {
  usd: 0.005,
  eur: 0.005,
  gold: 0.025,
  us_stocks: 0.05,
  crypto: 0.12,
};

export const PRIOR_VOLATILITY: Record<Exclude<AssetClass, 'cash_try'>, number> = {
  usd: 0.12,
  eur: 0.13,
  gold: 0.18,
  us_stocks: 0.22,
  crypto: 0.65,
};

type RiskyClass = Exclude<AssetClass, 'cash_try'>;
export const RISKY_CLASSES: RiskyClass[] = ['usd', 'eur', 'gold', 'us_stocks', 'crypto'];

/** Önsel korelasyonlar (simetrik; listelenmeyen çiftler 0) */
export const PRIOR_CORRELATION: Partial<Record<`${RiskyClass}|${RiskyClass}`, number>> = {
  'usd|eur': 0.8,
  'usd|gold': 0.55,
  'usd|us_stocks': 0.5,
  'usd|crypto': 0.3,
  'eur|gold': 0.55,
  'eur|us_stocks': 0.45,
  'eur|crypto': 0.25,
  'gold|us_stocks': 0.2,
  'gold|crypto': 0.15,
  'us_stocks|crypto': 0.4,
};

export type ClassSource = 'historical' | 'prior' | 'fixed';

export interface MarketStats {
  classes: AssetClass[];
  /** Basit yıllık beklenen getiri (TL) */
  expected_return: number[];
  /** Sürekli yıllık beklenen büyüme oranı: ln(1 + E) (GBM sürüklenmesi) */
  mu: number[];
  /** Yıllık log getiri kovaryansı */
  cov: Matrix;
  volatility: number[];
  data_quality: DataQuality;
  /** Hizalanmış günlük getiri sayısı (önsele düşüldüyse 0) */
  observations: number;
  /** Kullanılan son fiyat noktasının tarihi */
  as_of: string | null;
  cash_return: number;
  sources: Record<AssetClass, ClassSource>;
}

function priorCorrelation(a: RiskyClass, b: RiskyClass): number {
  if (a === b) return 1;
  return PRIOR_CORRELATION[`${a}|${b}`] ?? PRIOR_CORRELATION[`${b}|${a}`] ?? 0;
}

export function priorExpectedReturn(cls: AssetClass, cashReturn: number): number {
  if (cls === 'cash_try') return cashReturn;
  return (1 + cashReturn) * (1 + PRIOR_PREMIUM_OVER_CASH[cls]) - 1;
}

/** Önsel yıllık kovaryans (ASSET_CLASSES sırası; nakit satır/sütunu 0) */
export function priorCovariance(): Matrix {
  const n = ASSET_CLASSES.length;
  const cov = zeros(n);
  for (let i = 0; i < n; i++) {
    const a = ASSET_CLASSES[i];
    if (a === 'cash_try') continue;
    for (let j = 0; j < n; j++) {
      const b = ASSET_CLASSES[j];
      if (b === 'cash_try') continue;
      cov[i][j] = priorCorrelation(a, b) * PRIOR_VOLATILITY[a] * PRIOR_VOLATILITY[b];
    }
  }
  return nearestPsd(cov);
}

/** Tarih (ms) → fiyat */
export type PriceSeries = Map<number, number>;

export interface StatsInput {
  specs: ClassSpec[];
  /** "asset_type:SYMBOL" → günlük seri */
  series: Map<string, PriceSeries>;
  cashReturn: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function requiredKeys(spec: ClassSpec): string[] {
  const keys = spec.components.map((c) => seriesKey(c.asset_type, c.symbol));
  if (spec.components.some((c) => c.currency === 'USD')) keys.push(USD_SERIES_KEY);
  return [...new Set(keys)];
}

/** Ledoit–Wolf tarzı: sabit (ortalama) korelasyon hedefine doğru büzme */
export function shrinkToConstantCorrelation(s: Matrix, delta: number): Matrix {
  const n = s.length;
  const sd = s.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sd[i] > 0 && sd[j] > 0) {
        sum += s[i][j] / (sd[i] * sd[j]);
        cnt++;
      }
    }
  }
  const rbar = cnt > 0 ? sum / cnt : 0;
  return s.map((row, i) => row.map((x, j) => (i === j ? x : delta * rbar * sd[i] * sd[j] + (1 - delta) * x)));
}

function priorOnly(cashReturn: number): MarketStats {
  const cov = priorCovariance();
  const expected = ASSET_CLASSES.map((c) => priorExpectedReturn(c, cashReturn));
  const sources = Object.fromEntries(ASSET_CLASSES.map((c) => [c, c === 'cash_try' ? 'fixed' : 'prior'])) as Record<AssetClass, ClassSource>;
  return finalize(expected.map((e) => Math.log(1 + e)), cov, cashReturn, 'prior', 0, null, sources);
}

function finalize(
  mu: number[],
  cov: Matrix,
  cashReturn: number,
  quality: DataQuality,
  observations: number,
  asOf: string | null,
  sources: Record<AssetClass, ClassSource>
): MarketStats {
  return {
    classes: [...ASSET_CLASSES],
    expected_return: mu.map((m) => Math.exp(m) - 1),
    mu,
    cov,
    volatility: cov.map((row, i) => Math.sqrt(Math.max(row[i], 0))),
    data_quality: quality,
    observations,
    as_of: asOf,
    cash_return: cashReturn,
    sources,
  };
}

/** Saf: fiyat serilerinden istatistikleri hesaplar (yetersiz veride önsele düşer). */
export function computeStats(input: StatsInput): MarketStats {
  const { specs, series, cashReturn } = input;
  const specByClass = new Map(specs.map((s) => [s.class, s]));

  // 1) Geçmişi yeterli sınıflar
  const histClasses = RISKY_CLASSES.filter((c) => {
    const spec = specByClass.get(c);
    if (!spec || spec.components.length === 0) return false;
    return requiredKeys(spec).every((k) => (series.get(k)?.size ?? 0) >= MIN_OBSERVATIONS + 1);
  });
  if (histClasses.length === 0) return priorOnly(cashReturn);

  // 2) Ortak tarihler (tüm gerekli serilerin kesişimi)
  const keys = [...new Set(histClasses.flatMap((c) => requiredKeys(specByClass.get(c)!)))];
  let dates: number[] | null = null;
  for (const k of keys) {
    const ds = [...series.get(k)!.keys()];
    if (dates === null) {
      dates = ds;
    } else {
      const set = new Set(ds);
      dates = dates.filter((d) => set.has(d));
    }
  }
  const aligned = (dates ?? []).sort((a, b) => a - b);
  const nObs = aligned.length - 1;
  if (nObs < MIN_OBSERVATIONS) return priorOnly(cashReturn);

  // 3) Günlük log getiriler (sınıf × gözlem) ve gün aralıkları
  const k = histClasses.length;
  const rets: number[][] = histClasses.map(() => new Array<number>(nObs));
  const gaps = new Array<number>(nObs);
  const usd = series.get(USD_SERIES_KEY);
  for (let t = 0; t < nObs; t++) {
    const d0 = aligned[t];
    const d1 = aligned[t + 1];
    gaps[t] = Math.max(1, Math.round((d1 - d0) / DAY_MS));
    const fx = usd ? usd.get(d1)! / usd.get(d0)! : NaN;
    histClasses.forEach((c, i) => {
      const spec = specByClass.get(c)!;
      const wsum = spec.components.reduce((s, x) => s + x.weight, 0) || 1;
      let gross = 0;
      for (const comp of spec.components) {
        const s = series.get(seriesKey(comp.asset_type, comp.symbol))!;
        const ratio = s.get(d1)! / s.get(d0)!;
        gross += (comp.weight / wsum) * ratio * (comp.currency === 'USD' ? fx : 1);
      }
      const r = Math.log(gross);
      rets[i][t] = Number.isFinite(r) ? clamp(r, -DAILY_LOG_RETURN_CAP, DAILY_LOG_RETURN_CAP) : 0;
    });
  }

  // 4) Gün başına ortalama ve kovaryans (aralık uzunluğuyla normalize), yıllıklaştırma
  const totalDays = gaps.reduce((s, g) => s + g, 0);
  const meanDaily = rets.map((r) => r.reduce((s, x) => s + x, 0) / totalDays);
  const sample = zeros(k);
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0;
      for (let t = 0; t < nObs; t++) {
        s += ((rets[i][t] - meanDaily[i] * gaps[t]) * (rets[j][t] - meanDaily[j] * gaps[t])) / gaps[t];
      }
      const v = (s / (nObs - 1)) * 365;
      sample[i][j] = v;
      sample[j][i] = v;
    }
  }
  const shrunk = shrinkToConstantCorrelation(sample, COV_SHRINKAGE);

  // 5) Önselle karıştır
  const h = Math.min(1, nObs / 365);
  const prior = priorCovariance();
  const idx = (c: AssetClass) => ASSET_CLASSES.indexOf(c);
  const cov = prior.map((row) => row.slice());
  histClasses.forEach((a, i) => {
    histClasses.forEach((b, j) => {
      cov[idx(a)][idx(b)] = h * shrunk[i][j] + (1 - h) * prior[idx(a)][idx(b)];
    });
  });
  // Bazı sınıflar önselden geldiyse (veya ortalama korelasyon çok negatifse) karışık matris PSD
  // olmayabilir → en yakın PSD (zaten PSD ise değişmez)
  const finalCov = nearestPsd(cov);

  const alpha = MEAN_HISTORY_WEIGHT * h;
  const mu = ASSET_CLASSES.map((c) => Math.log(1 + priorExpectedReturn(c, cashReturn)));
  histClasses.forEach((c, i) => {
    const histDrift = clamp(meanDaily[i] * 365 + sample[i][i] / 2, HIST_DRIFT_BOUNDS[0], HIST_DRIFT_BOUNDS[1]);
    mu[idx(c)] = alpha * histDrift + (1 - alpha) * mu[idx(c)];
  });

  const sources = Object.fromEntries(
    ASSET_CLASSES.map((c) => [c, c === 'cash_try' ? 'fixed' : histClasses.includes(c as RiskyClass) ? 'historical' : 'prior'])
  ) as Record<AssetClass, ClassSource>;
  const quality: DataQuality = histClasses.length === RISKY_CLASSES.length && nObs >= 365 ? 'historical' : 'mixed';
  return finalize(mu, finalCov, cashReturn, quality, nObs, new Date(aligned[aligned.length - 1]).toISOString(), sources);
}

/** price_history'den gerekli günlük serileri okur (sadece okuma). */
export async function loadSeries(universe: Universe): Promise<Map<string, PriceSeries>> {
  const keys = [...new Set(universe.classes.flatMap((c) => (c.components.length ? requiredKeys(c) : [])))];
  const out = new Map<string, PriceSeries>();
  if (keys.length === 0) return out;
  const r = await pool.query(
    `SELECT asset_type, symbol, bucket_start, price
       FROM price_history
      WHERE granularity = 'day'
        AND bucket_start >= now() - ($1::int * INTERVAL '1 day')
        AND (asset_type || ':' || symbol) = ANY($2)
      ORDER BY bucket_start`,
    [HISTORY_DAYS, keys]
  );
  for (const row of r.rows) {
    const key = seriesKey(row.asset_type, row.symbol);
    const price = parseFloat(row.price);
    if (!(price > 0)) continue;
    let s = out.get(key);
    if (!s) {
      s = new Map();
      out.set(key, s);
    }
    s.set(new Date(row.bucket_start).getTime(), price);
  }
  return out;
}

export interface MarketContext {
  universe: Universe;
  stats: MarketStats;
  computed_at: number;
}

let memo: { value: MarketContext; at: number; cash: number } | null = null;
let inflight: Promise<MarketContext> | null = null;

/** Evren + istatistikler (1 saat önbellekli). */
export async function getMarketContext(): Promise<MarketContext> {
  const cash = getTryCashReturn();
  if (memo && memo.cash === cash && Date.now() - memo.at < STATS_CACHE_MS) return memo.value;
  if (inflight) return inflight;
  inflight = (async () => {
    const universe = await loadUniverse();
    const series = await loadSeries(universe);
    const stats = computeStats({ specs: universe.classes, series, cashReturn: cash });
    const value: MarketContext = { universe, stats, computed_at: Date.now() };
    memo = { value, at: Date.now(), cash };
    return value;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function clearMarketContextCache(): void {
  memo = null;
}
