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
  /** Başka bir örnek (API / worker) aynı işi çalıştırırken atlanan turlar — "skipped (locked)", hata değil */
  skip_count?: number;
  last_skipped_at?: string | null;
  /** Son çalışmayı yapan örnek (host:pid:…) */
  last_instance?: string | null;
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
  /** scheduling_here: bu API örneği cron çalıştırıyor mu (RUN_JOBS); shared_status: durumlar Redis'ten mi */
  jobs_runtime?: { scheduling_here: boolean; shared_status: boolean };
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
    /** KVKK: kullanıcı hesabını sildi (anonimleştirildi) */
    is_deleted?: boolean;
    deleted_at?: string | null;
    is_bot?: boolean;
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
  /** 'portfolio' = Portföy Ligi (023) */
  mode?: 'main' | 'portfolio';
  starts_at?: string | null;
  started_at?: string | null;
  finalized_at?: string | null;
  rules?: { starting_capital_usd: number; commission_bps: number; participation: 'solo' | 'team'; team_size: number | null; max_teams: number | null } | null;
}

/** GET /api/admin/portfolio-leagues/:id */
export interface AdminLeagueDetail {
  id: string;
  name: string;
  mode: 'main' | 'portfolio';
  visibility: string;
  owner_username: string | null;
  status: 'upcoming' | 'active' | 'finished';
  starts_at: string | null;
  started_at: string | null;
  ends_at: string | null;
  finalized_at: string | null;
  rules: {
    starting_capital_usd: number;
    commission_bps: number;
    participation: 'solo' | 'team';
    team_size: number | null;
    max_teams: number | null;
    starts_at: string;
    ends_at: string;
    late_join_until: string;
    locked: boolean;
  } | null;
  members: { user_id: string; username: string; role: string; joined_at: string; final_rank?: number | null; final_return_pct?: string | number | null }[];
  entries: {
    entry_id: string;
    kind: 'solo' | 'team';
    label: string;
    members: string[];
    has_portfolio: boolean;
    late_join: boolean;
    withdrawn: boolean;
    rank: number | null;
    equity_usd: number | null;
    return_pct: number | null;
    max_drawdown_pct: number | null;
    trades_count: number | null;
    has_strategy: boolean;
  }[];
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
  | 'arena.challenge_cancel'
  | 'arena.broadcast_token'
  | 'arena.host_message'
  | 'scenario.series_import'
  | 'scenario.series_delete'
  | 'scenario.create'
  | 'scenario.update'
  | 'scenario.delete'
  | 'scenario.publish'
  | 'picks.comment_delete'
  | 'picks.note_hide'
  | 'ideas.hide'
  | 'ideas.unhide'
  | 'ideas.comment_delete'
  | 'ideas.report_resolve'
  | 'league.finalize';

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
  /** Mevcut yayın kaplaması yolu ('/yayin/<token>'), yoksa null */
  overlay_path?: string | null;
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

/* ------------------------------------------------- Senaryolar ve seriler */

export type SeriesCurrency = 'USD' | 'TRY';
export type ScenarioDifficulty = 'kolay' | 'orta' | 'zor';

/** Yöneticinin içe aktardığı lisanslı tarihsel fiyat serisi */
export interface HistoricalSeries {
  series_code: string;
  label: string;
  currency: SeriesCurrency;
  source: string;
  license_note: string;
  points: number;
  from: string | null;
  to: string | null;
  imported_at: string | null;
  imported_by: string | null;
  /** Bu seriyi kullanan senaryolar */
  used_by: { id: string; title: string; published: boolean }[];
}

export interface SeriesImportResult {
  series_code: string;
  points: number;
  imported: number | null;
  from: string | null;
  to: string | null;
  rejected_rows: number;
  rejected_samples: { line: number; reason: string }[];
  duplicates: number;
}

export interface SeriesPreview {
  series_code: string;
  label: string;
  currency: SeriesCurrency | string;
  total: number;
  /** t: unix ms, p: fiyat */
  points: { t: number; p: number }[];
}

export interface ScenarioInstrumentInput {
  code: string;
  label: string;
  series_code: string;
}

export interface AdminScenario {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  briefing: string;
  debrief: string;
  difficulty: ScenarioDifficulty;
  instruments: ScenarioInstrumentInput[];
  window_from: string;
  window_to: string;
  published: boolean;
  synthetic: boolean;
  plays: number;
  created_at: string;
  updated_at: string;
}

export interface ScenarioInput {
  title: string;
  description: string;
  briefing: string;
  debrief: string;
  difficulty: ScenarioDifficulty;
  instruments: ScenarioInstrumentInput[];
  /** ISO 8601 */
  window_from: string;
  window_to: string;
}

/** Yayın (OBS) bağlantısı */
export interface BroadcastToken {
  token: string;
  overlay_path: string;
}

/* ------------------------------------------- Haftalık Seçim (Kitlelerin Bilgeliği) */

export type PicksWeekPhase = 'upcoming' | 'submit' | 'revealed' | 'live' | 'settling' | 'finished';

/** GET /admin/picks/weeks satırı */
export interface AdminPicksWeek {
  week_id: string;
  phase: PicksWeekPhase;
  opens_at: string;
  reveal_at: string;
  starts_at: string;
  ends_at: string;
  participants: number;
  void_picks: number;
  notes_hidden: number;
  comments: number;
  comments_deleted: number;
  bullish_pct: number | null;
  crowd_return_pct: number | null;
  /** Kitle portföyü katılımcıların yüzde kaçından iyi */
  beat_pct: number | null;
  winner: { username: string; return_pct: number | null } | null;
  settled_at: string | null;
  rewarded_at: string | null;
}

/** GET /admin/picks/comments satırı (silinenler dahil) */
export interface AdminPicksComment {
  id: string;
  week_id: string;
  username: string;
  text: string;
  created_at: string;
  deleted: boolean;
  deleted_at: string | null;
  deleted_by_username: string | null;
}

/** Haftanın bir seçimi (oyuncu uç noktasından; not gizleme için) */
export interface AdminWeekPick {
  id: string;
  username: string;
  asset_type: string;
  symbol: string;
  name: string;
  direction: 'up' | 'down';
  note: string | null;
  /** Not yönetici tarafından gizlendi */
  note_hidden: boolean;
  status: string;
  return_pct: number | null;
  rank: number | null;
}
