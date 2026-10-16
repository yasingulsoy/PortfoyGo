// Portföy Ligi (backend/src/services/portfolioLeagues) — API sözleşmesi türleri.
// Tutarlar USD; yüzdeler yüzde birimi (12,3 = %12,3). Sanal portföy türleri components/sandbox/types.ts'den gelir.

import type { SandboxMetrics, SandboxTrade, SandboxValuation, SeriesPoint, StoredTargetWeights } from '@/components/sandbox/types';
import type { LeagueStatus } from '@/types';

export type LeagueMode = 'main' | 'portfolio';
export type Participation = 'solo' | 'team';

export interface PortfolioLeagueRules {
  starting_capital_usd: number;
  commission_bps: number;
  participation: Participation;
  team_size: number | null;
  max_teams: number | null;
  starts_at: string;
  ends_at: string;
  /** Geç katılım bitişi (dönemin ilk %20'si) */
  late_join_until: string;
  /** Lig başladı → kurallar değiştirilemez */
  locked: boolean;
}

export interface PortfolioLeagueMe {
  entry_id: string | null;
  kind: Participation | null;
  team_id: string | null;
  has_portfolio: boolean;
  late_join: boolean;
  measured_from: string | null;
  can_trade: boolean;
  trade_block_reason: string | null;
  can_edit_strategy: boolean;
  can_edit_reflection: boolean;
  can_create_team: boolean;
  can_join_team: boolean;
  can_leave_team: boolean;
  is_owner: boolean;
}

export interface PortfolioLeagueTeamMember {
  user_id: string;
  username: string;
  is_captain: boolean;
  is_me: boolean;
  joined_at: string;
}

export interface PortfolioLeagueTeam {
  id: string;
  name: string;
  entry_id: string | null;
  captain_id: string | null;
  member_count: number;
  members: PortfolioLeagueTeamMember[];
  is_mine: boolean;
  /** Yalnızca takım üyelerine ve lig kurucusuna */
  invite_code: string | null;
  has_portfolio: boolean;
  late_join: boolean;
  withdrawn: boolean;
  full: boolean;
}

export interface PortfolioLeagueDetail {
  league_id: string;
  status: LeagueStatus;
  rules: PortfolioLeagueRules;
  me: PortfolioLeagueMe;
  teams: PortfolioLeagueTeam[];
  unassigned: { user_id: string; username: string }[];
}

export interface StyleTag {
  key: 'active_trading' | 'buy_and_hold' | 'concentrated' | 'diversified' | 'cash_heavy' | string;
  label: string;
  reason: string;
}

export interface StandingRow {
  entry_id: string;
  rank: number | null;
  kind: Participation;
  label: string;
  user_id: string | null;
  team_id: string | null;
  is_me: boolean;
  late_join: boolean;
  measured_from: string | null;
  equity_usd: number | null;
  return_pct: number | null;
  pnl_usd: number | null;
  max_drawdown_pct: number | null;
  volatility_ann: number | null;
  trades_count: number | null;
  turnover_pct: number | null;
  style_tags: StyleTag[];
  stale: boolean;
  members: { user_id: string; username: string; is_captain: boolean; trades_count: number }[];
}

export interface PortfolioLeagueStandings {
  status: LeagueStatus;
  rows: StandingRow[];
  as_of: string;
}

export interface PerformanceSeries {
  entry_id: string;
  label: string;
  rank: number | null;
  is_me: boolean;
  /** Başlangıç sermayesi = 100 */
  points: SeriesPoint[];
}

export interface PeriodTable {
  columns: { start: string; end: string }[];
  rows: { entry_id: string; label: string; rank: number | null; is_me: boolean; late_join: boolean; returns: (number | null)[] }[];
}

export interface PortfolioLeaguePerformance {
  status: LeagueStatus;
  period_start: string;
  period_end: string;
  series: PerformanceSeries[];
  weekly: PeriodTable;
  monthly: PeriodTable;
}

export interface StrategyRow {
  entry_id: string;
  kind: Participation;
  label: string;
  members: string[];
  is_me: boolean;
  late_join: boolean;
  strategy: string | null;
  strategy_hidden: boolean;
  strategy_updated_at: string | null;
  reflection: string | null;
  reflection_updated_at: string | null;
  rank: number | null;
  return_pct: number | null;
  max_drawdown_pct: number | null;
  trades_count: number | null;
  style_tags: StyleTag[];
}

export interface PortfolioLeagueStrategies {
  status: LeagueStatus;
  can_edit_strategy: boolean;
  can_edit_reflection: boolean;
  rows: StrategyRow[];
}

export interface LeagueTrade extends SandboxTrade {
  actor_username: string | null;
  is_me: boolean;
}

export interface PortfolioLeaguePortfolio {
  status: LeagueStatus;
  entry_id: string | null;
  kind?: Participation;
  label?: string;
  late_join?: boolean;
  withdrawn?: boolean;
  portfolio: {
    id: string;
    status: 'active' | 'frozen' | 'archived';
    frozen_at: string | null;
    target_weights: StoredTargetWeights | null;
    measured_from: string | null;
    valuation: SandboxValuation;
    metrics: SandboxMetrics;
    trades: LeagueTrade[];
    trades_total: number;
  } | null;
  can_trade?: boolean;
}

export interface CreatePortfolioLeagueRequest {
  name: string;
  description?: string;
  visibility?: 'private' | 'public';
  starts_at: string;
  ends_at: string;
  starting_capital_usd: number;
  commission_bps: number;
  participation: Participation;
  team_size?: number;
  max_teams?: number;
}

export interface UpdatePortfolioRulesRequest {
  starting_capital_usd?: number;
  commission_bps?: number;
  team_size?: number;
  max_teams?: number;
  starts_at?: string;
  ends_at?: string;
}
