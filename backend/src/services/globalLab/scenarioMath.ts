import { Matrix, nearestPsd, quadForm, symmetricEigen, zeros } from '../advisor/math';
import { simulate } from '../advisor/montecarlo';
import { evaluate } from '../advisor/optimizer';
import { BaseCurrency, FX_KEY, TR_GLOBAL_MARKET_SHARE_PCT, cellKey } from './config';

/**
 * Global Portföy Lab senaryo matematiği — SAF (veritabanına bağlanmaz; birim testli). Portföy Sihirbazı'nın
 * sayısal çekirdeğini (advisor/math, montecarlo, optimizer.evaluate) DEĞİŞTİRMEDEN yeniden kullanır.
 *
 * Model (yıllık):
 *  - Her hücrenin (sınıf × bölge) USD bazında beklenen aritmetik getirisi E ve log getiri oynaklığı σ vardır;
 *    korelasyonlar hücreler + 'fx|USDTRY' arasında tanımlıdır (eksik çift = 0). Matris pozitif yarı-tanımlı değilse
 *    en yakın PSD matrise düzeltilir ve köşegen 1'e normalize edilir (psd_adjusted).
 *  - Sürekli büyüme μ = ln(1 + E), kovaryans Σ_ij = ρ_ij σ_i σ_j (advisor ile aynı tanım).
 *  - TL bazı: x_TRY = x_USD + x_fx →  μ_i' = μ_i + μ_f + ρ_if σ_i σ_f,
 *                                      Σ_ij' = Σ_ij + ρ_if σ_i σ_f + ρ_jf σ_j σ_f + σ_f².
 *  - Portföy: E_p = Σ w_i E_i, σ_p = √(w'Σw) (advisor optimizer.evaluate), Sharpe (E_p − r_f)/σ_p,
 *    r_f = baz para biriminin nakit hücresi.
 *  - Monte Carlo: advisor montecarlo.simulate (aylık adım, aylık yeniden dengeleme, sabit tohum).
 *  - Çeşitlendirme: etkin bahis sayısı (Meucci: kovaryansın temel bileşenlerine düşen risk paylarının entropisi),
 *    etkin varlık sayısı 1/Σw², bölge / para birimi / sınıf yoğunlaşması (Herfindahl), Türkiye yerel ağırlığı.
 *  - Stres testi: senaryonun USD bazlı şokları (hücre yoksa aynı sınıfın 'Küresel' şoku, o da yoksa 0 + "tanımsız");
 *    TL bazında (1 + şok) × (1 + USD/TRY şoku) − 1.
 */

export interface AssumptionInput {
  key: string;
  kind: 'cell' | 'fx';
  asset_class: string | null;
  region: string | null;
  label: string;
  expected_return_pct: number;
  volatility_pct: number;
}

export interface CorrelationInput {
  key_a: string;
  key_b: string;
  rho: number;
}

export interface StressInput {
  id: string;
  name: string;
  period_label: string | null;
  description: string | null;
  shocks: Record<string, number>;
}

