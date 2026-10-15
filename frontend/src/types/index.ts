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

export type ArenaRoundKind = 'solo' | 'challenge' | 'duel' | 'scenario';
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

// ---------------------------------------------------------------------------
// Arena koçu (tur sonu değerlendirmesi)
// ---------------------------------------------------------------------------

export type CoachGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type CoachInsightType = 'good' | 'tip' | 'warning';

export interface CoachInsight {
  type: CoachInsightType;
  code: string;
  title: string;
  /** Gözlem + öneri */
  detail: string;
  /** "Neden önemli?" kısa açıklaması */
  why: string | null;
  /** İlgili pozisyon kimlikleri */
  refs: string[];
}

export interface CoachTradeRef {
  id: string | null;
  /** Enstrüman kodu (ör. XAUUSD) */
  instrument: string | null;
  side: string | null;
  pnl: number;
  return_pct: number | null;
}

/** Puan bileşenleri (en fazla: risk 35, disiplin 20, kalite 20, sonuç 25) */
export interface CoachBreakdown {
  risk: number;
  discipline: number;
  quality: number;
  result: number;
}

export interface CoachStats {
  trades: number;
  wins: number;
  losses: number;
  /** 0..100 */
  win_rate: number;
  avg_hold_s: number;
  sl_usage_pct: number;
  tp_usage_pct: number;
  best_trade: CoachTradeRef | null;
  worst_trade: CoachTradeRef | null;
  max_drawdown_pct: number;
  trades_per_min: number;
  /** Enstrüman kodları */
  instruments_used: string[];
  total_pnl: number | null;
  return_pct: number | null;
}

export interface CoachReportData {
  /** 0..100 */
  score: number;
  grade: CoachGrade;
  /** Koçun tek cümlelik özeti */
  headline: string | null;
  insights: CoachInsight[];
  stats: CoachStats;
  breakdown: CoachBreakdown | null;
}

/* ---------- Oyun ekonomisi: çark, görevler, mağaza, sıralama, sorumlu oyun ---------- */

export type GameRewardKind = 'coins' | 'xp' | 'spin' | 'cosmetic';

/** Sunucunun verdiği ödül (çark, görev). Alanlar yalnızca ilgiliyse dolu gelir. */
export interface GameReward {
  coins?: number;
  xp?: number;
  extra_spin?: number;
  item_id?: string | null;
  /** Kozmetik zaten sahipliyse jetona çevrilen miktar */
  converted_coins?: number;
}

export interface GameWheelSegment {
  id: string;
  label: string;
  kind: GameRewardKind;
  amount: number | null;
  item_id: string | null;
  /** 0..100 (tüm dilimlerin toplamı ≈ 100) */
  probability_pct: number;
}

export interface GameWheelState {
  segments: GameWheelSegment[];
  free_available: boolean;
  extra_spins: number;
  /** Sonraki ücretsiz çevirme (ISO); hakkı varsa null olabilir */
  next_free_at: string | null;
  disclaimer: string | null;
}

export interface GameWheelSpinResult {
  segment_index: number;
  segment: GameWheelSegment;
  reward: GameReward;
}

export interface GameQuest {
  key: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: { coins: number; xp: number };
  completed: boolean;
  claimed: boolean;
}

export interface GameQuestList {
  /** İstanbul günü 'YYYY-MM-DD' */
  day: string;
  items: GameQuest[];
}

export type GameShopKind = 'avatar' | 'frame' | 'title';
export type GameRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type GameUnlockType = 'coins' | 'tier' | 'wheel' | 'default';

export interface GameShopItem {
  id: string;
  kind: GameShopKind;
  name: string;
  /** Jetonla satılmıyorsa null */
  price_coins: number | null;
  rarity: GameRarity;
  owned: boolean;
  equipped: boolean;
  unlock: { type: GameUnlockType; value: string | number | null };
}

export type GameLeaderboardType = 'rating' | 'level';

