import pool from '../../config/database';
import { toNumber } from '../../types';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { PricingService } from '../pricing';
import { COMMISSION_RATE, normalizeQuantity, TransactionService } from '../transaction';
import { quadForm, round } from './math';
import { simulate, SimulationResult, DEFAULT_MC_SEED } from './montecarlo';
import { optimize, OptimizeResult, DEFAULT_SEED } from './optimizer';
import {
  Answers,
  isProfileId,
  MAX_SCORE,
  PROFILES,
  ProfileId,
  profileView,
  ProfileView,
  QUESTIONNAIRE_VERSION,
  scoreAnswers,
} from './questionnaire';
import { DataQuality, getMarketContext, MarketStats } from './stats';
import { ASSET_CLASSES, AssetClass, classifyHolding, CLASS_LABELS, Instrument } from './universe';

/**
 * Portföy danışmanı servisi: risk profili kaydı, plan üretimi (MPT + Monte Carlo), plan uygulama.
 * Tüm hesaplamalar deterministiktir; LLM çağrısı yoktur.
 */

export const DISCLAIMER =
  'Bu bir simülasyondur; yatırım tavsiyesi değildir. Sonuçlar geçmiş fiyatlara ve varsayımlara dayanır, gelecekteki getirileri garanti etmez.';

export const DEFAULT_HORIZON_MONTHS = 12;
export const MIN_HORIZON_MONTHS = 6;
export const MAX_HORIZON_MONTHS = 60;
export const MIN_PLAN_AMOUNT = 1_000;
export const MAX_PLAN_AMOUNT = 10_000_000;
export const MIN_APPLY_AMOUNT = 100;
export const OPTIMIZER_SAMPLES = 20_000;
export const SIMULATION_PATHS = 5_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Türler
// ---------------------------------------------------------------------------

export interface PlanAllocationItem {
  class: AssetClass;
  label: string;
  weight: number;
  expected_return: number;
  volatility: number;
  instruments: Instrument[];
}

export interface PlanMetrics {
  expected_return: number;
  volatility: number;
  sharpe: number;
  var95: number;
  prob_loss: number;
  max_drawdown_median: number;
  max_drawdown_p95: number;
  /** Medyan senaryoda vade sonu getirisi */
  median_return: number;
  /** Seçilen dağılımın oynaklığı profil bandında mı */
  in_band: boolean;
}

