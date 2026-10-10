import type { AssetType } from '@portfoygo/shared/types';

export { ASSET_TYPE_LABELS, type AssetType } from '@portfoygo/shared/types';

/* ---------- Backend'den gelen ham piyasa verileri ---------- */

export interface StockQuote {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
}

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  total_volume: number;
}

export interface RateQuote {
  code: string;
  name: string;
  buying: number;
  selling: number;
  price?: number;
  change_rate: number;
  datetime?: string;
}

/* ---------- UI'nin kullandığı normalize edilmiş varlık modeli ---------- */

export interface MarketAsset {
  /** `${type}:${symbol}` — listelerde benzersiz anahtar */
  key: string;
  type: AssetType;
  /** Her zaman büyük harf (BTC, AAPL, USD, GOLD) */
  symbol: string;
  name: string;
  /** Türk lirası birim fiyatı; kur bilinmiyorsa null */
  priceTRY: number | null;
  /** Varlığın kendi kotasyonu USD ise USD fiyatı */
  priceUSD: number | null;
  changePercent: number;
  image?: string;
  /** CoinGecko id (kripto grafiği için) */
  coinId?: string;
  volume?: number;
  marketCap?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
}

/* ---------- Kullanıcı / portföy ---------- */

export interface User {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  balance: number;
  portfolio_value: number;
  total_profit_loss: number;
  rank: number | null;
  created_at: string;
  is_admin?: boolean;
}

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  profitLoss: number;
  profitLossPercent: number;
}

export interface Transaction {
  id: string;
  type: 'buy' | 'sell';
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  price: number;
  totalAmount: number;
  commission: number;
  netAmount: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id?: string;
  username: string;
  balance: number;
  portfolio_value: number;
  total_value?: number;
  total_profit_loss: number;
  profit_loss_percent: number;
  week_profit_loss_tl?: number;
  board?: 'alltime' | 'week';
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  categories: string[];
  description: string;
  image?: string;
  creator?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned?: boolean;
  earned_at?: string;
}

export interface StopLossOrder {
  id: string;
  portfolio_item_id: string;
  symbol: string;
  name?: string;
  trigger_price: number;
  quantity: number;
  status: string;
  created_at: string;
}

/* ---------- Sezonlar (aylık, getiri bazlı) ---------- */

export type SeasonStatus = 'active' | 'finished';

export interface Season {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: SeasonStatus;
}

/** Oturumdaki kullanıcının sezondaki durumu (sezona henüz kaydolmadıysa null). */
export interface SeasonMe {
  rank: number | null;
  /** Yüzde (12.5 = %12,5) */
  return_pct: number;
  baseline_equity: number;
  equity: number;
  profit_tl: number;
  joined_at: string;
}

export interface CurrentSeason {
  season: Season | null;
  participants: number;
  me: SeasonMe | null;
}

export interface SeasonEntry {
  rank: number;
  user_id: string;
  username: string;
  baseline_equity: number;
  equity: number;
  return_pct: number;
  profit_tl: number;
  is_me: boolean;
}

export interface SeasonLeaderboard {
  season: Season | null;
  entries: SeasonEntry[];
  total: number;
}

export interface SeasonWinner {
  rank: number;
  username: string;
  return_pct: number;
  title: string;
}

export interface SeasonSummary {
  season: Season;
  participants: number;
  winners: SeasonWinner[];
}

export interface SeasonAward {
  season_slug: string;
  season_name: string;
  rank: number;
  title: string;
  return_pct: number;
  awarded_at: string;
}

/* ---------- Özel ligler ---------- */

export type LeagueRole = 'owner' | 'member';
export type LeagueStatus = 'upcoming' | 'active' | 'finished';
export type LeagueVisibility = 'private' | 'public';
/** Lig süresi ön ayarları (backend sözleşmesi); 'none' = süresiz. */
export type LeagueDuration = '1d' | '3d' | '1w' | '2w' | '1m' | '3m' | 'none';