export interface GameLeaderboardRow {
  rank: number;
  username: string;
  avatar_id: string | null;
  frame_id: string | null;
  /** Puan (rating) veya seviye/XP — sıralama türüne göre */
  value: number;
  tier: string | null;
  level: number | null;
}

export interface GameLeaderboard {
  items: GameLeaderboardRow[];
  /** Oturum açık kullanıcı; sıralamaya girmediyse rank null */
  me: (Omit<GameLeaderboardRow, 'rank'> & { rank: number | null }) | null;
}

export interface GameLedgerEntry {
  coins: number;
  xp: number;
  reason: string;
  created_at: string;
}

export interface GameLedgerPage {
  items: GameLedgerEntry[];
  total: number;
}

export type GameSessionReminderMinutes = 15 | 30 | 60;
export type GameBreakDuration = '24h' | '7d';

/** Kullanıcının değiştirebildiği sorumlu oyun ayarları */
export interface GameResponsibleSettings {
  /** 5..50 tur / gün; null = sınırsız */
  daily_round_limit: number | null;
  session_reminder_minutes: GameSessionReminderMinutes | null;
}

/** Profilde (ve GET /game/responsible) gelen sorumlu oyun durumu */
export interface GameResponsibleState extends GameResponsibleSettings {
  adult_confirmed: boolean;
  /** Mola bitişi (ISO); mola yoksa null */
  break_until: string | null;
  /** Arka arkaya zararla biten tur sayısı */
  loss_streak: number;
  /** Bugün oynanan tur sayısı (biliniyorsa) */
  rounds_today: number | null;
}

export interface GameDuelRecord {
  wins: number;
  losses: number;
  draws: number;
}

/* ---------- Oyun profili, düello / eşleşme ve yayın (arena sosyal) ---------- */

export interface GameTier {
  id: string;
  label: string;
  /** Kademenin başladığı puan */
  min: number;
  /** Sonraki kademenin başladığı puan (en üst kademede null) */
  next_min: number | null;
}

export interface GameProfile {
  coins: number;
  xp: number;
  level: number;
  level_progress: { xp_in_level: number; needed: number; /** 0..100 */ pct: number };
  rating: number;
  tier: GameTier;
  streak: { current: number; best: number; today_done: boolean };
  /** 'avatar-1' … 'avatar-12' */
  avatar_id: string;
  frame_id: string | null;
  title: string | null;
  spins: { free_available: boolean; extra: number; next_free_at: string | null };
  quests: { unclaimed: number; completed_today: number; total_today: number };
  responsible: GameResponsibleState;
}

export interface GamePublicProfile {
  username: string;
  avatar_id: string;
  frame_id: string | null;
  title: string | null;
  level: number;
  rating: number;
  tier: GameTier | null;
  record: GameDuelRecord | null;
}

export type ArenaDuelStatus = 'waiting' | 'matched' | 'running' | 'finished' | 'expired' | 'cancelled';
export type ArenaDuelResult = 'win' | 'loss' | 'draw';

export interface ArenaDuelPlayer {
  username: string;
  avatar_id: string | null;
  is_bot: boolean;
  rating: number | null;
}

export interface ArenaDuel {
  id: string;
  code: string;
  status: ArenaDuelStatus;
  creator: ArenaDuelPlayer;
  opponent: ArenaDuelPlayer | null;
  duration_s: number;
  instruments: string[];
  round_id: string | null;
  starts_at: string | null;
  expires_at: string | null;
  /** İzleyicinin rolü (davet eden / rakip / bağlantıyla bakan) */
  viewer_role: 'creator' | 'opponent' | null;
  /** Kazananın kullanıcı adı (bittiyse ve berabere değilse) */
  winner: string | null;
  is_draw: boolean;
}

export interface ArenaDuelInvite {
  duel: ArenaDuel;
  code: string;
  /** Uygulama içi yol (ör. /oyun/duello/AB12CD) */
  invite_path: string;
}