export interface PlanSimulation {
  months: number[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  paths: number;
}

export interface PlanAssumptions {
  cash_return: number;
  observations: number;
  as_of: string | null;
  sources: Record<AssetClass, string>;
  method: string;
}

export interface CurrentAllocation {
  total_value: number;
  allocation_by_class: { class: AssetClass | 'other'; weight: number }[];
  drift: { class: AssetClass | 'other'; target: number; current: number; diff: number }[];
}

export interface ApplyResult {
  executed: { symbol: string; asset_type: string; quantity: number; price: number; amount: number }[];
  skipped: { symbol: string; reason: string }[];
  spent: number;
  remaining_cash: number;
  amount_try: number;
  mode: 'buy_only';
}

export interface Plan {
  id: string;
  profile: ProfileView;
  risk_profile_id: string | null;
  horizon_months: number;
  amount_try: number;
  data_quality: DataQuality;
  allocation: PlanAllocationItem[];
  metrics: PlanMetrics;
  simulation: PlanSimulation;
  frontier: { volatility: number; expected_return: number }[];
  explanation: string[];
  assumptions: PlanAssumptions;
  current: CurrentAllocation;
  disclaimer: string;
  created_at: string;
  applied_at: string | null;
  apply_result: ApplyResult | null;
}

export interface PlanSummary {
  id: string;
  profile: ProfileView;
  horizon_months: number;
  amount_try: number;
  data_quality: DataQuality;
  created_at: string;
  applied_at: string | null;
  metrics: PlanMetrics;
}

export interface RiskProfileResult {
  id: string;
  score: number;
  max_score: number;
  profile: ProfileView;
  answers: Answers;
  cap_reasons: string[];
  questionnaire_version: number;
  created_at: string;
}

export interface CreatePlanInput {
  profile_id?: string;
  profile_override?: ProfileId;
  horizon_months?: number;
  amount_try?: number;
}

// ---------------------------------------------------------------------------
// Açıklama metinleri (şablon)
// ---------------------------------------------------------------------------

const pct = (x: number, digits = 1) =>
  `%${(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
const tl = (x: number) => `${Math.round(x).toLocaleString('tr-TR')} TL`;

const RISK_NOTES: Record<AssetClass, string> = {
  cash_try: 'TL nakdin getirisi enflasyonun ve kurun gerisinde kalabilir.',
  usd: 'dolar, TL faizlerinden daha az değer kazanırsa nakde göre geride kalabilir.',
  eur: 'euro, TL faizlerinden daha az değer kazanırsa nakde göre geride kalabilir.',
  gold: 'altın fiyatı küresel faizlere ve dolar hareketlerine duyarlıdır.',
  us_stocks: 'hisse fiyatları ve dolar/TL kuru birlikte dalgalanarak kısa sürede belirgin kayıplara yol açabilir.',
  crypto: 'kripto varlıklar kısa sürede %50’yi aşan düşüşler yaşayabilir.',
};

export function buildExplanation(args: {
  profile: ProfileId;
  weights: number[];
  opt: OptimizeResult;
  stats: MarketStats;
  sim: SimulationResult;
  horizon: number;
  amount: number;
}): string[] {
  const { profile, weights, opt, stats, sim, horizon, amount } = args;
  const def = PROFILES[profile];
  const parts = ASSET_CLASSES.map((c, i) => ({ c, w: weights[i] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w);
  const listed = parts.slice(0, 4).map((x) => `${pct(x.w, 0)} ${CLASS_LABELS[x.c]}`);
  const mix = parts.length > 4 ? `${listed.join(', ')} ve diğerleri` : listed.join(', ');

  const out: string[] = [];
  out.push(`${def.label} profiline göre önerilen dağılım: ${mix}.`);

  const band = `${pct(def.vol_band[0], 0)}–${pct(def.vol_band[1], 0)}`;
  out.push(
    opt.in_band
      ? `Bu karışım, profilinin hedef oynaklık aralığı (${band}) içinde birim risk başına beklenen getirisi (Sharpe oranı) en yüksek dağılım olarak seçildi; beklenen yıllık getiri yaklaşık ${pct(opt.expected_return)}, yıllık oynaklık ${pct(opt.volatility)}.`
      : `Profilinin kısıtlarıyla hedef oynaklık aralığına (${band}) tam girilemediği için banda en yakın dağılım seçildi; beklenen yıllık getiri yaklaşık ${pct(opt.expected_return)}, yıllık oynaklık ${pct(opt.volatility)}.`
  );

  // Risk katkısı: w_i (Σw)_i / w'Σw
  const variance = quadForm(stats.cov, weights);
  if (variance > 1e-12) {
    const contrib = ASSET_CLASSES.map((c, i) => {
      let s = 0;
      for (let j = 0; j < weights.length; j++) s += stats.cov[i][j] * weights[j];
      return { c, rc: (weights[i] * s) / variance };
    }).sort((a, b) => b.rc - a.rc)[0];
    out.push(
      `En büyük risk kaynağı ${CLASS_LABELS[contrib.c]} (portföy riskine katkısı yaklaşık ${pct(contrib.rc, 0)}): ${RISK_NOTES[contrib.c]}`
    );
  } else {
    out.push('Portföy neredeyse tamamen TL nakitten oluştuğu için fiyat dalgalanması riski çok düşük; ana risk, getirinin enflasyonun gerisinde kalmasıdır.');
  }

  out.push(
    `Simülasyonda ${horizon} ay içinde zirveden en büyük düşüş senaryoların yarısında en fazla ${pct(sim.max_drawdown_median)}, en kötü %5’lik senaryolarda ise ${pct(sim.max_drawdown_p95)} veya daha fazla oldu; yani ${tl(amount)}’lik bir portföy geçici olarak ${tl(amount * (1 - sim.max_drawdown_p95))} seviyesine kadar gerileyebilir.`
  );

  let last = `${horizon} ay sonunda zararda olma olasılığı ${pct(sim.prob_loss)}; medyan senaryoda portföy değeri ${tl(sim.p50[sim.p50.length - 1])}.`;
  if (stats.data_quality === 'prior') {
    last += ' Yeterli fiyat geçmişi bulunmadığından varsayılan piyasa parametreleri kullanıldı.';
  } else if (stats.data_quality === 'mixed') {
    last += ' Fiyat geçmişi kısa veya eksik olduğundan tarihsel veriler varsayılan parametrelerle harmanlandı.';
  }
  out.push(last);
  return out;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const iso = (d: unknown): string => (d instanceof Date ? d.toISOString() : String(d));
const isoOrNull = (d: unknown): string | null => (d === null || d === undefined ? null : iso(d));

function profileResultFromRow(row: any): RiskProfileResult {
  const answers = (row.answers ?? {}) as Answers;
  let capReasons: string[] = [];
  try {
    capReasons = scoreAnswers(answers).cap_reasons;
  } catch {
    // Eski anket sürümüne ait yanıtlar
  }
  const profile: ProfileId = isProfileId(row.profile) ? row.profile : 'dengeli';
  return {
    id: row.id,
    score: Number(row.score),
    max_score: MAX_SCORE,
    profile: profileView(profile),
    answers,
    cap_reasons: capReasons,
    questionnaire_version: Number(row.questionnaire_version ?? QUESTIONNAIRE_VERSION),
    created_at: iso(row.created_at),
  };
}

async function currentAllocation(userId: string, targets: Map<AssetClass, number>): Promise<CurrentAllocation> {
  const [items, user] = await Promise.all([
    pool.query(
      `SELECT asset_type, UPPER(symbol) AS symbol, SUM(quantity * current_price) AS value
         FROM portfolio_items WHERE user_id = $1 GROUP BY asset_type, UPPER(symbol)`,
      [userId]
    ),
    pool.query('SELECT balance, reserved_cash FROM users WHERE id = $1', [userId]),
  ]);
  const values = new Map<AssetClass | 'other', number>();
  const add = (c: AssetClass | 'other', v: number) => values.set(c, (values.get(c) ?? 0) + v);
  const u = user.rows[0];
  add('cash_try', toNumber(u?.balance) + toNumber(u?.reserved_cash));
  for (const r of items.rows) {
    const v = toNumber(r.value);
    if (v > 0) add(classifyHolding(r.asset_type, r.symbol), v);
  }
  const total = [...values.values()].reduce((s, x) => s + x, 0);
  const share = (c: AssetClass | 'other') => (total > 0 ? round((values.get(c) ?? 0) / total, 4) : 0);
  const classes: (AssetClass | 'other')[] = [...ASSET_CLASSES, ...((values.get('other') ?? 0) > 0 ? (['other'] as const) : [])];
  return {
    total_value: round2(total),
    allocation_by_class: classes.map((c) => ({ class: c, weight: share(c) })),
    drift: classes.map((c) => {
      const target = c === 'other' ? 0 : targets.get(c) ?? 0;
      const current = share(c);
      return { class: c, target, current, diff: round(current - target, 4) };
    }),
  };
}

async function planFromRow(row: any): Promise<Plan> {
  const allocation = row.allocation as PlanAllocationItem[];
  const sim = row.simulation ?? {};
  const profile: ProfileId = isProfileId(row.profile) ? row.profile : 'dengeli';
  const targets = new Map<AssetClass, number>(allocation.map((a) => [a.class, a.weight]));
  return {
    id: row.id,
    profile: profileView(profile),
    risk_profile_id: row.risk_profile_id ?? null,
    horizon_months: Number(row.horizon_months),
    amount_try: toNumber(row.amount_try),
    data_quality: row.data_quality,
    allocation,
    metrics: row.metrics as PlanMetrics,
    simulation: {
      months: sim.months ?? [],
      p5: sim.p5 ?? [],
      p25: sim.p25 ?? [],
      p50: sim.p50 ?? [],
      p75: sim.p75 ?? [],
      p95: sim.p95 ?? [],
      paths: sim.paths ?? SIMULATION_PATHS,
    },
    frontier: sim.frontier ?? [],
    explanation: sim.explanation ?? [],
    assumptions: sim.assumptions ?? null,
    current: await currentAllocation(row.user_id, targets),
    disclaimer: DISCLAIMER,
    created_at: iso(row.created_at),
    applied_at: isoOrNull(row.applied_at),
    apply_result: row.apply_result ?? null,
  };
}

function summaryFromRow(row: any): PlanSummary {
  const profile: ProfileId = isProfileId(row.profile) ? row.profile : 'dengeli';
  return {
    id: row.id,
    profile: profileView(profile),
    horizon_months: Number(row.horizon_months),
    amount_try: toNumber(row.amount_try),
    data_quality: row.data_quality,
    created_at: iso(row.created_at),
    applied_at: isoOrNull(row.applied_at),
    metrics: row.metrics as PlanMetrics,
  };
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export class AdvisorService {
  static async submitProfile(userId: string, answers: Answers): Promise<RiskProfileResult> {
    const result = scoreAnswers(answers);
    // Yalnızca bilinen soruların yanıtları saklanır (scoreAnswers bilinmeyenleri zaten reddeder)
    const r = await pool.query(
      `INSERT INTO risk_profiles (user_id, answers, score, profile, questionnaire_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, JSON.stringify(answers), result.score, result.profile, QUESTIONNAIRE_VERSION]
    );
    return profileResultFromRow(r.rows[0]);
  }

  static async getLatestProfile(userId: string): Promise<RiskProfileResult | null> {
    const r = await pool.query(
      `SELECT * FROM risk_profiles WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [userId]
    );
    return r.rows[0] ? profileResultFromRow(r.rows[0]) : null;
  }

  static async createPlan(userId: string, input: CreatePlanInput): Promise<Plan> {
    // 1) Profil
    let riskProfile: { id: string; profile: ProfileId } | null = null;
    if (input.profile_id) {
      const r = await pool.query('SELECT id, profile FROM risk_profiles WHERE id = $1 AND user_id = $2', [input.profile_id, userId]);
      if (!r.rows[0]) throw new AppError(404, 'Risk profili bulunamadı', 'PROFILE_NOT_FOUND');
      riskProfile = r.rows[0];
    } else {
      const r = await pool.query(
        'SELECT id, profile FROM risk_profiles WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [userId]
      );
      riskProfile = r.rows[0] ?? null;
    }
    const profileId: ProfileId | null = input.profile_override ?? (riskProfile && isProfileId(riskProfile.profile) ? riskProfile.profile : null);
    if (!profileId) {
      throw new AppError(400, 'Önce risk profili anketini doldurmalı veya bir profil seçmelisin', 'PROFILE_REQUIRED');
    }

    // 2) Tutar (varsayılan: toplam varlık) ve vade
    const horizon = input.horizon_months ?? DEFAULT_HORIZON_MONTHS;
    let amount = input.amount_try;
    if (amount === undefined) {
      const u = await pool.query('SELECT balance, reserved_cash, portfolio_value FROM users WHERE id = $1', [userId]);
      const row = u.rows[0];
      const equity = toNumber(row?.balance) + toNumber(row?.reserved_cash) + toNumber(row?.portfolio_value);
      amount = Math.min(MAX_PLAN_AMOUNT, Math.max(MIN_PLAN_AMOUNT, equity));
    }
    amount = round2(amount);

    // 3) Optimizasyon + simülasyon
    const { universe, stats } = await getMarketContext();
    const def = PROFILES[profileId];
    const opt = optimize({
      expected: stats.expected_return,
      cov: stats.cov,
      riskFree: stats.cash_return,
      min: ASSET_CLASSES.map((c) => def.constraints[c].min),
      max: ASSET_CLASSES.map((c) => def.constraints[c].max),
      volBand: def.vol_band,
      samples: OPTIMIZER_SAMPLES,
      seed: DEFAULT_SEED,
    });
    const sim = simulate({
      weights: opt.weights,
      mu: stats.mu,
      cov: stats.cov,
      months: horizon,
      initial: amount,
      paths: SIMULATION_PATHS,
      seed: DEFAULT_MC_SEED,
    });

    const specByClass = new Map(universe.classes.map((c) => [c.class, c]));
    const allocation: PlanAllocationItem[] = ASSET_CLASSES.map((c, i) => ({
      class: c,
      label: CLASS_LABELS[c],
      weight: opt.percents[i] / 100,
      expected_return: round(stats.expected_return[i], 4),
      volatility: round(stats.volatility[i], 4),
      instruments: (specByClass.get(c)?.instruments ?? []).map((x) => ({ ...x, weight: round(x.weight, 4) })),
    }));
    const metrics: PlanMetrics = {
      expected_return: round(opt.expected_return, 4),
      volatility: round(opt.volatility, 4),
      sharpe: round(opt.sharpe, 3),
      var95: round(sim.var95, 4),
      prob_loss: round(sim.prob_loss, 4),
      max_drawdown_median: round(sim.max_drawdown_median, 4),
      max_drawdown_p95: round(sim.max_drawdown_p95, 4),
      median_return: round(sim.median_return, 4),
      in_band: opt.in_band,
    };
    const explanation = buildExplanation({ profile: profileId, weights: opt.weights, opt, stats, sim, horizon, amount });
    const simulation = {
      months: sim.months,
      p5: sim.p5.map(round2),
      p25: sim.p25.map(round2),
      p50: sim.p50.map(round2),
      p75: sim.p75.map(round2),
      p95: sim.p95.map(round2),
      paths: sim.paths,
      frontier: opt.frontier.map((p) => ({ volatility: round(p.volatility, 4), expected_return: round(p.expected_return, 4) })),
      explanation,
      assumptions: {
        cash_return: stats.cash_return,
        observations: stats.observations,
        as_of: stats.as_of,
        sources: stats.sources,
        method: 'mpt-max-sharpe-in-band+mc-gbm-monthly-rebalanced',
      } satisfies PlanAssumptions,
    };

    const r = await pool.query(
      `INSERT INTO portfolio_plans
         (user_id, risk_profile_id, profile, horizon_months, amount_try, allocation, metrics, simulation, data_quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        riskProfile?.id ?? null,
        profileId,
        horizon,
        amount,
        JSON.stringify(allocation),
        JSON.stringify(metrics),
        JSON.stringify(simulation),
        stats.data_quality,
      ]
    );
    return planFromRow(r.rows[0]);
  }

  static async listPlans(userId: string, limit: number): Promise<{ items: PlanSummary[] }> {
    const r = await pool.query(
      `SELECT id, profile, horizon_months, amount_try, data_quality, created_at, applied_at, metrics
         FROM portfolio_plans WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [userId, limit]
    );
    return { items: r.rows.map(summaryFromRow) };
  }

  static async getPlan(userId: string, planId: string): Promise<Plan> {
    const r = await pool.query('SELECT * FROM portfolio_plans WHERE id = $1 AND user_id = $2', [planId, userId]);
    if (!r.rows[0]) throw new AppError(404, 'Plan bulunamadı', 'PLAN_NOT_FOUND');
    return planFromRow(r.rows[0]);
  }

  /**
   * Planı uygular: nakit dışındaki her enstrümana (tutar × sınıf ağırlığı × sınıf içi ağırlık) kadar
   * ALIŞ yapar (TransactionService.buy, sunucu fiyatı). Asla satış yapmaz; TL nakit payı nakit kalır.
   * Her alış kendi transaction'ıdır; fiyatı olmayan / reddedilen enstrümanlar `skipped` ile raporlanır.
   * Plan bir kez uygulanabilir (hiçbir alış gerçekleşmezse tekrar denenebilir).
   */
  static async applyPlan(userId: string, planId: string, input: { amount_try: number; mode: 'buy_only' }): Promise<ApplyResult> {
    const r = await pool.query('SELECT * FROM portfolio_plans WHERE id = $1 AND user_id = $2', [planId, userId]);
    const row = r.rows[0];
    if (!row) throw new AppError(404, 'Plan bulunamadı', 'PLAN_NOT_FOUND');
    if (row.applied_at) throw new AppError(409, 'Bu plan zaten uygulandı', 'PLAN_ALREADY_APPLIED');

    const amount = round2(input.amount_try);
    const u = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
    const balance = toNumber(u.rows[0]?.balance);
    if (amount > balance + 1e-9) {
      throw new AppError(400, `Yetersiz bakiye: en fazla ${balance.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL uygulayabilirsin`, 'INSUFFICIENT_BALANCE');
    }

    // Aynı planın eşzamanlı iki kez uygulanmasını engelle
    const claim = await pool.query(
      'UPDATE portfolio_plans SET applied_at = now() WHERE id = $1 AND user_id = $2 AND applied_at IS NULL RETURNING id',
      [planId, userId]
    );
    if (claim.rowCount === 0) throw new AppError(409, 'Bu plan zaten uygulandı', 'PLAN_ALREADY_APPLIED');

    const result: ApplyResult = { executed: [], skipped: [], spent: 0, remaining_cash: balance, amount_try: amount, mode: input.mode };
    try {
      const allocation = row.allocation as PlanAllocationItem[];
      for (const cls of allocation) {
        if (cls.class === 'cash_try' || !(cls.weight > 0)) continue;
        for (const inst of cls.instruments) {
          const target = amount * cls.weight * inst.weight;
          if (target < 1) {
            result.skipped.push({ symbol: inst.symbol, reason: 'Tutar çok küçük' });
            continue;
          }
          try {
            const quote = await PricingService.getExecutionPriceTRY(inst.symbol, inst.asset_type);
            // Komisyon ve kuruş yuvarlaması dahil maliyet hedef tutarı aşmasın
            const quantity = normalizeQuantity(Math.max(0, target - 0.02) / (quote.priceTRY * (1 + COMMISSION_RATE)));
            if (!(quantity > 0)) {
              result.skipped.push({ symbol: inst.symbol, reason: 'Tutar çok küçük' });
              continue;
            }
            const trade = await TransactionService.buy(userId, { symbol: inst.symbol, asset_type: inst.asset_type, quantity }, { quote });
            result.executed.push({
              symbol: trade.transaction.symbol,
              asset_type: trade.transaction.asset_type,
              quantity: trade.transaction.quantity,
              price: trade.transaction.price,
              amount: trade.transaction.net_amount,
            });
          } catch (err: any) {
            if (err instanceof AppError) {
              result.skipped.push({ symbol: inst.symbol, reason: err.publicMessage });
            } else {
              logger.error({ err, planId, symbol: inst.symbol }, '[advisor] Plan alışı başarısız');
              result.skipped.push({ symbol: inst.symbol, reason: 'İşlem gerçekleştirilemedi' });
            }
          }
        }
      }
    } finally {
      result.spent = round2(result.executed.reduce((s, x) => s + x.amount, 0));
      const after = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
      result.remaining_cash = toNumber(after.rows[0]?.balance);
      // Hiç alış olmadıysa plan "uygulanmadı" kalır (tekrar denenebilir); sonuç yine saklanır
      await pool.query(
        `UPDATE portfolio_plans
            SET apply_result = $3, applied_at = CASE WHEN $4::boolean THEN applied_at ELSE NULL END
          WHERE id = $1 AND user_id = $2`,
        [planId, userId, JSON.stringify(result), result.executed.length > 0]
      );
    }
    return result;
  }
}