export interface League {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  owner_username: string;
  role: LeagueRole;
  /** Detayda: görüntüleyen üye mi (herkese açık liglerde üye olmayan da görebilir). */
  is_member: boolean;
  visibility: LeagueVisibility;
  status: LeagueStatus;
  /** Planlanan başlangıç (ISO); eski ligler için null */
  starts_at: string | null;
  /** Gerçek başlangıç anı (başlangıç değerleri o an alınır) */
  started_at: string | null;
  ends_at: string | null;
  /** Sonuçların dondurulduğu an */
  finalized_at: string | null;
  member_count: number;
  max_members: number;
  my_rank: number | null;
  my_return_pct: number | null;
  my_final_rank: number | null;
  created_at: string;
}

export interface LeaguePreview {
  id: string | null;
  name: string;
  description: string | null;
  owner_username: string;
  member_count: number;
  max_members: number;
  visibility: LeagueVisibility;
  status: LeagueStatus;
  starts_at: string | null;
  ends_at: string | null;
  already_member: boolean;
}

export interface LeagueMember {
  /** "upcoming" iken null; "finished" iken dondurulmuş sıra */
  rank: number | null;
  user_id: string;
  username: string;
  role: LeagueRole;
  /** Başlangıç değeri alınana kadar null */
  baseline_equity: number | null;
  equity: number;
  return_pct: number | null;
  profit_tl: number | null;
  baseline_set: boolean;
  final_rank: number | null;
  final_return_pct: number | null;
  joined_at: string;
  is_me: boolean;
}

export interface LeagueDetail {
  league: League & { owner_id: string };
  members: LeagueMember[];
}

/** Keşfet listesindeki herkese açık lig. */
export interface PublicLeague {
  id: string;
  name: string;
  description: string | null;
  owner_username: string;
  member_count: number;
  max_members: number;
  status: LeagueStatus;
  starts_at: string | null;
  ends_at: string | null;
  is_member: boolean;
}

export interface PublicLeaguePage {
  items: PublicLeague[];
  total: number;
  limit: number;
  offset: number;
}

/** Keşfet filtresi: "open" = katılıma açık (başlamamış ya da devam eden, dolu olmayan). */
export type PublicLeagueFilter = 'open' | 'upcoming' | 'active' | 'finished';

export interface LeagueFeedItem {
  id: string;
  user_id: string;
  username: string;
  type: 'buy' | 'sell';
  symbol: string;
  asset_type: string;
  created_at: string;
}

export interface CreateLeagueRequest {
  name: string;
  description?: string;
  visibility?: LeagueVisibility;
  /** ISO; verilmezse lig hemen başlar */
  starts_at?: string;
  /** Verilmezse süresiz */
  duration?: Exclude<LeagueDuration, 'none'>;
}

/** Tarihler yalnızca lig başlamadan değiştirilebilir; süreli lig süresize çevrilemez. */
export interface UpdateLeagueRequest {
  name?: string;
  description?: string | null;
  visibility?: LeagueVisibility;
  starts_at?: string;
  duration?: Exclude<LeagueDuration, 'none'>;
}

/* ------------------------------------------------------------------ */
/* Arena: kısa süreli hızlı al-sat turları ve canlı meydan okumalar     */
/* ------------------------------------------------------------------ */

/** Arena enstrümanı (ör. EURUSD, XAUUSD, BRENT, BTCUSD). */
export interface ArenaInstrument {
  code: string;
  label: string;
  /** Fiyat ondalık hanesi */
  decimals: number;
  /** Kullanıcıya gösterilen makas metni (ör. "0,8 pip") */
  spread_display: string;
  /** Şu an turda kullanılabilir mi */
  available: boolean;
}

export type ArenaRoundInstrument = Pick<ArenaInstrument, 'code' | 'label' | 'decimals'>;