export interface ArenaDuelHistoryItem {
  id: string;
  code: string;
  status: ArenaDuelStatus;
  /** Davet henüz kabul edilmediyse null */
  opponent: ArenaDuelPlayer | null;
  result: ArenaDuelResult | null;
  my_return_pct: number | null;
  opponent_return_pct: number | null;
  duration_s: number;
  created_at: string;
  round_id: string | null;
}

export interface ArenaDuelHistory {
  items: ArenaDuelHistoryItem[];
  record: GameDuelRecord;
  total: number;
}

export type ArenaMatchStatus = 'searching' | 'matched' | 'cancelled' | 'expired';

export interface ArenaMatchTicket {
  ticket: string;
  status: ArenaMatchStatus;
  searching_for_s: number;
  duel_id: string | null;
  /** Eşleşen düellonun kodu */
  code: string | null;
  round_id: string | null;
  starts_at: string | null;
  opponent: ArenaDuelPlayer | null;
}

/** Düello turunda rakibin canlı durumu */
export interface ArenaRoundDuel {
  id: string;
  code: string | null;
  opponent: ArenaDuelPlayer;
  opponent_equity: number | null;
  opponent_return_pct: number | null;
  /** Tur bittiyse sonuç (izleyiciye göre) */
  result: ArenaDuelResult | null;
}

/** Senaryo turu bilgisi */
export interface ArenaRoundScenario {
  id: string;
  title: string;
  briefing: string | null;
  synthetic: boolean;
}

/** Turda gelen emoji tepkisi (istemcide kimliklendirilir) */
export interface ArenaReaction {
  id: string;
  emoji: string;
  username: string;
}

export interface ArenaHostMessage {
  text: string;
  at: string;
}

// Arena tur durumuna düello / senaryo eklentileri (arayüz birleştirme)
export interface ArenaRoundState {
  duel?: ArenaRoundDuel | null;
  scenario?: ArenaRoundScenario | null;
}
export interface ArenaRound {
  /** Tur sonu açıklaması (senaryolarda) */
  debrief?: string | null;
}

export interface ArenaBroadcastRow {
  rank: number;
  username: string;
  return_pct: number;
  equity: number | null;
}

export interface ArenaBroadcastTrade {
  id: string;
  username: string;
  instrument: string;
  side: ArenaSide;
  at: string;
}

export interface ArenaBroadcastState {
  challenge: { id: string; title: string; sponsor: string | null; prize_text: string | null };
  status: ArenaChallengeStatus;
  round: { starts_at: string; ends_at: string; tick: number; ticks_total: number } | null;
  leaderboard: ArenaBroadcastRow[];
  recent_trades: ArenaBroadcastTrade[];
  messages: ArenaHostMessage[];
  participants: number;
  /** Sunucu saati (saat farkı için) */
  server_now: string | null;
}

// ---------------------------------------------------------------------------
// Yatırım İmparatorluğu (idle / tycoon)
// ---------------------------------------------------------------------------

export type IdleBuildingId = 'kumbara' | 'doviz' | 'altin' | 'hisse' | 'kripto' | 'holding';
export type IdleBuyQuantity = 1 | 10 | 'max';

/** Binanın bugünkü piyasa bağı (gerçek piyasa hareketi geliri çarpar) */
export interface IdleMarketLink {
  asset_type: string;
  symbol: string;
  label: string;
  /** Günlük değişim (yüzde); veri yoksa null */
  change_pct: number | null;
  /** Gelir çarpanı (ör. 1,07) */
  multiplier: number;
  /** 'veri yok' | 'veri eski' (çarpan 1'e düşürüldüyse) */
  reason?: string | null;
  /** Sunucunun hazır cümlesi: "Bugün altın %1,2 yükseldi → Altın Madeni ×1,07" */
  headline?: string | null;
  /** Son verinin günü (YYYY-MM-DD) */
  as_of?: string | null;
}

export interface IdleBuilding {
  id: string;
  name: string;
  description: string;
  owned: number;
  next_cost: number;
  cost_x10: number;
  max_affordable: number;
  /** max_affordable adedin toplam fiyatı */
  cost_max: number | null;
  income_each: number;
  income_total: number;
  multiplier: number;
  /** Bir sonraki ×2 adet eşiği (yoksa null) */
  milestone_next: number | null;
  unlocked: boolean;
  market: IdleMarketLink | null;
  art_key: string;
}

