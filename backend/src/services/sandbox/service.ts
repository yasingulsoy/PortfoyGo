import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { istanbulDay } from '../game/common';
import {
  MIN_RETURNS_FOR_METRICS,
  MIN_TRADE_USD,
  PlanQuote,
  RISK_FREE_USD,
  QTY_EPSILON,
  RebalancePlan,
  SandboxAssetType,
  SeriesPoint,
  TargetWeights,
  TradeAggregate,
  ValuationResult,
  WeightInput,
  WeightsError,
  assetKey,
  buildHoldSeries,
  buyCost,
  computeValuation,
  effectiveN,
  floorQty,
  herfindahl,
  maxDrawdownPct,
  normalizeTargetWeights,
  planRebalance,
  round2,
  roundQty,
  sellProceeds,
  sharpeRatio,
  volatilityAnnPct,
} from './math';
import { SandboxPrices, UsdQuote } from './prices';

/**
 * Sanal (sandbox) portföy motoru — Model Portföy ve Portföy Ligi bunun üzerine kurulur.
 * Ayrıntılı sözleşme: ./README.md
 *
 * - Tüm tutarlar USD. Ana uygulamanın TL bakiyesine / portfolio_items tablosuna DOKUNMAZ.
 * - Yazan her işlem portföy satırını FOR UPDATE kilitler (aynı portföye eşzamanlı işlemler sıralanır).
 * - `client` verilirse çağıranın transaction'ında çalışır (BEGIN/COMMIT çağıranın sorumluluğu);
 *   verilmezse kendi transaction'ını açar.
 * - Yetki kontrolü YAPMAZ (actorUserId yalnızca işlem defterine yazılır): sahiplik / takım üyeliği çağıranın işidir.
 */

export type SandboxKind = 'model' | 'league';
export type SandboxStatus = 'active' | 'frozen' | 'archived';
export type TradeReason = 'manual' | 'rebalance' | 'initial';
export type HistoryRange = '1W' | '1M' | '3M' | 'ALL';
export const HISTORY_RANGES: readonly HistoryRange[] = ['1W', '1M', '3M', 'ALL'];

export interface StoredTargetWeights extends TargetWeights {
  set_at: string;
}

