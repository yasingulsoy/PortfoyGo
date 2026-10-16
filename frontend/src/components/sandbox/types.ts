// Sanal (sandbox) portföy türleri — backend/src/services/sandbox/README.md sözleşmesiyle aynı.
// Tutarlar USD; ağırlıklar YÜZDE (0–100). Model Portföy ve Portföy Ligi ortak kullanır.

export type SandboxAssetType = 'stock' | 'crypto' | 'currency' | 'commodity';
export type AssetClass = 'hisse' | 'kripto' | 'doviz' | 'emtia' | 'nakit';
export type SandboxStatus = 'active' | 'frozen' | 'archived';
export type SandboxHistoryRange = '1W' | '1M' | '3M' | 'ALL';

export interface SeriesPoint {
  /** Unix saniye (UTC) */
  t: number;
  v: number;
}

export interface TargetWeight {
  asset_type: SandboxAssetType;
  symbol: string;
  weight: number;
}

export interface StoredTargetWeights {
  weights: TargetWeight[];
  cash_weight: number;
  set_at: string;
}

export interface SandboxPortfolio {
  id: string;
  kind: 'model' | 'league';
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

export interface SandboxHolding {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  quantity: number;
  avg_cost_usd: number;
  price_usd: number;
  value_usd: number;
  weight: number;
  target_weight: number | null;
  drift: number | null;
  pnl_usd: number;
  pnl_pct: number;
  contribution_usd: number;
  contribution_pct: number;
  stale: boolean;
}

export interface ClassWeight {
  asset_class: AssetClass;
  value_usd: number;
  weight: number;
}

export interface ClosedContribution {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  contribution_usd: number;
  contribution_pct: number;
}

export interface SandboxValuation {
  portfolio_id: string;
  equity_usd: number;
  cash_usd: number;
  cash_weight: number;
  target_cash_weight: number | null;
  starting_cash: number;
  pnl_usd: number;
  return_pct: number;
  holdings: SandboxHolding[];
  by_class: ClassWeight[];
  closed: ClosedContribution[];
  closed_contribution_pct: number;
  commission_paid_usd: number;
  as_of: string;
  stale: boolean;
}

export interface RiskBlock {
  volatility_ann: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  points: number;
}

export interface SandboxMetrics {
  volatility_ann: number | null;
  /** Pozitif yüzde: 12,3 = tepeden dibe %−12,3 */
  max_drawdown_pct: number | null;
  sharpe: number | null;
  hhi: number;
  effective_n: number;
  turnover_pct: number;
  trades_count: number;
  days: number;
  basis: 'realized' | 'simulated' | null;
  realized: RiskBlock | null;
  simulated: (RiskBlock & { lookback_days: number }) | null;
  commission_paid_usd: number;
  risk_free_rate: number;
}

export interface SandboxHistory {
  range: SandboxHistoryRange;
  points: SeriesPoint[];
  first: number | null;
  last: number | null;
  change_pct: number | null;
}

export interface SandboxBacktest {
  lookback_days: number;
  points: SeriesPoint[];
  missing: string[];
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
  reason: 'manual' | 'rebalance' | 'initial';
  created_at: string;
}

export interface PlannedTrade {
  side: 'buy' | 'sell';
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  gross: number;
  commission: number;
  all?: boolean;
}

export interface RebalancePlan {
  equity_before: number;
  trades: PlannedTrade[];
  total_commission: number;
  cash_after: number;
  weights_after: TargetWeight[];
  cash_weight_after: number;
}

export interface AssetSearchItem {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  asset_class: AssetClass;
  price_usd: number;
  quote_currency: 'USD' | 'TRY';
  change_24h_pct: number | null;
}

/** İşlem formunun gönderdiği istek (amount_usd XOR quantity) */
export interface SandboxTradeRequest {
  side: 'buy' | 'sell';
  asset_type: SandboxAssetType;
  symbol: string;
  amount_usd?: number;
  quantity?: number | 'all';
}

/** Ağırlık düzenleyicisinin satırı */
export interface WeightRow {
  asset_type: SandboxAssetType;
  symbol: string;
  name: string;
  weight: number;
  price_usd?: number | null;
}

// Model Portföy'e özgü yanıtlar

export interface ModelListItem extends SandboxPortfolio {
  equity_usd: number;
  return_pct: number;
  holdings_count: number;
  stale: boolean;
}

export interface ModelList {
  items: ModelListItem[];
  limit: number;
  starting_cash: number;
  commission_bps: number;
}

export interface ModelDetail {
  portfolio: SandboxPortfolio;
  valuation: SandboxValuation;
}

export interface CompareItem {
  portfolio: SandboxPortfolio;
  valuation: Pick<SandboxValuation, 'equity_usd' | 'cash_usd' | 'cash_weight' | 'return_pct' | 'by_class' | 'stale' | 'commission_paid_usd'> & {
    holdings: { asset_type: SandboxAssetType; symbol: string; name: string; asset_class: AssetClass; weight: number }[];
  };
  metrics: SandboxMetrics;
  history: SeriesPoint[];
  backtest: SandboxBacktest;
}

export interface AdvisorTemplate {
  plan_id: string;
  profile_label: string | null;
  created_at: string;
  weights: (TargetWeight & { name: string; from_class: string })[];
  cash_weight: number;
  moved_to_cash: { label: string; weight: number; reason: string }[];
}
