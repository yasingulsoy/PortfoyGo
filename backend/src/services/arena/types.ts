import type { RoundWindow } from './paths';
import type { CloseReason, Side } from './engine';

export type RoundKind = 'solo' | 'challenge';
export type RoundStatus = 'scheduled' | 'running' | 'finished' | 'cancelled';

export interface RoundRow {
  id: string;
  kind: RoundKind;
  challenge_id: string | null;
  user_id: string | null;
  status: RoundStatus;
  starts_at: Date;
  ends_at: Date;
  duration_s: number;
  instruments: string[];
  window: RoundWindow | null;
  seed: string;
  starting_cash: number;
  created_at: Date;
  finished_at: Date | null;
  challenge: { id: string; title: string; sponsor: string | null; prize_text: string | null } | null;
}

export interface PositionRow {
  id: string;
  round_id: string;
  user_id: string;
  instrument: string;
  side: Side;
  qty: number;
  amount: number;
  entry_price: number;
  entry_tick: number;
  stop_loss: number | null;
  take_profit: number | null;
  last_checked_tick: number;
  status: 'open' | 'closed';
  close_price: number | null;
  close_tick: number | null;
  pnl: number | null;
  close_reason: CloseReason | null;
  opened_at: Date;
  closed_at: Date | null;
}

export interface EntryRow {
  round_id: string;
  user_id: string;
  cash: number;
  equity_final: number | null;
  return_pct: number | null;
  rank: number | null;
  trades_count: number;
  joined_at: Date;
}

/** API: pozisyon */
export interface PositionDto {
  id: string;
  instrument: string;
  side: Side;
  qty: number;
  amount: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'open' | 'closed';
  current_price: number | null;
  pnl: number;
  pnl_pct: number;
  close_price: number | null;
  close_reason: CloseReason | null;
  opened_at: string;
  closed_at: string | null;
}

/** API: katılımcının durumu */
export interface MeDto {
  joined: boolean;
  cash: number;
  equity: number;
  return_pct: number;
  rank: number | null;
  trades_count: number;
}

export interface LeaderboardItemDto {
  rank: number;
  username: string;
  return_pct: number;
  equity: number;
  is_me: boolean;
}

export interface QuoteDto {
  bid: number;
  ask: number;
  mid: number;
}

export interface RoundStateDto {
  round: {
    id: string;
    kind: RoundKind;
    status: RoundStatus;
    starts_at: string;
    ends_at: string;
    duration_s: number;
    server_now: string;
    tick: number;
    ticks_total: number;
    instruments: { code: string; label: string; decimals: number }[];
    challenge?: { id: string; title: string; sponsor: string | null; prize_text: string | null };
    reveal?: { from: string; to: string; instruments: Record<string, { from: string; to: string }> };
  };
  me: MeDto;
  quotes: Record<string, QuoteDto & { change_pct_since_start: number }>;
  history: Record<string, number[]>;
  history_ticks: number[];
  positions: { open: PositionDto[]; closed: PositionDto[] };
  leaderboard?: LeaderboardItemDto[];
}