export interface Market {
  /** kind = 'cell' satırları (sıralı) */
  cells: AssumptionInput[];
  fx: AssumptionInput | null;
  /** Hücre anahtarları + (varsa) fx anahtarı en sonda */
  keys: string[];
  index: Map<string, number>;
  byKey: Map<string, AssumptionInput>;
  /** Tam korelasyon matrisi (keys sırası; PSD, köşegen 1) */
  corr: Matrix;
  psd_adjusted: boolean;
  /** Düzeltmeden önceki en küçük özdeğer */
  min_eigenvalue: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Varsayımlar + korelasyon çiftlerinden pazar modeli kurar. */
export function buildMarket(assumptions: AssumptionInput[], correlations: CorrelationInput[]): Market {
  const cells = assumptions.filter((a) => a.kind === 'cell');
  const fx = assumptions.find((a) => a.kind === 'fx' && a.key === FX_KEY) ?? null;
  const keys = [...cells.map((c) => c.key), ...(fx ? [fx.key] : [])];
  const index = new Map(keys.map((k, i) => [k, i]));
  const byKey = new Map([...cells, ...(fx ? [fx] : [])].map((a) => [a.key, a]));
  const n = keys.length;
  const corr = zeros(n);
  for (let i = 0; i < n; i++) corr[i][i] = 1;
  for (const c of correlations) {
    const i = index.get(c.key_a);
    const j = index.get(c.key_b);
    if (i === undefined || j === undefined || i === j || !Number.isFinite(c.rho)) continue;
    corr[i][j] = corr[j][i] = clamp(c.rho, -1, 1);
  }
  const minEig = n > 0 ? Math.min(...symmetricEigen(corr).values) : 1;
  if (minEig >= -1e-10) return { cells, fx, keys, index, byKey, corr, psd_adjusted: false, min_eigenvalue: minEig };

  const fixed = nearestPsd(corr, 1e-8);
  const d = fixed.map((row, i) => Math.sqrt(Math.max(row[i], 1e-12)));
  const norm = fixed.map((row, i) => row.map((x, j) => (i === j ? 1 : clamp(x / (d[i] * d[j]), -1, 1))));
  return { cells, fx, keys, index, byKey, corr: norm, psd_adjusted: true, min_eigenvalue: minEig };
}

/** Sınıf × bölge için varsayım hücresi; yoksa aynı sınıfın 'Küresel' hücresi (fallback); o da yoksa null. */
export function resolveCell(market: Market, assetClass: string, region: string): { key: string; fallback: boolean } | null {
  const exact = cellKey(assetClass, region);
  if (market.byKey.get(exact)?.kind === 'cell') return { key: exact, fallback: false };
  const global = cellKey(assetClass, 'Küresel');
  if (market.byKey.get(global)?.kind === 'cell') return { key: global, fallback: true };
  return null;
}

export interface ScenarioParams {
  keys: string[];
  /** Basit yıllık beklenen getiri (baz para biriminde) */
  expected: number[];
  /** Sürekli yıllık büyüme (Monte Carlo) */
  mu: number[];
  cov: Matrix;
  volatility: number[];
}

/** Seçili hücreler için baz para biriminde parametreler. TL bazı fx satırı gerektirir. */
export function scenarioParams(market: Market, keys: string[], base: BaseCurrency): ScenarioParams {
  const idx = keys.map((k) => {
    const i = market.index.get(k);
    if (i === undefined || market.byKey.get(k)?.kind !== 'cell') throw new Error(`Bilinmeyen varsayım hücresi: ${k}`);
    return i;
  });
  const E = keys.map((k) => market.byKey.get(k)!.expected_return_pct / 100);
  const s = keys.map((k) => market.byKey.get(k)!.volatility_pct / 100);
  const muUsd = E.map((e) => Math.log(1 + Math.max(e, -0.99)));
  const n = keys.length;
  const cov = zeros(n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cov[a][b] = market.corr[idx[a]][idx[b]] * s[a] * s[b];

  let mu = muUsd;
  if (base === 'TRY') {
    if (!market.fx) throw new Error('TL bazı için USD/TRY varsayımı (fx|USDTRY) gerekli');
    const f = market.index.get(market.fx.key)!;
    const sf = market.fx.volatility_pct / 100;
    const mf = Math.log(1 + Math.max(market.fx.expected_return_pct / 100, -0.99));
    const cf = idx.map((i, a) => market.corr[i][f] * s[a] * sf);
    mu = muUsd.map((m, a) => m + mf + cf[a]);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cov[a][b] += cf[a] + cf[b] + sf * sf;
  }
  return {
    keys,
    expected: mu.map((m) => Math.exp(m) - 1),
    mu,
    cov,
    volatility: cov.map((row, i) => Math.sqrt(Math.max(row[i], 0))),
  };
}

/** Risksiz oran: baz para biriminin nakit hücresi (USD → 'nakit|Kuzey Amerika', TRY → 'nakit|Türkiye'); yoksa 0. */
export function riskFreeRate(market: Market, base: BaseCurrency): number {
  const key = base === 'USD' ? cellKey('nakit', 'Kuzey Amerika') : cellKey('nakit', 'Türkiye');
  if (market.byKey.get(key)?.kind !== 'cell') return 0;
  if (base === 'TRY' && !market.fx) return 0;
  return scenarioParams(market, [key], base).expected[0];
}

/** Varyansa katkı payları w_i (Σw)_i / w'Σw (toplam 1). Varyans ~0 ise ağırlıklar. */
export function riskContributions(w: number[], cov: Matrix): number[] {
  const total = quadForm(cov, w);
  if (!(total > 1e-14)) {
    const s = w.reduce((a, x) => a + x, 0) || 1;
    return w.map((x) => x / s);
  }
  return w.map((wi, i) => (wi * cov[i].reduce((acc, c, j) => acc + c * w[j], 0)) / total);
}

/**
 * Etkin bahis sayısı (Meucci 2009): Σ'nın özvektörleri (temel bileşenler) bağımsız risk kaynakları kabul edilir;
 * p_k = (v_k·w)² λ_k / w'Σw ve ENB = exp(−Σ p_k ln p_k). 1 (tek risk kaynağı) ile varlık sayısı arasındadır.
 */
export function effectiveNumberOfBets(w: number[], cov: Matrix): number {
  const n = w.length;
  if (n <= 1) return 1;
  const total = quadForm(cov, w);
  if (!(total > 1e-14)) return 1;
  const { values, vectors } = symmetricEigen(cov);
  let entropy = 0;
  for (let k = 0; k < n; k++) {
    let proj = 0;
    for (let i = 0; i < n; i++) proj += vectors[i][k] * w[i];
    const p = (proj * proj * Math.max(values[k], 0)) / total;
    if (p > 1e-12) entropy -= p * Math.log(p);
  }
  return Math.min(n, Math.max(1, Math.exp(entropy)));
}

/** Etkin varlık sayısı (Herfindahl tersi) 1/Σw² */
export function effectiveHoldings(w: number[]): number {
  const s = w.reduce((a, x) => a + x * x, 0);
  return s > 0 ? 1 / s : 0;
}

export interface Share {
  name: string;
  share: number;
}

/** Grup payları (büyükten küçüğe) + Herfindahl endeksi (Σ pay²; 1 = tek grup) */
export function concentration(items: { name: string; weight: number }[]): { shares: Share[]; hhi: number; top: Share | null } {
  const map = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    if (!(it.weight > 0)) continue;
    map.set(it.name, (map.get(it.name) ?? 0) + it.weight);
    total += it.weight;
  }
  const shares = [...map.entries()]
    .map(([name, w]) => ({ name, share: total > 0 ? w / total : 0 }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name, 'tr'));
  return { shares, hhi: shares.reduce((a, s) => a + s.share * s.share, 0), top: shares[0] ?? null };
}

// ---------------------------------------------------------------------------
// Stres testi
// ---------------------------------------------------------------------------

export interface Exposure {
  key: string;
  /** Oran (toplam 1) */
  weight: number;
  label: string;
  asset_class: string;
  region: string;
  currency: string;
  /** Varsayım bu sınıfın 'Küresel' hücresinden alındı */
  fallback?: boolean;
  instrument?: { id: string; symbol: string; name: string } | null;
}

export interface StressRow {
  key: string;
  weight: number;
  /** Baz para biriminde uygulanan şok (oran) */
  shock: number;
  contribution: number;
  source: 'exact' | 'fallback' | 'missing';
}

export interface StressResult {
  id: string;
  name: string;
  period_label: string | null;
  description: string | null;
  portfolio_return: number;
  /** TL bazında uygulanan USD/TRY şoku (oran); USD bazında null */
  fx_shock: number | null;
  rows: StressRow[];
  missing: string[];
}

const shockOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function stressTest(exposures: { key: string; weight: number; asset_class: string }[], scenario: StressInput, base: BaseCurrency): StressResult {
  const fxPct = shockOf(scenario.shocks[FX_KEY]) ?? 0;
  const rows: StressRow[] = exposures.map((e) => {
    let pct = shockOf(scenario.shocks[e.key]);
    let source: StressRow['source'] = 'exact';
    if (pct === undefined) {
      pct = shockOf(scenario.shocks[cellKey(e.asset_class, 'Küresel')]);
      source = pct === undefined ? 'missing' : 'fallback';
    }
    let r = (pct ?? 0) / 100;
    if (base === 'TRY') r = (1 + r) * (1 + fxPct / 100) - 1;
    return { key: e.key, weight: e.weight, shock: r, contribution: e.weight * r, source };
  });
  return {
    id: scenario.id,
    name: scenario.name,
    period_label: scenario.period_label,
    description: scenario.description,
    portfolio_return: rows.reduce((a, r) => a + r.contribution, 0),
    fx_shock: base === 'TRY' ? fxPct / 100 : null,
    rows,
    missing: rows.filter((r) => r.source === 'missing').map((r) => r.key),
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------

export interface LabSimulation {
  months: number[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  paths: number;
  seed: number;
  prob_loss: number;
  median_return: number;
  mean_final: number;
  /** Vade sonu: 1 − p5/başlangıç (en az 0) */
  var95_horizon: number;
  /** Bir yıllık %95 VaR: 1 − p5(12. ay)/başlangıç (en az 0) */
  var95_1y: number;
  /** Vade sonu %5 ve %95 yüzdelik getiriler */
  p5_return: number;
  p95_return: number;
  /** Medyan senaryonun yıllık bileşik getirisi */
  cagr_median: number;
  max_drawdown_median: number;
  max_drawdown_p95: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function monteCarlo(w: number[], params: ScenarioParams, years: number, amount: number, opts: { paths: number; seed: number }): LabSimulation {
  const months = Math.max(1, Math.round(years * 12));
  const sim = simulate({ weights: w, mu: params.mu, cov: params.cov, months, initial: amount, paths: opts.paths, seed: opts.seed });
  const at12 = Math.min(12, months);
  const end = sim.p50.length - 1;
  // Uzun vadelerde yük küçülsün: 10 yıldan uzunsa 3 ayda bir nokta (son ay her zaman dahil)
  const step = months > 120 ? 3 : 1;
  const pick = sim.months.map((_, i) => i).filter((i) => i % step === 0 || i === end);
  return {
    months: pick.map((i) => sim.months[i]),
    p5: pick.map((i) => r2(sim.p5[i])),
    p25: pick.map((i) => r2(sim.p25[i])),
    p50: pick.map((i) => r2(sim.p50[i])),
    p75: pick.map((i) => r2(sim.p75[i])),
    p95: pick.map((i) => r2(sim.p95[i])),
    paths: sim.paths,
    seed: opts.seed,
    prob_loss: sim.prob_loss,
    median_return: sim.median_return,
    mean_final: sim.mean_final,
    var95_horizon: sim.var95,
    var95_1y: amount > 0 ? Math.max(0, 1 - sim.p5[at12] / amount) : 0,
    p5_return: amount > 0 ? sim.p5[end] / amount - 1 : 0,
    p95_return: amount > 0 ? sim.p95[end] / amount - 1 : 0,
    cagr_median: amount > 0 && sim.p50[end] > 0 ? Math.pow(sim.p50[end] / amount, 1 / Math.max(years, 1 / 12)) - 1 : 0,
    max_drawdown_median: sim.max_drawdown_median,
    max_drawdown_p95: sim.max_drawdown_p95,
  };
}

// ---------------------------------------------------------------------------
// Tam analiz
// ---------------------------------------------------------------------------

export interface AnalyzeInput {
  base: BaseCurrency;
  years: number;
  amount: number;
  /** Ham pozisyonlar (araç modunda her araç ayrı; aynı hücreye düşenler hesapta birleştirilir) */
  exposures: Exposure[];
}

export interface AggregatedExposure {
  key: string;
  label: string;
  asset_class: string;
  region: string;
  weight: number;
  expected_return: number;
  volatility: number;
  risk_contribution: number;
  fallback: boolean;
  instruments: { id: string; symbol: string; name: string; weight: number }[];
}

export interface Analysis {
  base_currency: BaseCurrency;
  horizon_years: number;
  amount: number;
  exposures: AggregatedExposure[];
  metrics: { expected_return: number; volatility: number; sharpe: number; risk_free: number };
  simulation: LabSimulation;
  diversification: {
    effective_bets: number;
    effective_holdings: number;
    cells: number;
    regions: Share[];
    currencies: Share[];
    asset_classes: Share[];
    region_hhi: number;
    currency_hhi: number;
    foreign_currency_share: number;
    home_bias: { tr_share: number; reference_share: number; ratio: number | null };
  };
  stress: StressResult[];
  assumptions: { psd_adjusted: boolean; fx: { expected_return: number; volatility: number } | null };
}

/** Aynı hücreye düşen pozisyonları birleştirir (sıra: ilk görülme). */
export function aggregateExposures(exposures: Exposure[]): { key: string; weight: number; first: Exposure; members: Exposure[] }[] {
  const map = new Map<string, { key: string; weight: number; first: Exposure; members: Exposure[] }>();
  for (const e of exposures) {
    const hit = map.get(e.key);
    if (hit) {
      hit.weight += e.weight;
      hit.members.push(e);
    } else map.set(e.key, { key: e.key, weight: e.weight, first: e, members: [e] });
  }
  return [...map.values()];
}

export function analyzeScenario(market: Market, stress: StressInput[], input: AnalyzeInput, opts: { paths: number; seed: number }): Analysis {
  const groups = aggregateExposures(input.exposures.filter((e) => e.weight > 0));
  const keys = groups.map((g) => g.key);
  const w = groups.map((g) => g.weight);
  const params = scenarioParams(market, keys, input.base);
  const rf = riskFreeRate(market, input.base);
  const point = evaluate(w, params.expected, params.cov, rf);
  const rc = riskContributions(w, params.cov);

  const regions = concentration(input.exposures.map((e) => ({ name: e.region, weight: e.weight })));
  const currencies = concentration(input.exposures.map((e) => ({ name: e.currency, weight: e.weight })));
  const classes = concentration(input.exposures.map((e) => ({ name: e.asset_class, weight: e.weight })));
  const tr = regions.shares.find((s) => s.name === 'Türkiye')?.share ?? 0;
  const ref = TR_GLOBAL_MARKET_SHARE_PCT / 100;
  const foreign = currencies.shares.filter((s) => s.name !== input.base).reduce((a, s) => a + s.share, 0);

  return {
    base_currency: input.base,
    horizon_years: input.years,
    amount: input.amount,
    exposures: groups.map((g, i) => ({
      key: g.key,
      label: market.byKey.get(g.key)?.label ?? g.key,
      asset_class: market.byKey.get(g.key)?.asset_class ?? g.first.asset_class,
      region: market.byKey.get(g.key)?.region ?? g.first.region,
      weight: g.weight,
      expected_return: params.expected[i],
      volatility: params.volatility[i],
      risk_contribution: rc[i],
      fallback: g.members.some((m) => m.fallback),
      instruments: g.members
        .filter((m) => m.instrument)
        .map((m) => ({ id: m.instrument!.id, symbol: m.instrument!.symbol, name: m.instrument!.name, weight: m.weight })),
    })),
    metrics: { expected_return: point.expected_return, volatility: point.volatility, sharpe: point.sharpe, risk_free: rf },
    simulation: monteCarlo(w, params, input.years, input.amount, opts),
    diversification: {
      effective_bets: effectiveNumberOfBets(w, params.cov),
      effective_holdings: effectiveHoldings(w),
      cells: keys.length,
      regions: regions.shares,
      currencies: currencies.shares,
      asset_classes: classes.shares,
      region_hhi: regions.hhi,
      currency_hhi: currencies.hhi,
      foreign_currency_share: foreign,
      home_bias: { tr_share: tr, reference_share: ref, ratio: tr > 0 ? tr / ref : null },
    },
    stress: stress.map((s) => stressTest(groups.map((g) => ({ key: g.key, weight: g.weight, asset_class: g.first.asset_class })), s, input.base)),
    assumptions: {
      psd_adjusted: market.psd_adjusted,
      fx: market.fx ? { expected_return: market.fx.expected_return_pct / 100, volatility: market.fx.volatility_pct / 100 } : null,
    },
  };
}
