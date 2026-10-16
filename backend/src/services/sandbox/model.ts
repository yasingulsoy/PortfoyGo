import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { AdvisorService } from '../advisor/service';
import { COMMISSION_RATE } from '../transaction';
import { RebalancePlan, SandboxAssetType, assetKey, planRebalance, round2 } from './math';
import { SandboxPrices } from './prices';
import {
  BACKTEST_DAYS,
  Metrics,
  Sandbox,
  SandboxPortfolio,
  SetWeightsInput,
  SetWeightsResult,
  TradeInput,
  TradeResult,
  Valuation,
} from './service';

/**
 * Model Portföy — "100.000 USD Model Portföy" (/api/model-portfolios). Sanal portföy motorunun (Sandbox) üstünde
 * kullanıcıya özel katman: sahiplik kontrolü, kullanıcı başına en fazla 5 portföy, sabit 100.000 USD başlangıç
 * (karşılaştırılabilirlik için) ve ana uygulamadaki komisyon (%0,25 → 25 bps).
 */

export const MODEL_LIMIT = 5;
export const MODEL_STARTING_CASH = 100_000;
export const MODEL_COMMISSION_BPS = Math.round(COMMISSION_RATE * 10_000);
export const COMPARE_MAX = 3;

export interface ModelListItem extends SandboxPortfolio {
  equity_usd: number;
  return_pct: number;
  holdings_count: number;
  stale: boolean;
}

export interface CompareItem {
  portfolio: SandboxPortfolio;
  valuation: Pick<Valuation, 'equity_usd' | 'cash_usd' | 'cash_weight' | 'return_pct' | 'by_class' | 'stale' | 'commission_paid_usd'> & {
    holdings: { asset_type: SandboxAssetType; symbol: string; name: string; asset_class: string; weight: number }[];
  };
  metrics: Metrics;
  history: { t: number; v: number }[];
  backtest: { lookback_days: number; points: { t: number; v: number }[]; missing: string[] };
}

export interface AdvisorTemplate {
  plan_id: string;
  profile_label: string | null;
  created_at: string;
  weights: { asset_type: SandboxAssetType; symbol: string; name: string; weight: number; from_class: string }[];
  cash_weight: number;
  /** Nakde aktarılan kısımlar (ör. TL nakit, USD, fiyatı olmayan enstrüman) */
  moved_to_cash: { label: string; weight: number; reason: string }[];
}

const notFound = () => new AppError(404, 'Model portföy bulunamadı', 'SANDBOX_NOT_FOUND');

export class ModelPortfolios {
  /** Sahiplik kontrolü: başkasının / lig portföyü → 404 (varlığı sızdırılmaz) */
  static async owned(userId: string, portfolioId: string): Promise<SandboxPortfolio> {
    let p: SandboxPortfolio;
    try {
      p = await Sandbox.get(portfolioId);
    } catch {
      throw notFound();
    }
    if (p.user_id !== userId || p.kind !== 'model') throw notFound();
    return p;
  }

  static async list(userId: string): Promise<{ items: ModelListItem[]; limit: number; starting_cash: number; commission_bps: number }> {
    const rows = await Sandbox.listByUser(userId, 'model');
    const ids = rows.map((r) => r.id);
    const [eq, counts] = await Promise.all([
      Sandbox.equities(ids),
      ids.length
        ? pool.query('SELECT portfolio_id, COUNT(*)::int AS n FROM sandbox_holdings WHERE portfolio_id = ANY($1::uuid[]) GROUP BY portfolio_id', [ids])
        : Promise.resolve({ rows: [] as any[] }),
    ]);
    const countOf = new Map<string, number>(counts.rows.map((r: any) => [r.portfolio_id, Number(r.n)]));
    return {
      items: rows.map((p) => {
        const e = eq.get(p.id);
        return {
          ...p,
          equity_usd: e?.equity_usd ?? p.cash,
          return_pct: e?.return_pct ?? 0,
          holdings_count: countOf.get(p.id) ?? 0,
          stale: e?.stale ?? false,
        };
      }),
      limit: MODEL_LIMIT,
      starting_cash: MODEL_STARTING_CASH,
      commission_bps: MODEL_COMMISSION_BPS,
    };
  }