export interface ArenaQuote {
  bid: number;
  ask: number;
  mid: number;
  /** Tur başından bu yana değişim (yüzde) */
  change_pct_since_start: number;
}

export type ArenaRoundKind = 'solo' | 'challenge';
export type ArenaRoundStatus = 'scheduled' | 'running' | 'finished';
export type ArenaSide = 'long' | 'short';
export type ArenaCloseReason = 'manual' | 'sl' | 'tp' | 'liquidated' | 'round_end';

export interface ArenaReveal {
  /** Tekrarı oynatılan gerçek veri penceresi (ISO) */
  from: string;
  to: string;
  /** Enstrüman bazında pencereler (farklı olabilir) */
  instruments?: Record<string, { from: string; to: string }>;
}

export interface ArenaRound {
  id: string;
  kind: ArenaRoundKind;
  status: ArenaRoundStatus;
  starts_at: string;
  ends_at: string;
  duration_s: number;
  /** Sunucu saati (ISO) — istemci saat farkını hesaplamak için */
  server_now: string;
  tick: number;
  ticks_total: number;
  instruments: ArenaRoundInstrument[];
  challenge?: { id: string; title: string; sponsor: string | null; prize_text: string | null } | null;
  /** Yalnızca tur bittikten sonra */
  reveal?: ArenaReveal | null;
  /** Tur iptal edildi (ör. meydan okuma yayından kaldırıldı); durum "finished" olarak ele alınır */
  cancelled?: boolean;
}

export interface ArenaMe {
  joined: boolean;
  cash: number;
  equity: number;
  return_pct: number;
  rank: number | null;
  trades_count: number;
}

export interface ArenaPosition {
  id: string;
  instrument: string;
  side: ArenaSide;
  qty: number;
  /** Yatırılan tutar (USD) */
  amount: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'open' | 'closed';
  current_price: number | null;
  pnl: number;
  pnl_pct: number;
  close_price: number | null;
  close_reason: ArenaCloseReason | null;
  opened_at: string;
  closed_at: string | null;
}

export interface ArenaLeaderboardRow {
  rank: number;
  username: string;
  return_pct: number;
  equity: number | null;
  is_me: boolean;
}

export interface ArenaRoundState {
  round: ArenaRound;
  me: ArenaMe;
  quotes: Record<string, ArenaQuote>;
  /** Enstrüman → orta fiyat geçmişi (en eskiden en yeniye) */
  history: Record<string, number[]>;
  /** `history` dizilerinin tick numaraları (yoksa son tick'e hizalı ardışık kabul edilir) */
  history_ticks?: number[];
  positions: { open: ArenaPosition[]; closed: ArenaPosition[] };
  leaderboard?: ArenaLeaderboardRow[];
}

export interface ArenaFinal {
  equity: number;
  return_pct: number;
  rank: number | null;
  participants: number | null;
  trades_count: number;
}

export interface ArenaHistoryItem {
  round_id: string;
  kind: ArenaRoundKind;
  challenge_title: string | null;
  duration_s: number;
  return_pct: number;
  equity_final: number;
  rank: number | null;
  trades_count: number;
  finished_at: string;
}

export interface ArenaHistoryStats {
  rounds: number;
  best_return_pct: number | null;
  avg_return_pct: number | null;
  /** 0–100 */
  win_rate: number | null;
}

export interface ArenaHistoryPage {
  items: ArenaHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  stats: ArenaHistoryStats;
}

export type ArenaLeaderPeriod = 'day' | 'week';

export interface ArenaLeader {
  rank: number;
  username: string;
  return_pct: number;
  rounds: number;
  is_me?: boolean;
}

export interface ArenaLeadersPage {
  items: ArenaLeader[];
  me: ArenaLeader | null;
}

export type ArenaChallengeStatus = 'upcoming' | 'live' | 'finished';

