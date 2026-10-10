// Yönetim API'sinin (/api/admin/*) yanıt tipleri. Sayısal alanlar backend'den string gelebilir; `num()` ile okunur.

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface MetricsDay {
  date: string;
  signups: number;
  active_users: number;
  transactions: number;
  volume_try: number;
}

export interface MetricsTotals {
  users: number;
  verified_users: number;
  banned_users: number;
  admins: number;
  transactions: number;
  volume_try: number;
  active_orders: number;
  leagues: number;
  open_positions: number;
}

export interface Metrics {
  days: MetricsDay[];
  totals: MetricsTotals;
}

export type HealthStatus = 'ok' | 'degraded' | 'down';
export type JobStatus = 'ok' | 'error' | 'running' | 'never';

export interface Job {
  name: string;
  schedule: string;
  /** Sözleşmede yok; backend gönderiyorsa devre dışı işler işaretlenir */
  enabled?: boolean;
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_status: JobStatus;
  last_error: string | null;
  run_count: number;
}

export type DataSource = 'stock' | 'crypto' | 'fx' | 'price_history';

export interface Health {
  status: HealthStatus;
  uptime_s: number;
  node: string;
  env: string;
  memory_mb: number;
  db: { ok: boolean; latency_ms: number | null };
  migrations: { applied: string[]; latest: string | null; pending: string[] };
  jobs: Job[];
  data: {
    stock_cache_at: string | null;
    crypto_cache_at: string | null;
    fx_rates_at: string | null;
    price_history_at: string | null;
    stale: Partial<Record<DataSource, boolean>>;
  };
  providers: Partial<Record<'stocks' | 'crypto' | 'fx' | 'commodities' | 'news', string>>;
}

export type TxType = 'buy' | 'sell';

export interface AdminTransaction {
  id: string;
  user_id: string;
  username: string;
  type: TxType;
  symbol: string;
  name: string | null;
  asset_type: string;
  quantity: number;
  price: number;
  total_amount: number;
  commission: number;
  net_amount: number;
  created_at: string;
}

export type OrderStatus = 'active' | 'filled' | 'cancelled' | 'expired' | 'failed';

export interface AdminOrder {
  id: string;
  user_id: string;
  username: string;
  asset_type: string;
  symbol: string;
  side: TxType;
  type: string;
  quantity: number;
  trigger_price: number;
  status: OrderStatus;
  reserved_cash: number | null;
  filled_price: number | null;
  fail_reason: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface AdminHolding {
  id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
  quantity: number;
  average_price: number;
  current_price: number;
  total_value: number;
  profit_loss: number;
  profit_loss_percent: number;
}

export interface AdminActivity {
  id: string;
  activity_type: string;
  description: string | null;
  created_at: string;
  ip_address: string | null;
}

export interface UserDetail {
  user: {
    id: string;
    username: string;
    email: string;
    email_verified: boolean;
    is_admin: boolean;
    is_banned: boolean;
    balance: number;
    reserved_cash: number;
    portfolio_value: number;
    total_value: number;
    rank: number | null;
    created_at: string;
    last_login: string | null;
  };
  holdings: AdminHolding[];
  transactions: AdminTransaction[];
  orders: AdminOrder[];
  activity: AdminActivity[];
  leagues: { id: string; name: string; role: string }[];
  awards: { season_name: string; title: string; rank: number }[];
}

export interface AdminLeague {
  id: string;
  name: string;
  owner_id: string;
  owner_username: string;
  member_count: number;
  invite_code: string;
  created_at: string;
  ends_at: string | null;
}

export type AuditAction =
  | 'user.ban'
  | 'user.unban'
  | 'user.role'
  | 'user.verify_email'
  | 'user.revoke_sessions'
  | 'order.cancel'
  | 'league.delete'
  | 'cache.refresh_stocks'
  | 'cache.refresh_currencies'
  | 'job.run'
  | 'announcement.create'
  | 'arena.challenge_create'
  | 'arena.challenge_cancel';

export interface AuditEntry {
  id: string;
  admin_id: string;
  admin_username: string;
  action: AuditAction | string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

/* ---------------------------------------------------------------- Arena */

export type ArenaChallengeStatus = 'scheduled' | 'running' | 'finished' | 'cancelled';

export interface ArenaChallenge {
  id: string;
  title: string;
  description: string | null;
  sponsor: string | null;
  prize_text: string | null;
  starts_at: string;
  duration_s: number;
  /** Enstrüman kodları (ör. 'XAUUSD') */
  instruments: string[];
  starting_cash: number;
  status: ArenaChallengeStatus;
  participants: number;
  round_id: string | null;
  created_by_username?: string | null;
  created_at: string;
}

export interface ArenaInstrument {
  code: string;
  label: string;
  decimals: number;
  spread_display: string | number | null;
  available: boolean;
}

export interface ArenaLeaderboardEntry {
  rank: number;
  username: string;
  return_pct: number;
  equity: number;
}

export interface ArenaLeaderboard {
  items: ArenaLeaderboardEntry[];
  status: ArenaChallengeStatus | string;
}