export interface IdleUpgrade {
  id: string;
  building_id: string | null;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
  /** Gereksinimler sağlanıyor ve alınmamış (nakit hariç) */
  available: boolean;
  /** Gereksinim metni (ör. "10 Kumbara") */
  requirement_text?: string | null;
}

export interface IdlePrestige {
  shares: number;
  bonus_pct: number;
  available: boolean;
  shares_on_reset: number;
  threshold: number;
  /** Halka arz sonrası toplam bonus (yüzde) */
  bonus_after_pct: number | null;
  count: number;
}

export interface IdleBoosts {
  compound_pct: number;
  diversification_pct: number;
  diversification_active: boolean;
  types_owned: number;
  prestige_pct: number;
  global_multiplier: number;
}

export interface IdleOffline {
  earned: number;
  seconds: number;
  capped: boolean;
}

export interface IdleMilestone {
  /** Toplam kazanç eşiği */
  at: number;
  reached: boolean;
  reward: { coins: number; xp: number };
}

export interface IdleState {
  server_now: string;
  cash: number;
  total_earned: number;
  income_per_sec: number;
  tap_value: number;
  buildings: IdleBuilding[];
  upgrades: IdleUpgrade[];
  prestige: IdlePrestige;
  offline: IdleOffline | null;
  milestones: IdleMilestone[];
  tips: string[];
  boosts: IdleBoosts | null;
  /** Çevrimdışı kazanç sınırı (sn) */
  offline_cap_s: number | null;
  /** Bu istekte verilen kilometre taşı ödülleri */
  rewards_granted: { at: number; coins: number; xp: number }[];
}

export interface IdleLeaderboardRow {
  rank: number;
  username: string;
  total_earned: number;
  prestige_shares: number;
}

export interface IdleLeaderboard {
  items: IdleLeaderboardRow[];
  me: IdleLeaderboardRow | null;
}

// ---------------------------------------------------------------------------
// Arena senaryoları (tarihsel / sentetik veriyle hazır turlar)
// ---------------------------------------------------------------------------

export type ScenarioDifficulty = 'kolay' | 'orta' | 'zor';

export interface ArenaScenario {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: ScenarioDifficulty;
  instruments: { code: string; label: string }[];
  /** Sentetik eğitim verisi (gerçek piyasa verisi değil) */
  synthetic: boolean;
  plays: number;
  my_best_return_pct: number | null;
}

/** Senaryo ayrıntısı: brifing ve (oynandıysa) "Ne oldu?" metni */
export interface ArenaScenarioDetail extends ArenaScenario {
  briefing: string;
  /** Yalnızca kullanıcı senaryoyu en az bir kez bitirdiyse */
  debrief: string | null;
}

/** Geçmişteki bir senaryo turu */
export interface RecentScenarioRound {
  round_id: string;
  duration_s: number;
  return_pct: number;
  trades_count: number;
  finished_at: string | null;
}

/** Bir senaryo turunun brifing / "Ne oldu?" bilgisi */
export interface ScenarioRoundInfo {
  round_id: string;
  status: string;
  finished: boolean;
  scenario: { id: string; title: string; briefing: string; synthetic: boolean } | null;
  debrief: string | null;
  return_pct: number | null;
  duration_s: number;
  window: { from: string; to: string } | null;
}

// ---------------------------------------------------------------------------
// Haftalık Seçim — Kitlelerin Bilgeliği (haftalık kör seçim yarışması)
// ---------------------------------------------------------------------------

/**
 * Hafta evresi (İstanbul saati): upcoming → submit (Cmt 00:00 – Paz 15:00, seçimler gizli) →
 * revealed (Paz 15:00 – Pzt 00:00) → live (Pzt 00:00 – Cmt 00:00) → settling → finished.
 */
