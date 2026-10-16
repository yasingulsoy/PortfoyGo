// Slot Makinesi — "Olasılık dersi" (backend /api/game/slot, migration 026)

export type SlotSymbolId = 'ayi' | 'dolar' | 'petrol' | 'boga' | 'altin' | 'bitcoin' | 'roket' | 'yildiz';

export interface SlotSymbol {
  id: SlotSymbolId;
  label: string;
}

export type SlotComboKind = 'three' | 'pair' | 'none';

export interface SlotPaytableRow {
  id: string;
  kind: SlotComboKind;
  symbol: SlotSymbolId | null;
  combo: string;
  /** Kazanç = bahis × çarpan */
  multiplier: number;
  /** Tam olasılık = ways / total_ways */
  ways: number;
  total_ways: number;
  probability_pct: number;
}

export interface SlotReelWeight {
  symbol: SlotSymbolId;
  weight: number;
  total: number;
}

export interface SlotTotals {
  spins: number;
  wagered: number;
  won: number;
  net: number;
}

export interface SlotLifetime extends SlotTotals {
  realized_rtp_pct: number | null;
}

export interface SlotSession extends SlotTotals {
  expected_net: number;
  started_at: string | null;
  reality_check_due: boolean;
}

export interface SlotLimits {
  bets: number[];
  max_spins_per_day: number;
  daily_loss_cap: number;
  min_interval_ms: number;
  reality_check_every: number;
  spins_left_today: number;
  loss_remaining_today: number;
  max_bet_now: number | null;
  resets_at: string | null;
  next_spin_at: string | null;
}

export interface SlotHistoryPoint {
  n: number;
  wagered: number;
  won: number;
}

export interface SlotInfo {
  enabled: boolean;
  symbols: SlotSymbol[];
  reel_weights: SlotReelWeight[][];
  bets: number[];
  paytable: SlotPaytableRow[];
  rtp_pct: number;
  house_edge_pct: number;
  hit_rate_pct: number;
  /** Bahis başına getirinin standart sapması (bahis katı) */
  stdev: number;
  celebrate_net_multiple: number;
  limits: SlotLimits;
  coins: number;
  today: SlotTotals;
  lifetime: SlotLifetime;
  session: SlotSession;
  history: SlotHistoryPoint[];
  disclaimer: string | null;
}

export interface SlotRealityCheck {
  spins: number;
  wagered: number;
  won: number;
  net: number;
  expected_net: number;
}

export interface SlotSpinResult {
  request_id: string;
  replayed: boolean;
  reels: SlotSymbolId[];
  combo: { id: string; label: string; multiplier: number };
  bet: number;
  win: number;
  net: number;
  balance: number;
  stats: { today: SlotTotals; lifetime: SlotLifetime; session: SlotSession };
  limits: SlotLimits;
  reality_check: SlotRealityCheck | null;
}