export interface SandboxPortfolio {
  id: string;
  kind: SandboxKind;
  user_id: string;
  league_id: string | null;
  team_id: string | null;
  name: string;
  base_currency: 'USD';
  starting_cash: number;
  cash: number;
  commission_bps: number;
  target_weights: StoredTargetWeights | null;
  status: SandboxStatus;
  frozen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SandboxTrade {
  id: string;
  portfolio_id: string;
  actor_user_id: string | null;
  side: 'buy' | 'sell';
  asset_type: SandboxAssetType;
  symbol: string;
  name: string | null;
  quantity: number;
  price_usd: number;
  gross_usd: number;
  commission_usd: number;
  reason: TradeReason;
  created_at: string;
}

export interface CreateInput {
  kind: SandboxKind;
  name: string;
  userId: string;
  startingCash?: number;
  commissionBps?: number;
  leagueId?: string | null;
  teamId?: string | null;
}

export interface TradeInput {
  side: 'buy' | 'sell';
  asset_type: SandboxAssetType;
  symbol: string;
  /** Brüt tutar (komisyon hariç) — alışta komisyon ayrıca nakitten düşer, satışta brütten düşer */
  amount_usd?: number;
  /** Miktar; satışta 'all' → eldeki miktarın tamamı */
  quantity?: number | 'all';
  reason?: TradeReason;
}

export interface TradeResult {
  trade: SandboxTrade;
  cash_usd: number;
  holding: { quantity: number; avg_cost_usd: number } | null;
}

export interface SetWeightsInput {
  weights: WeightInput[];
  cash_weight: number;
}

export interface SetWeightsResult {
  executed: boolean;
  plan: RebalancePlan;
  trades: SandboxTrade[];
  cash_usd: number;
  target_weights: StoredTargetWeights;
}

export interface Valuation extends ValuationResult {
  portfolio_id: string;
  as_of: string;
}

export interface EquitySummary {
  equity_usd: number;
  cash_usd: number;
  starting_cash: number;
  return_pct: number;
  stale: boolean;
}

export interface HistoryResult {
  range: HistoryRange;
  points: SeriesPoint[];
  first: number | null;
  last: number | null;
  change_pct: number | null;
}

export interface RiskBlock {
  volatility_ann: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  points: number;
}

export interface Metrics {
  /** Yıllık oynaklık (yüzde) */
  volatility_ann: number | null;
  /** En büyük düşüş, pozitif yüzde (12,3 = tepe → dip %−12,3) */
  max_drawdown_pct: number | null;
  sharpe: number | null;
  /** Yoğunlaşma (Herfindahl, nakit dahil, 0–1) */
  hhi: number;
  /** Etkin varlık sayısı = 1 / HHI */
  effective_n: number;
  /** İlk kurulum hariç işlem hacmi / 2 / başlangıç sermayesi (yüzde) */
  turnover_pct: number;
  trades_count: number;
  days: number;
  /** Üstteki risk alanlarının kaynağı: gerçekleşen (günlük kapanışlar) veya simüle (güncel pozisyonlar, geçmiş fiyatlar) */
  basis: 'realized' | 'simulated' | null;
  realized: RiskBlock | null;
  simulated: (RiskBlock & { lookback_days: number }) | null;
  commission_paid_usd: number;
  risk_free_rate: number;
}

export interface BacktestResult {
  lookback_days: number;
  points: SeriesPoint[];
  /** Fiyat geçmişi bulunamayan pozisyonlar (simülasyona dahil edilmedi) */
  missing: string[];
}

/** Saatlik anlık görüntülerin saklanma süresi */
export const HOURLY_RETENTION_DAYS = 35;
/** Simüle metriklerin geriye bakış penceresi */
export const BACKTEST_DAYS = 90;
/** Gerçekleşen metrikler için gereken en az günlük nokta */
export const MIN_REALIZED_POINTS = 20;

const DAY_MS = 86_400_000;
const MAX_STARTING_CASH = 1e9;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export function mapPortfolio(row: any): SandboxPortfolio {
  return {
    id: row.id,
    kind: row.kind,
    user_id: row.user_id,
    league_id: row.league_id ?? null,
    team_id: row.team_id ?? null,
    name: row.name,
    base_currency: 'USD',
    starting_cash: num(row.starting_cash),
    cash: num(row.cash),
    commission_bps: Number(row.commission_bps) || 0,
    target_weights: row.target_weights ?? null,
    status: row.status,
    frozen_at: row.frozen_at ? iso(row.frozen_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export function mapTrade(row: any): SandboxTrade {
  return {
    id: row.id,
    portfolio_id: row.portfolio_id,
    actor_user_id: row.actor_user_id ?? null,
    side: row.side,
    asset_type: row.asset_type,
    symbol: row.symbol,
    name: row.name ?? null,
    quantity: num(row.quantity),
    price_usd: num(row.price_usd),
    gross_usd: num(row.gross_usd),
    commission_usd: num(row.commission_usd),
    reason: row.reason,
    created_at: iso(row.created_at),
  };
}

async function withTx<T>(existing: PoolClient | undefined, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (existing) return fn(existing);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const notFound = () => new AppError(404, 'Portföy bulunamadı', 'SANDBOX_NOT_FOUND');
const frozen = () => new AppError(409, 'Bu portföy donduruldu; işlem yapılamaz', 'SANDBOX_FROZEN');

async function lockPortfolio(client: PoolClient, id: string): Promise<SandboxPortfolio> {
  const r = await client.query('SELECT * FROM sandbox_portfolios WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rows[0]) throw notFound();
  return mapPortfolio(r.rows[0]);
}

interface HoldingRow {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  quantity: number;
  avg_cost_usd: number;
}

const mapHolding = (r: any): HoldingRow => ({
  asset_type: r.asset_type,
  symbol: r.symbol,
  name: r.name || r.symbol,
  quantity: num(r.quantity),
  avg_cost_usd: num(r.avg_cost_usd),
});

async function loadHoldings(db: { query: PoolClient['query'] }, portfolioId: string, forUpdate = false): Promise<HoldingRow[]> {
  const r = await db.query(
    `SELECT asset_type, symbol, name, quantity, avg_cost_usd FROM sandbox_holdings WHERE portfolio_id = $1
      ORDER BY asset_type, symbol${forUpdate ? ' FOR UPDATE' : ''}`,
    [portfolioId]
  );
  return r.rows.map(mapHolding);
}

function toPlanQuotes(quotes: Map<string, UsdQuote>): Map<string, PlanQuote> {
  const out = new Map<string, PlanQuote>();
  for (const [k, q] of quotes) out.set(k, { price: q.price_usd, sell_price: q.sell_price_usd, name: q.name });
  return out;
}

/** Valide edilmiş tutar (kuruş) */
function validAmount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_STARTING_CASH) return null;
  return round2(n);
}

export class Sandbox {
  // -------------------------------------------------------------------------
  // Oluşturma / okuma / durum
  // -------------------------------------------------------------------------

  static async create(input: CreateInput, client?: PoolClient): Promise<SandboxPortfolio> {
    const name = String(input.name ?? '').trim();
    if (name.length < 1 || name.length > 60) throw new AppError(400, 'Portföy adı 1–60 karakter olmalı', 'VALIDATION_ERROR');
    if (input.kind !== 'model' && input.kind !== 'league') throw new AppError(400, 'Geçersiz portföy türü', 'VALIDATION_ERROR');
    const startingCash = round2(input.startingCash ?? 100_000);
    if (!(startingCash > 0) || startingCash > MAX_STARTING_CASH) throw new AppError(400, 'Geçersiz başlangıç sermayesi', 'VALIDATION_ERROR');
    const bps = input.commissionBps ?? 25;
    if (!Number.isInteger(bps) || bps < 0 || bps > 1000) throw new AppError(400, 'Geçersiz komisyon oranı', 'VALIDATION_ERROR');
    const db = client ?? pool;
    const r = await db.query(
      `INSERT INTO sandbox_portfolios (kind, user_id, league_id, team_id, name, starting_cash, cash, commission_bps)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7) RETURNING *`,
      [input.kind, input.userId, input.leagueId ?? null, input.teamId ?? null, name, startingCash, bps]
    );
    return mapPortfolio(r.rows[0]);
  }

  static async get(portfolioId: string, client?: PoolClient): Promise<SandboxPortfolio> {
    const r = await (client ?? pool).query('SELECT * FROM sandbox_portfolios WHERE id = $1', [portfolioId]);
    if (!r.rows[0]) throw notFound();
    return mapPortfolio(r.rows[0]);
  }

  /** Kullanıcının portföyleri (sahibi olduğu), oluşturma sırasıyla */
  static async listByUser(userId: string, kind: SandboxKind = 'model'): Promise<SandboxPortfolio[]> {
    const r = await pool.query('SELECT * FROM sandbox_portfolios WHERE user_id = $1 AND kind = $2 ORDER BY created_at, id', [userId, kind]);
    return r.rows.map(mapPortfolio);
  }

  static async rename(portfolioId: string, name: string, client?: PoolClient): Promise<SandboxPortfolio> {
    const n = String(name ?? '').trim();
    if (n.length < 1 || n.length > 60) throw new AppError(400, 'Portföy adı 1–60 karakter olmalı', 'VALIDATION_ERROR');
    const r = await (client ?? pool).query(
      'UPDATE sandbox_portfolios SET name = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [portfolioId, n]
    );
    if (!r.rows[0]) throw notFound();
    return mapPortfolio(r.rows[0]);
  }

  /**
   * Portföyü dondurur (lig bitişi): önce son değer anlık görüntüsü yazılır, sonra status = 'frozen'.
   * İdempotent: zaten donmuş / arşivlenmişse olduğu gibi döner.
   */
  static async freeze(portfolioId: string, client?: PoolClient): Promise<SandboxPortfolio> {
    return withTx(client, async (c) => {
      const p = await lockPortfolio(c, portfolioId);
      if (p.status !== 'active') return p;
      await Sandbox.snapshotPortfolios([p.id], new Date(), c);
      const r = await c.query(
        `UPDATE sandbox_portfolios SET status = 'frozen', frozen_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
        [portfolioId]
      );
      return mapPortfolio(r.rows[0]);
    });
  }

  static async archive(portfolioId: string, client?: PoolClient): Promise<SandboxPortfolio> {
    const r = await (client ?? pool).query(
      `UPDATE sandbox_portfolios SET status = 'archived', frozen_at = COALESCE(frozen_at, now()), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [portfolioId]
    );
    if (!r.rows[0]) throw notFound();
    return mapPortfolio(r.rows[0]);
  }

  /** Kalıcı siler (pozisyonlar, işlemler, anlık görüntüler CASCADE) */
  static async remove(portfolioId: string, client?: PoolClient): Promise<void> {
    const r = await (client ?? pool).query('DELETE FROM sandbox_portfolios WHERE id = $1', [portfolioId]);
    if (!r.rowCount) throw notFound();
  }

  // -------------------------------------------------------------------------
  // İşlem
  // -------------------------------------------------------------------------

  /**
   * Tek işlem (piyasa fiyatından). amount_usd XOR quantity. Alış: brüt + komisyon ≤ nakit (kaldıraç yok).
   * Satış: eldeki miktarla sınırlı (açığa satış yok); 'all' / eldekinin tamamına denk tutar → pozisyon kapanır.
   * Hatalar: 404 SANDBOX_NOT_FOUND, 409 SANDBOX_FROZEN, 503 PRICE_UNAVAILABLE, 400 INVALID_ASSET / INSUFFICIENT_CASH /
   * INSUFFICIENT_QUANTITY / NO_POSITION / TRADE_TOO_SMALL / VALIDATION_ERROR.
   */
  static async trade(portfolioId: string, actorUserId: string | null, input: TradeInput, client?: PoolClient): Promise<TradeResult> {
    if (input.side !== 'buy' && input.side !== 'sell') throw new AppError(400, 'İşlem yönü buy veya sell olmalı', 'VALIDATION_ERROR');
    const symbol = String(input.symbol ?? '').trim().toUpperCase();
    const hasAmount = input.amount_usd !== undefined && input.amount_usd !== null;
    const hasQty = input.quantity !== undefined && input.quantity !== null;
    if (hasAmount === hasQty) throw new AppError(400, 'Tutar (USD) veya miktardan yalnızca birini girin', 'VALIDATION_ERROR');
    if (input.quantity === 'all' && input.side !== 'sell') throw new AppError(400, '"Tümü" yalnızca satışta kullanılabilir', 'VALIDATION_ERROR');
    const amount = hasAmount ? validAmount(input.amount_usd) : null;
    if (hasAmount && amount === null) throw new AppError(400, 'Geçerli bir tutar girin', 'VALIDATION_ERROR');
    if (hasQty && input.quantity !== 'all') {
      const q = input.quantity as number;
      if (typeof q !== 'number' || !Number.isFinite(q) || q < QTY_EPSILON || q > 1e12) {
        throw new AppError(400, 'Geçerli bir miktar girin', 'VALIDATION_ERROR');
      }
    }
    const key = { asset_type: input.asset_type, symbol };
    const quotes = await SandboxPrices.requireTradeQuotes([key]);
    const quote = quotes.get(assetKey(input.asset_type, symbol))!;

    return withTx(client, async (c) => {
      const p = await lockPortfolio(c, portfolioId);
      if (p.status !== 'active') throw frozen();
      const reason = input.reason ?? 'manual';

      if (input.side === 'buy') {
        const price = quote.price_usd;
        const quantity = amount !== null ? floorQty(amount / price) : floorQty(input.quantity as number);
        if (!(quantity >= QTY_EPSILON)) throw new AppError(400, 'Miktar çok küçük', 'TRADE_TOO_SMALL');
        const cost = buyCost(quantity, price, p.commission_bps);
        if (cost.gross < MIN_TRADE_USD) throw new AppError(400, `En küçük işlem ${MIN_TRADE_USD} USD`, 'TRADE_TOO_SMALL');
        if (cost.total > p.cash + 1e-9) {
          throw new AppError(400, 'Yetersiz nakit (komisyon dahil)', 'INSUFFICIENT_CASH', {
            cash_usd: p.cash,
            required_usd: cost.total,
          });
        }
        return Sandbox.applyBuy(c, p, { asset_type: input.asset_type, symbol, name: quote.name, quantity, price }, actorUserId, reason);
      }

      const hr = await c.query(
        'SELECT quantity FROM sandbox_holdings WHERE portfolio_id = $1 AND asset_type = $2 AND symbol = $3 FOR UPDATE',
        [p.id, input.asset_type, symbol]
      );
      const held = hr.rows[0] ? num(hr.rows[0].quantity) : 0;
      if (!(held > 0)) throw new AppError(400, 'Bu varlıkta pozisyonunuz yok', 'NO_POSITION');
      const price = quote.sell_price_usd;
      let quantity: number;
      if (input.quantity === 'all') {
        quantity = held;
      } else if (amount !== null) {
        const heldValue = round2(held * price);
        if (amount >= heldValue - 0.01) {
          if (amount > heldValue + 0.01) {
            throw new AppError(400, 'Satış tutarı pozisyon değerini aşıyor', 'INSUFFICIENT_QUANTITY', { quantity: held, value_usd: heldValue });
          }
          quantity = held;
        } else {
          quantity = floorQty(amount / price);
        }
      } else {
        quantity = input.quantity as number;
        if (quantity > held + QTY_EPSILON / 2) {
          throw new AppError(400, 'Elinizdeki miktardan fazlası satılamaz', 'INSUFFICIENT_QUANTITY', { quantity: held });
        }
        if (held - quantity < QTY_EPSILON) quantity = held;
        else quantity = floorQty(quantity);
      }
      if (!(quantity >= QTY_EPSILON)) throw new AppError(400, 'Miktar çok küçük', 'TRADE_TOO_SMALL');
      const all = quantity >= held;
      if (!all && round2(quantity * price) < MIN_TRADE_USD) {
        throw new AppError(400, `En küçük işlem ${MIN_TRADE_USD} USD`, 'TRADE_TOO_SMALL');
      }
      return Sandbox.applySell(c, p, { asset_type: input.asset_type, symbol, name: quote.name, quantity: all ? held : quantity, price }, actorUserId, reason);
    });
  }

  /** Kilitli portföyde alış uygular (nakit yeterliliği çağıran tarafından doğrulanmış olmalı; yine de denetlenir). */
  private static async applyBuy(
    c: PoolClient,
    p: SandboxPortfolio,
    t: { asset_type: SandboxAssetType; symbol: string; name: string; quantity: number; price: number },
    actorUserId: string | null,
    reason: TradeReason
  ): Promise<TradeResult> {
    const cost = buyCost(t.quantity, t.price, p.commission_bps);
    const upd = await c.query(
      `UPDATE sandbox_portfolios SET cash = cash - $2::numeric, updated_at = now() WHERE id = $1 AND cash >= $2::numeric RETURNING cash`,
      [p.id, cost.total]
    );
    if (!upd.rows[0]) throw new AppError(400, 'Yetersiz nakit (komisyon dahil)', 'INSUFFICIENT_CASH', { cash_usd: p.cash, required_usd: cost.total });
    p.cash = num(upd.rows[0].cash);
    const h = await c.query(
      `INSERT INTO sandbox_holdings (portfolio_id, asset_type, symbol, name, quantity, avg_cost_usd)
       VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric / $5::numeric)
       ON CONFLICT (portfolio_id, asset_type, symbol) DO UPDATE SET
         avg_cost_usd = (sandbox_holdings.avg_cost_usd * sandbox_holdings.quantity + $6::numeric) / (sandbox_holdings.quantity + EXCLUDED.quantity),
         quantity = sandbox_holdings.quantity + EXCLUDED.quantity,
         name = EXCLUDED.name,
         updated_at = now()
       RETURNING quantity, avg_cost_usd`,
      [p.id, t.asset_type, t.symbol, t.name, t.quantity, cost.gross]
    );
    const tr = await c.query(
      `INSERT INTO sandbox_trades (portfolio_id, actor_user_id, side, asset_type, symbol, name, quantity, price_usd, gross_usd, commission_usd, reason)
       VALUES ($1, $2, 'buy', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [p.id, actorUserId, t.asset_type, t.symbol, t.name, t.quantity, t.price, cost.gross, cost.commission, reason]
    );
    return {
      trade: mapTrade(tr.rows[0]),
      cash_usd: p.cash,
      holding: { quantity: num(h.rows[0].quantity), avg_cost_usd: num(h.rows[0].avg_cost_usd) },
    };
  }

  /** Kilitli portföyde satış uygular (miktar eldekini aşamaz; kalan ~0 ise pozisyon silinir). */
  private static async applySell(
    c: PoolClient,
    p: SandboxPortfolio,
    t: { asset_type: SandboxAssetType; symbol: string; name: string; quantity: number; price: number },
    actorUserId: string | null,
    reason: TradeReason
  ): Promise<TradeResult> {
    const hr = await c.query(
      'SELECT quantity, avg_cost_usd FROM sandbox_holdings WHERE portfolio_id = $1 AND asset_type = $2 AND symbol = $3 FOR UPDATE',
      [p.id, t.asset_type, t.symbol]
    );
    const held = hr.rows[0] ? num(hr.rows[0].quantity) : 0;
    if (!(held > 0)) throw new AppError(400, 'Bu varlıkta pozisyonunuz yok', 'NO_POSITION');
    if (t.quantity > held + QTY_EPSILON / 2) throw new AppError(400, 'Elinizdeki miktardan fazlası satılamaz', 'INSUFFICIENT_QUANTITY', { quantity: held });
    const quantity = Math.min(t.quantity, held);
    const proceeds = sellProceeds(quantity, t.price, p.commission_bps);
    const remaining = roundQty(held - quantity);
    let holding: TradeResult['holding'] = null;
    if (remaining < QTY_EPSILON) {
      await c.query('DELETE FROM sandbox_holdings WHERE portfolio_id = $1 AND asset_type = $2 AND symbol = $3', [p.id, t.asset_type, t.symbol]);
    } else {
      const u = await c.query(
        `UPDATE sandbox_holdings SET quantity = $4, updated_at = now()
          WHERE portfolio_id = $1 AND asset_type = $2 AND symbol = $3 RETURNING quantity, avg_cost_usd`,
        [p.id, t.asset_type, t.symbol, remaining]
      );
      holding = { quantity: num(u.rows[0].quantity), avg_cost_usd: num(u.rows[0].avg_cost_usd) };
    }
    const upd = await c.query('UPDATE sandbox_portfolios SET cash = cash + $2::numeric, updated_at = now() WHERE id = $1 RETURNING cash', [
      p.id,
      Math.max(0, proceeds.net),
    ]);
    p.cash = num(upd.rows[0].cash);
    const tr = await c.query(
      `INSERT INTO sandbox_trades (portfolio_id, actor_user_id, side, asset_type, symbol, name, quantity, price_usd, gross_usd, commission_usd, reason)
       VALUES ($1, $2, 'sell', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [p.id, actorUserId, t.asset_type, t.symbol, t.name, quantity, t.price, proceeds.gross, proceeds.commission, reason]
    );
    return { trade: mapTrade(tr.rows[0]), cash_usd: p.cash, holding };
  }

  // -------------------------------------------------------------------------
  // Hedef ağırlıklar / yeniden dengeleme
  // -------------------------------------------------------------------------

  /** Ağırlıkları doğrular (400 WEIGHTS_INVALID) */
  static normalizeWeights(input: SetWeightsInput): TargetWeights {
    try {
      return normalizeTargetWeights(input);
    } catch (err) {
      if (err instanceof WeightsError) throw new AppError(400, err.message, 'WEIGHTS_INVALID');
      throw err;
    }
  }

  /**
   * Hedef ağırlıkları uygular: önce satışlar, sonra alışlar (güncel fiyatlarla, komisyon dahil; artan nakitte kalır)
   * ve target_weights'i kaydeder. opts.dryRun → hiçbir şey yazmadan planı döndürür (kilit almaz).
   * Tüm ilgili varlıkların (eldekiler + hedefler) taze fiyatı yoksa 503 PRICE_UNAVAILABLE.
   */
  static async setTargetWeights(
    portfolioId: string,
    actorUserId: string | null,
    input: SetWeightsInput,
    opts: { reason?: Exclude<TradeReason, 'manual'>; dryRun?: boolean } = {},
    client?: PoolClient
  ): Promise<SetWeightsResult> {
    const targets = Sandbox.normalizeWeights(input);
    const reason = opts.reason ?? 'rebalance';
    const targetKeys = targets.weights.map((w) => ({ asset_type: w.asset_type, symbol: w.symbol }));

    const run = async (c: PoolClient | null): Promise<SetWeightsResult> => {
      const db = c ?? pool;
      const p = c ? await lockPortfolio(c, portfolioId) : await Sandbox.get(portfolioId);
      if (p.status !== 'active') throw frozen();
      const holdings = await loadHoldings(db, p.id, !!c);
      const quotes = await SandboxPrices.requireTradeQuotes([...holdings.map((h) => ({ asset_type: h.asset_type, symbol: h.symbol })), ...targetKeys]);
      const plan = planRebalance({
        cash: p.cash,
        holdings: holdings.map((h) => ({ asset_type: h.asset_type, symbol: h.symbol, name: h.name, quantity: h.quantity })),
        quotes: toPlanQuotes(quotes),
        targets,
        bps: p.commission_bps,
      });
      const stored: StoredTargetWeights = { ...targets, set_at: new Date().toISOString() };
      if (!c) return { executed: false, plan, trades: [], cash_usd: plan.cash_after, target_weights: stored };

      const trades: SandboxTrade[] = [];
      for (const t of plan.trades) {
        const res: TradeResult =
          t.side === 'sell'
            ? await Sandbox.applySell(c, p, t, actorUserId, reason)
            : await Sandbox.applyBuy(c, p, t, actorUserId, reason);
        trades.push(res.trade);
      }
      await c.query('UPDATE sandbox_portfolios SET target_weights = $2::jsonb, updated_at = now() WHERE id = $1', [p.id, JSON.stringify(stored)]);
      return { executed: true, plan, trades, cash_usd: p.cash, target_weights: stored };
    };

    if (opts.dryRun) return run(null);
    return withTx(client, (c) => run(c));
  }

  /** Planı yürütmeden önizler (setTargetWeights dryRun kısayolu) */
  static async previewTargetWeights(portfolioId: string, input: SetWeightsInput): Promise<RebalancePlan> {
    return (await Sandbox.setTargetWeights(portfolioId, null, input, { dryRun: true })).plan;
  }

  // -------------------------------------------------------------------------
  // Değerleme
  // -------------------------------------------------------------------------

  static async valuation(portfolioId: string, client?: PoolClient): Promise<Valuation> {
    const db = client ?? pool;
    const p = await Sandbox.get(portfolioId, client);
    const [holdings, aggRes] = await Promise.all([
      loadHoldings(db, p.id),
      db.query(
        `SELECT asset_type, symbol, MAX(name) AS name,
                COALESCE(SUM(gross_usd + commission_usd) FILTER (WHERE side = 'buy'), 0) AS buy_total,
                COALESCE(SUM(gross_usd - commission_usd) FILTER (WHERE side = 'sell'), 0) AS sell_net,
                COALESCE(SUM(commission_usd), 0) AS commission
           FROM sandbox_trades WHERE portfolio_id = $1 GROUP BY asset_type, symbol`,
        [p.id]
      ),
    ]);
    const quotes = await SandboxPrices.getUsdPrices(holdings);
    const aggregates: TradeAggregate[] = aggRes.rows.map((r: any) => ({
      asset_type: r.asset_type,
      symbol: r.symbol,
      name: r.name,
      buy_total: num(r.buy_total),
      sell_net: num(r.sell_net),
    }));
    const commissionPaid = aggRes.rows.reduce((s: number, r: any) => s + num(r.commission), 0);
    const result = computeValuation({
      cash: p.cash,
      starting_cash: p.starting_cash,
      holdings: holdings.map((h) => {
        const q = quotes.get(assetKey(h.asset_type, h.symbol));
        return {
          ...h,
          name: q?.name || h.name,
          price_usd: q ? q.price_usd : null,
          stale: !q || !q.valuation_fresh,
        };
      }),
      aggregates,
      target: p.target_weights,
      commission_paid: commissionPaid,
    });
    const asOfs = holdings
      .map((h) => quotes.get(assetKey(h.asset_type, h.symbol))?.as_of?.getTime())
      .filter((t): t is number => typeof t === 'number');
    return {
      portfolio_id: p.id,
      ...result,
      as_of: new Date(asOfs.length > 0 ? Math.min(...asOfs) : Date.now()).toISOString(),
    };
  }

  /**
   * Birden çok portföyün özvarlığı — TEK fiyat sorgusu (lig sıralamaları, liste ekranları, anlık görüntü işi).
   * Fiyatı hiç olmayan pozisyon maliyetinden değerlenir (stale = true). Bilinmeyen kimlikler haritada yer almaz.
   */
  static async equities(portfolioIds: string[], client?: PoolClient): Promise<Map<string, EquitySummary>> {
    const out = new Map<string, EquitySummary>();
    const ids = [...new Set(portfolioIds)];
    if (ids.length === 0) return out;
    const db = client ?? pool;
    const [pr, hr] = await Promise.all([
      db.query('SELECT id, cash, starting_cash FROM sandbox_portfolios WHERE id = ANY($1::uuid[])', [ids]),
      db.query('SELECT portfolio_id, asset_type, symbol, quantity, avg_cost_usd FROM sandbox_holdings WHERE portfolio_id = ANY($1::uuid[])', [ids]),
    ]);
    const holdings = hr.rows.map((r: any) => ({ portfolio_id: r.portfolio_id as string, ...mapHolding(r) }));
    const quotes = await SandboxPrices.getUsdPrices(holdings);
    const acc = new Map<string, { value: number; stale: boolean }>();
    for (const h of holdings) {
      const q = quotes.get(assetKey(h.asset_type, h.symbol));
      const price = q ? q.price_usd : h.avg_cost_usd;
      const a = acc.get(h.portfolio_id) ?? { value: 0, stale: false };
      a.value += h.quantity * price;
      a.stale = a.stale || !q || !q.valuation_fresh;
      acc.set(h.portfolio_id, a);
    }
    for (const r of pr.rows) {
      const cash = num(r.cash);
      const start = num(r.starting_cash);
      const a = acc.get(r.id) ?? { value: 0, stale: false };
      const equity = cash + a.value;
      out.set(r.id, {
        equity_usd: round2(equity),
        cash_usd: round2(cash),
        starting_cash: start,
        return_pct: start > 0 ? Math.round((equity / start - 1) * 100 * 10_000) / 10_000 : 0,
        stale: a.stale,
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // İşlem geçmişi
  // -------------------------------------------------------------------------

  static async trades(portfolioId: string, opts: { limit?: number; offset?: number } = {}): Promise<{ items: SandboxTrade[]; total: number }> {
    const limit = Math.min(200, Math.max(1, Math.trunc(opts.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
    const [items, total] = await Promise.all([
      pool.query('SELECT * FROM sandbox_trades WHERE portfolio_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3', [
        portfolioId,
        limit,
        offset,
      ]),
      pool.query('SELECT COUNT(*)::int AS n FROM sandbox_trades WHERE portfolio_id = $1', [portfolioId]),
    ]);
    return { items: items.rows.map(mapTrade), total: Number(total.rows[0]?.n ?? 0) };
  }

  // -------------------------------------------------------------------------
  // Geçmiş + metrikler
  // -------------------------------------------------------------------------

  /**
   * Özvarlık geçmişi: 1W saatlik (yoksa günlük), diğerleri günlük kapanışlar. Başa başlangıç noktası
   * (oluşturma anı, başlangıç sermayesi; aralıktaysa), sona canlı değer eklenir. t = Unix saniye, artan ve tekil.
   */
  static async history(portfolioId: string, range: HistoryRange = '1M', now: Date = new Date()): Promise<HistoryResult> {
    const p = await Sandbox.get(portfolioId);
    const days = range === '1W' ? 7 : range === '1M' ? 30 : range === '3M' ? 90 : null;
    const from = days === null ? null : new Date(now.getTime() - days * DAY_MS);
    let rows: { t: number; v: number }[] = [];
    if (range === '1W') {
      const r = await pool.query(
        `SELECT hour AS at, equity_usd FROM sandbox_snapshots_hourly WHERE portfolio_id = $1 AND hour >= $2::timestamptz ORDER BY hour`,
        [p.id, from!.toISOString()]
      );
      rows = r.rows.map((x: any) => ({ t: Math.floor(new Date(x.at).getTime() / 1000), v: num(x.equity_usd) }));
    }
    if (rows.length < 2) {
      const r = await pool.query(
        `SELECT taken_at AS at, equity_usd FROM sandbox_snapshots
          WHERE portfolio_id = $1 AND ($2::timestamptz IS NULL OR taken_at >= $2::timestamptz) ORDER BY day`,
        [p.id, from ? from.toISOString() : null]
      );
      rows = r.rows.map((x: any) => ({ t: Math.floor(new Date(x.at).getTime() / 1000), v: num(x.equity_usd) }));
    }
    // Başlangıç noktası 1 sn önceye alınır: oluşturulduğu saniyede gelen ilk anlık görüntü / canlı nokta onu ezmesin
    const createdT = Math.floor(new Date(p.created_at).getTime() / 1000) - 1;
    if (!from || createdT >= Math.floor(from.getTime() / 1000)) rows.unshift({ t: createdT, v: p.starting_cash });
    const nowT = Math.floor(now.getTime() / 1000);
    if (p.status === 'active') {
      const eq = (await Sandbox.equities([p.id])).get(p.id);
      if (eq) rows.push({ t: nowT, v: eq.equity_usd });
    }
    const points: SeriesPoint[] = [];
    for (const r of rows.sort((a, b) => a.t - b.t)) {
      if (r.t > nowT) continue;
      if (points.length > 0 && points[points.length - 1].t === r.t) points[points.length - 1] = r;
      else points.push(r);
    }
    const first = points.length > 0 ? points[0].v : null;
    const last = points.length > 0 ? points[points.length - 1].v : null;
    return {
      range,
      points,
      first,
      last,
      change_pct: points.length >= 2 && first && first > 0 ? Math.round(((last! / first) - 1) * 100 * 100) / 100 : null,
    };
  }

  /**
   * Güncel pozisyonlar `lookbackDays` gün boyunca hiç değiştirilmeden tutulsaydı portföy değeri
   * (price_history günlük kapanışları, USD). Yalnızca nakit → düz iki nokta.
   */
  static async backtest(portfolioId: string, lookbackDays: number = BACKTEST_DAYS, now: Date = new Date()): Promise<BacktestResult> {
    const p = await Sandbox.get(portfolioId);
    const holdings = await loadHoldings(pool, p.id);
    return Sandbox.backtestHoldings(p.cash, holdings, lookbackDays, now);
  }

  static async backtestHoldings(
    cash: number,
    holdings: { asset_type: SandboxAssetType; symbol: string; quantity: number }[],
    lookbackDays: number = BACKTEST_DAYS,
    now: Date = new Date()
  ): Promise<BacktestResult> {
    const from = new Date(now.getTime() - lookbackDays * DAY_MS);
    if (holdings.length === 0) {
      return {
        lookback_days: lookbackDays,
        points: [
          { t: Math.floor(from.getTime() / 1000), v: round2(cash) },
          { t: Math.floor(now.getTime() / 1000), v: round2(cash) },
        ],
        missing: [],
      };
    }
    const series = await SandboxPrices.dailyUsdSeries(holdings, from);
    const quantities = new Map<string, number>();
    const missingHoldings: typeof holdings = [];
    for (const h of holdings) {
      const k = assetKey(h.asset_type, h.symbol);
      if ((series.get(k)?.length ?? 0) >= 2) quantities.set(k, (quantities.get(k) ?? 0) + h.quantity);
      else missingHoldings.push(h);
    }
    // Geçmişi olmayan pozisyonlar bugünkü değerinde SABİT kabul edilir (nakit gibi) ve `missing`te bildirilir
    let missingValue = 0;
    if (missingHoldings.length > 0) {
      const quotes = await SandboxPrices.getUsdPrices(missingHoldings);
      for (const h of missingHoldings) missingValue += h.quantity * (quotes.get(assetKey(h.asset_type, h.symbol))?.price_usd ?? 0);
    }
    let points = buildHoldSeries(series, quantities, cash + missingValue);
    if (quantities.size === 0) {
      const v = round2(cash + missingValue);
      points = [
        { t: Math.floor(from.getTime() / 1000), v },
        { t: Math.floor(now.getTime() / 1000), v },
      ];
    }
    return { lookback_days: lookbackDays, points, missing: missingHoldings.map((h) => h.symbol) };
  }

  static async metrics(portfolioId: string, now: Date = new Date()): Promise<Metrics> {
    const p = await Sandbox.get(portfolioId);
    const [val, stats, daily, bt] = await Promise.all([
      Sandbox.valuation(p.id),
      pool.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(SUM(gross_usd) FILTER (WHERE reason <> 'initial'), 0) AS volume
           FROM sandbox_trades WHERE portfolio_id = $1`,
        [p.id]
      ),
      pool.query('SELECT equity_usd FROM sandbox_snapshots WHERE portfolio_id = $1 ORDER BY day', [p.id]),
      Sandbox.backtest(p.id, BACKTEST_DAYS, now),
    ]);
    const weights = [...val.holdings.map((h) => h.weight), val.cash_weight];
    const hhi = herfindahl(weights);

    const realizedValues = [p.starting_cash, ...daily.rows.map((r: any) => num(r.equity_usd))];
    if (p.status === 'active') realizedValues.push(val.equity_usd);
    const realized: RiskBlock | null =
      daily.rows.length >= MIN_REALIZED_POINTS
        ? {
            volatility_ann: volatilityAnnPct(realizedValues),
            max_drawdown_pct: maxDrawdownPct(realizedValues),
            sharpe: sharpeRatio(realizedValues),
            points: realizedValues.length,
          }
        : null;

    const simValues = bt.points.map((x) => x.v);
    const onlyCash = val.holdings.length === 0;
    const simulated =
      onlyCash || simValues.length >= MIN_RETURNS_FOR_METRICS + 1
        ? {
            volatility_ann: onlyCash ? 0 : volatilityAnnPct(simValues),
            max_drawdown_pct: onlyCash ? 0 : maxDrawdownPct(simValues),
            sharpe: onlyCash ? null : sharpeRatio(simValues),
            points: simValues.length,
            lookback_days: bt.lookback_days,
          }
        : null;

    const top = realized ?? simulated;
    return {
      volatility_ann: top?.volatility_ann ?? null,
      max_drawdown_pct: top?.max_drawdown_pct ?? null,
      sharpe: top?.sharpe ?? null,
      hhi,
      effective_n: effectiveN(hhi),
      turnover_pct: p.starting_cash > 0 ? round2((num(stats.rows[0]?.volume) / 2 / p.starting_cash) * 100) : 0,
      trades_count: Number(stats.rows[0]?.n ?? 0),
      days: Math.max(0, Math.floor((now.getTime() - new Date(p.created_at).getTime()) / DAY_MS)),
      basis: realized ? 'realized' : simulated ? 'simulated' : null,
      realized,
      simulated,
      commission_paid_usd: val.commission_paid_usd,
      risk_free_rate: RISK_FREE_USD,
    };
  }

  // -------------------------------------------------------------------------
  // Anlık görüntüler (iş: sandbox-snapshots)
  // -------------------------------------------------------------------------

  /** Verilen portföylerin saatlik + günlük (İstanbul günü; gün içinde son değer) noktalarını UPSERT eder. */
  static async snapshotPortfolios(ids: string[], at: Date = new Date(), client?: PoolClient): Promise<number> {
    if (ids.length === 0) return 0;
    const eq = await Sandbox.equities(ids, client);
    if (eq.size === 0) return 0;
    const db = client ?? pool;
    const list = [...eq.entries()];
    const hour = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000).toISOString();
    const day = istanbulDay(at);
    const params = [list.map(([id]) => id), list.map(([, e]) => e.equity_usd), list.map(([, e]) => e.cash_usd), at.toISOString()];
    await db.query(
      `INSERT INTO sandbox_snapshots_hourly (portfolio_id, hour, equity_usd, cash_usd, taken_at)
       SELECT s.id, $5::timestamptz, s.eq, s.cash, $4::timestamptz FROM unnest($1::uuid[], $2::numeric[], $3::numeric[]) AS s(id, eq, cash)
       ON CONFLICT (portfolio_id, hour) DO UPDATE SET equity_usd = EXCLUDED.equity_usd, cash_usd = EXCLUDED.cash_usd, taken_at = EXCLUDED.taken_at`,
      [...params, hour]
    );
    await db.query(
      `INSERT INTO sandbox_snapshots (portfolio_id, day, equity_usd, cash_usd, taken_at)
       SELECT s.id, $5::date, s.eq, s.cash, $4::timestamptz FROM unnest($1::uuid[], $2::numeric[], $3::numeric[]) AS s(id, eq, cash)
       ON CONFLICT (portfolio_id, day) DO UPDATE SET equity_usd = EXCLUDED.equity_usd, cash_usd = EXCLUDED.cash_usd, taken_at = EXCLUDED.taken_at`,
      [...params, day]
    );
    return list.length;
  }

  /** Tüm ETKİN portföyler (500'lük gruplar) + 35 günden eski saatlik noktaların budanması */
  static async snapshotAll(at: Date = new Date()): Promise<{ portfolios: number; pruned: number }> {
    let total = 0;
    let lastId = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const r = await pool.query(
        `SELECT id FROM sandbox_portfolios WHERE status = 'active' AND id > $1::uuid ORDER BY id LIMIT 500`,
        [lastId]
      );
      if (r.rows.length === 0) break;
      const ids = r.rows.map((x: any) => x.id as string);
      total += await Sandbox.snapshotPortfolios(ids, at);
      lastId = ids[ids.length - 1];
      if (r.rows.length < 500) break;
    }
    const pr = await pool.query('DELETE FROM sandbox_snapshots_hourly WHERE hour < $1::timestamptz', [
      new Date(at.getTime() - HOURLY_RETENTION_DAYS * DAY_MS).toISOString(),
    ]);
    return { portfolios: total, pruned: pr.rowCount ?? 0 };
  }

  /** Cron işi */
  static async snapshotJob(): Promise<void> {
    const r = await Sandbox.snapshotAll(new Date());
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' && r.portfolios > 0) {
      console.log(`[sandbox] Anlık görüntü: ${r.portfolios} portföy, ${r.pruned} eski saatlik nokta silindi`);
    }
  }
}