export interface ArenaChallenge {
  id: string;
  title: string;
  description: string | null;
  sponsor: string | null;
  prize_text: string | null;
  starts_at: string;
  duration_s: number;
  instruments: string[];
  status: ArenaChallengeStatus;
  participants: number;
  joined: boolean;
  round_id: string | null;
  /** Başlangıç bakiyesi (USD, sanal) */
  starting_cash: number;
}

/* ---------- Portföy Sihirbazı (risk profili → kişisel dağılım önerisi) ---------- */

/** Varlık sınıfı kimlikleri (backend sözleşmesi). Bilinmeyen sınıflar da metin olarak taşınır. */
export type AdvisorClassId = 'cash_try' | 'usd' | 'eur' | 'gold' | 'us_stocks' | 'crypto' | (string & {});

export interface AdvisorOption {
  id: string;
  label: string;
}

export interface AdvisorQuestion {
  id: string;
  text: string;
  help: string | null;
  options: AdvisorOption[];
}

export interface AdvisorProfileDef {
  id: string;
  label: string;
  description: string;
  /** Yıllık volatilite bandı (kesir, 0..1) */
  vol_band: [number, number];
}

export interface AdvisorQuestionnaire {
  version: string;
  questions: AdvisorQuestion[];
  profiles: AdvisorProfileDef[];
}

export interface AdvisorProfileInfo extends AdvisorProfileDef {
  /** Sınıf bazlı alt/üst sınırlar (backend biçimi; yalnızca bilgi amaçlı) */
  constraints: unknown;
}

export interface AdvisorProfileResult {
  id: string;
  score: number;
  max_score: number;
  profile: AdvisorProfileInfo;
  created_at: string;
}

export type AdvisorDataQuality = 'prior' | 'mixed' | 'historical';

export interface AdvisorInstrument {
  symbol: string;
  asset_type: AssetType;
  name: string;
  /** Sınıf içindeki pay (kesir, 0..1) */
  weight: number;
}

export interface AdvisorAllocation {
  class: AdvisorClassId;
  label: string;
  /** Portföy içindeki ağırlık (kesir) */
  weight: number;
  expected_return: number;
  volatility: number;
  instruments: AdvisorInstrument[];
}

export interface AdvisorMetrics {
  expected_return: number;
  volatility: number;
  sharpe: number;
  /** %95 güvenle bir yılda beklenen en kötü kayıp (kesir, pozitif = kayıp) */
  var95: number;
  prob_loss: number;
  max_drawdown_median: number;
  max_drawdown_p95: number;
}

export interface AdvisorSimulation {
  /** Ay numaraları (0 = bugün) */
  months: number[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
}

export interface AdvisorFrontierPoint {
  volatility: number;
  expected_return: number;
}

export interface AdvisorDrift {
  class: AdvisorClassId;
  target: number;
  current: number;
  diff: number;
}

export interface AdvisorPlan {
  id: string;
  profile: AdvisorProfileDef;
  horizon_months: number;
  amount_try: number;
  data_quality: AdvisorDataQuality;
  allocation: AdvisorAllocation[];
  metrics: AdvisorMetrics;
  simulation: AdvisorSimulation;
  frontier: AdvisorFrontierPoint[];
  explanation: string[];
  current: { allocation_by_class: { class: AdvisorClassId; weight: number }[]; drift: AdvisorDrift[] };
  disclaimer: string | null;
  created_at: string;
  applied_at: string | null;
}

export interface AdvisorPlanSummary {
  id: string;
  profile: AdvisorProfileDef;
  created_at: string;
  applied_at: string | null;
  metrics: AdvisorMetrics;
}

export interface AdvisorPlanRequest {
  profile_id?: string;
  profile_override?: string;
  /** 6..60 */
  horizon_months?: number;
  amount_try?: number;
}

export interface AdvisorApplyResult {
  executed: { symbol: string; asset_type: AssetType; quantity: number; price: number; amount: number }[];
  skipped: { symbol: string; reason: string }[];
  spent: number;
  remaining_cash: number;
}