export type PicksPhase = 'upcoming' | 'submit' | 'revealed' | 'live' | 'settling' | 'finished';
export type PickDirection = 'up' | 'down';

export interface WeeklyPick {
  id: string;
  username: string;
  avatar_id: string | null;
  frame_id: string | null;
  asset_type: AssetType;
  symbol: string;
  name: string;
  direction: PickDirection;
  /** Kısa not (≤ 280); yönetici gizlediyse null */
  note: string | null;
  /** Yönetici notu gizledi (`note` null) */
  note_hidden: boolean;
  submitted_at: string;
  entry_price: number | null;
  current_price: number | null;
  exit_price: number | null;
  /** 'USD' | 'TRY' */
  quote_currency: string;
  /** Yöne göre işaretlenmiş getiri (düşüş seçiminde fiyat düşerse pozitif) */
  return_pct: number | null;
  rank: number | null;
  status: 'active' | 'void';
  /** Geçersizlik nedeni (fiyat verisi yok → sıralama dışı) */
  void_reason: 'no_entry_price' | 'no_exit_price' | null;
  is_me: boolean;
}

export interface PicksCrowdAsset {
  asset_type: AssetType;
  symbol: string;
  name: string;
  picks: number;
  up: number;
  down: number;
  /** Seçenlerin yöne göre ortalama getirisi */
  avg_return_pct: number | null;
  /** Varlığın kendi fiyat değişimi */
  change_pct: number | null;
}

/** Kitlenin ortak kararı (eşit ağırlıklı "kitle portföyü"); yalnızca açılıştan sonra */
export interface PicksCrowd {
  participants: number;
  /** Yükselir diyenlerin yüzdesi (0..100) */
  bullish_pct: number | null;
  crowd_return_pct: number | null;
  /** Kitle portföyü katılımcıların yüzde kaçından daha iyi yaptı */
  beat_pct: number | null;
  top_assets: PicksCrowdAsset[];
}

export interface PicksRewardTier {
  rank: number;
  coins: number;
  xp: number;
}

export interface PicksWeek {
  week_id: string;
  phase: PicksPhase;
  opens_at: string;
  reveal_at: string;
  starts_at: string;
  ends_at: string;
  participants: number;
  my_pick: WeeklyPick | null;
  /** Açılıştan önce her zaman null (başkalarının seçimi gösterilmez) */
  picks: WeeklyPick[] | null;
  crowd: PicksCrowd | null;
  standings_updated_at: string | null;
  my_rank: number | null;
  rewards: { top: PicksRewardTier[]; participation_xp: number };
  /** Tartışmadaki yorum sayısı (açılıştan önce null) */
  comments_count: number | null;
}

/** GET /api/picks/current */
export interface PicksCurrent {
  server_now: string;
  /** Sunucu saati − istemci saati (ms); geri sayımlar sunucu saatine göre */
  clock_offset_ms: number;
  active: PicksWeek;
  previous: PicksWeek | null;
}

export interface PicksWeekSummary {
  week_id: string;
  starts_at: string;
  ends_at: string;
  phase: PicksPhase;
  participants: number;
  winner: { username: string; avatar_id: string | null; return_pct: number | null } | null;
  crowd_return_pct: number | null;
  my: { return_pct: number | null; rank: number | null; status: string } | null;
}

export interface PicksWeekPage {
  items: PicksWeekSummary[];
  total: number;
}

/** GET /api/picks/assets — seçilebilir varlık */
export interface PicksAsset {
  asset_type: AssetType;
  symbol: string;
  name: string;
  price: number | null;
  quote_currency: string;
  change_24h_pct: number | null;
}

export interface PickInput {
  asset_type: AssetType;
  symbol: string;
  direction: PickDirection;
  note?: string;
}

export interface PicksComment {
  id: string;
  username: string;
  avatar_id: string | null;
  text: string;
  created_at: string;
  is_me: boolean;
}

export interface PicksCommentPage {
  items: PicksComment[];
  has_more: boolean;
}