  /**
   * Yeni model portföy (100.000 USD). weights verilirse aynı transaction'da ilk dağılım yapılır (reason 'initial');
   * fiyat yoksa / ağırlıklar geçersizse hiçbir şey oluşmaz. Kullanıcı başına en fazla 5 (409 MODEL_LIMIT).
   */
  static async create(userId: string, input: { name: string; weights?: SetWeightsInput | null }): Promise<{ portfolio: SandboxPortfolio; rebalance: SetWeightsResult | null }> {
    if (input.weights) Sandbox.normalizeWeights(input.weights); // erken 400
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Aynı kullanıcının eşzamanlı oluşturmaları sıralanır (sınır aşılmasın)
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const c = await client.query(`SELECT COUNT(*)::int AS n FROM sandbox_portfolios WHERE user_id = $1 AND kind = 'model'`, [userId]);
      if (Number(c.rows[0]?.n ?? 0) >= MODEL_LIMIT) {
        throw new AppError(409, `En fazla ${MODEL_LIMIT} model portföy oluşturabilirsin. Yeni bir tane için birini sil.`, 'MODEL_LIMIT', {
          limit: MODEL_LIMIT,
        });
      }
      const portfolio = await Sandbox.create(
        { kind: 'model', name: input.name, userId, startingCash: MODEL_STARTING_CASH, commissionBps: MODEL_COMMISSION_BPS },
        client
      );
      let rebalance: SetWeightsResult | null = null;
      if (input.weights) {
        rebalance = await Sandbox.setTargetWeights(portfolio.id, userId, input.weights, { reason: 'initial' }, client);
      }
      await client.query('COMMIT');
      return { portfolio: rebalance ? { ...portfolio, cash: rebalance.cash_usd, target_weights: rebalance.target_weights } : portfolio, rebalance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Yeni (100.000 USD, tamamı nakit) bir portföy için dağılım önizlemesi: işlemler + tahmini komisyon */
  static async previewNew(input: SetWeightsInput): Promise<RebalancePlan> {
    const targets = Sandbox.normalizeWeights(input);
    const quotes = await SandboxPrices.requireTradeQuotes(targets.weights);
    const planQuotes = new Map([...quotes].map(([k, q]) => [k, { price: q.price_usd, sell_price: q.sell_price_usd, name: q.name }]));
    return planRebalance({ cash: MODEL_STARTING_CASH, holdings: [], quotes: planQuotes, targets, bps: MODEL_COMMISSION_BPS });
  }

  static async detail(userId: string, id: string): Promise<{ portfolio: SandboxPortfolio; valuation: Valuation }> {
    const portfolio = await ModelPortfolios.owned(userId, id);
    return { portfolio, valuation: await Sandbox.valuation(id) };
  }

  static async rename(userId: string, id: string, name: string): Promise<SandboxPortfolio> {
    await ModelPortfolios.owned(userId, id);
    return Sandbox.rename(id, name);
  }

  static async remove(userId: string, id: string): Promise<void> {
    await ModelPortfolios.owned(userId, id);
    await Sandbox.remove(id);
  }

  static async setWeights(userId: string, id: string, input: SetWeightsInput, dryRun: boolean): Promise<SetWeightsResult> {
    await ModelPortfolios.owned(userId, id);
    return Sandbox.setTargetWeights(id, userId, input, { reason: 'rebalance', dryRun });
  }

  static async trade(userId: string, id: string, input: TradeInput): Promise<TradeResult> {
    await ModelPortfolios.owned(userId, id);
    return Sandbox.trade(id, userId, { ...input, reason: 'manual' });
  }

  /** En fazla 3 portföyü yan yana: özet, metrikler, gerçekleşen geçmiş ve güncel dağılımın 90 günlük simülasyonu */
  static async compare(userId: string, ids: string[]): Promise<{ items: CompareItem[] }> {
    const unique = [...new Set(ids)];
    if (unique.length < 1 || unique.length > COMPARE_MAX) {
      throw new AppError(400, `Karşılaştırma için 1–${COMPARE_MAX} portföy seçin`, 'VALIDATION_ERROR');
    }
    const items: CompareItem[] = [];
    for (const id of unique) {
      const portfolio = await ModelPortfolios.owned(userId, id);
      const [valuation, metrics, history, backtest] = await Promise.all([
        Sandbox.valuation(id),
        Sandbox.metrics(id),
        Sandbox.history(id, 'ALL'),
        Sandbox.backtest(id, BACKTEST_DAYS),
      ]);
      items.push({
        portfolio,
        valuation: {
          equity_usd: valuation.equity_usd,
          cash_usd: valuation.cash_usd,
          cash_weight: valuation.cash_weight,
          return_pct: valuation.return_pct,
          by_class: valuation.by_class,
          stale: valuation.stale,
          commission_paid_usd: valuation.commission_paid_usd,
          holdings: valuation.holdings.map((h) => ({
            asset_type: h.asset_type,
            symbol: h.symbol,
            name: h.name,
            asset_class: h.asset_class,
            weight: h.weight,
          })),
        },
        metrics,
        history: history.points,
        backtest,
      });
    }
    return { items };
  }

  /**
   * "Portföy Sihirbazı önerim" şablonu: kullanıcının en son Sihirbaz planının sınıf ağırlıklarını işlem görebilir
   * varlıklara eşler. TL nakit ve USD → nakit (bu portföyün nakdi USD'dir); taze fiyatı olmayan enstrümanlar → nakit.
   * Plan yoksa 404 NO_ADVISOR_PLAN.
   */
  static async advisorTemplate(userId: string): Promise<AdvisorTemplate> {
    const { items } = await AdvisorService.listPlans(userId, 1);
    if (!items[0]) throw new AppError(404, 'Henüz bir Portföy Sihirbazı önerin yok', 'NO_ADVISOR_PLAN');
    const plan = await AdvisorService.getPlan(userId, items[0].id);

    const candidates: { asset_type: SandboxAssetType; symbol: string; name: string; weight: number; from_class: string; label: string }[] = [];
    const moved: AdvisorTemplate['moved_to_cash'] = [];
    for (const a of plan.allocation) {
      if (!(a.weight > 0)) continue;
      const pct = a.weight * 100; // Sihirbaz ağırlıkları 0–1
      if (a.class === 'cash_try') {
        moved.push({ label: a.label, weight: round2(pct), reason: 'TL nakit bu USD portföyde nakit olarak tutulur' });
        continue;
      }
      if (a.class === 'usd') {
        moved.push({ label: a.label, weight: round2(pct), reason: 'USD bu portföyün nakdidir' });
        continue;
      }
      for (const ins of a.instruments) {
        candidates.push({
          asset_type: ins.asset_type as SandboxAssetType,
          symbol: ins.symbol.toUpperCase(),
          name: ins.name,
          weight: pct * ins.weight,
          from_class: a.class,
          label: a.label,
        });
      }
    }
    // Altın: planın sembolü yoksa diğer altın koduna düş
    const alt: Record<string, string> = { GAU: 'GOLD', GOLD: 'GAU' };
    const extraKeys = candidates.filter((c) => c.asset_type === 'commodity' && alt[c.symbol]).map((c) => ({ asset_type: 'commodity', symbol: alt[c.symbol] }));
    const quotes = await SandboxPrices.getUsdPrices([...candidates, ...extraKeys]);
    const weights: AdvisorTemplate['weights'] = [];
    const missingByClass = new Map<string, number>();
    for (const c of candidates) {
      let sym = c.symbol;
      let q = quotes.get(assetKey(c.asset_type, sym));
      if ((!q || !q.fresh) && c.asset_type === 'commodity' && alt[sym]) {
        const q2 = quotes.get(assetKey('commodity', alt[sym]));
        if (q2?.fresh) {
          sym = alt[sym];
          q = q2;
        }
      }
      if (!q || !q.fresh || (c.asset_type === 'currency' && (sym === 'USD' || sym === 'TRY'))) {
        missingByClass.set(c.label, (missingByClass.get(c.label) ?? 0) + c.weight);
        continue;
      }
      const existing = weights.find((w) => w.asset_type === c.asset_type && w.symbol === sym);
      if (existing) existing.weight += c.weight;
      else weights.push({ asset_type: c.asset_type, symbol: sym, name: q.name || c.name, weight: c.weight, from_class: c.from_class });
    }
    for (const [label, w] of missingByClass) moved.push({ label, weight: round2(w), reason: 'Güncel fiyatı olmayan enstrüman' });

    // 2 ondalığa yuvarla; toplam farkı nakitte kalır
    for (const w of weights) w.weight = Math.floor(w.weight * 100) / 100;
    const filtered = weights.filter((w) => w.weight >= 0.01);
    const cash = round2(100 - filtered.reduce((s, w) => s + w.weight, 0));
    return {
      plan_id: plan.id,
      profile_label: plan.profile?.label ?? null,
      created_at: plan.created_at,
      weights: filtered,
      cash_weight: Math.max(0, cash),
      moved_to_cash: moved,
    };
  }
}
