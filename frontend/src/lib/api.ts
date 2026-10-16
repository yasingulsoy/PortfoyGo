// Frontend'e özgü API uçları. Çekirdek istemci (apiFetch, oturum, CSRF) ortak pakettedir.

import type { AssetType, CreateLeagueRequest, PublicLeagueFilter, UpdateLeagueRequest } from '@/types';
import { ApiError, apiFetch, post, swrFetcher } from '@portfoygo/shared/api';
import {
  toCurrentSeason,
  toLeague,
  toLeagueDetail,
  toLeagueFeed,
  toLeaguePreview,
  toLeagues,
  toPublicLeaguePage,
  toSeasonAwards,
  toSeasonLeaderboard,
  toSeasonSummaries,
  unwrap,
} from './competition';

export { API_BASE_URL, ApiError, apiFetch, session, swrFetcher } from '@portfoygo/shared/api';

export const authApi = {
  login: (email: string, password: string) => apiFetch('/auth/login', { ...post({ email, password }), silent401: true }),
  register: (username: string, email: string, password: string) =>
    apiFetch('/auth/register', post({ username, email, password })),
  profile: (opts: { silent401?: boolean } = {}) => apiFetch('/auth/profile', opts),
  /** Bu tarayıcıdaki oturumu kapatır (çerezleri siler). */
  logout: () => apiFetch('/auth/logout', { ...post({}), silent401: true }),
  /** Tüm cihazlardaki oturumları iptal eder. */
  logoutAll: () => apiFetch('/auth/logout-all', post({})),
  /** Yalnızca yerel geliştirme: şifresiz giriş */
  devLogin: (username: string) => apiFetch('/auth/dev-login', { ...post({ username }), silent401: true }),
};

export const emailApi = {
  sendVerification: () => apiFetch('/email/send-verification', post({})),
  verify: (code: string) => apiFetch('/email/verify', post({ code })),
  sendReset: (email: string) => apiFetch('/email/send-reset', post({ email })),
  resetPassword: (email: string, code: string, newPassword: string) =>
    apiFetch('/email/reset-password', post({ email, code, newPassword })),
};

export interface TradeRequest {
  symbol: string;
  asset_type: AssetType;
  quantity: number;
}

export const transactionApi = {
  buy: (data: TradeRequest) => apiFetch('/transactions/buy', post(data)),
  sell: (data: TradeRequest) => apiFetch('/transactions/sell', post(data)),
};

export const portfolioApi = {
  get: () => apiFetch('/portfolio'),
  transactions: (limit = 50) => apiFetch(`/portfolio/transactions?limit=${limit}`),
};

export const leaderboardApi = {
  list: (limit = 10, board: 'alltime' | 'week' = 'alltime') =>
    apiFetch(`/leaderboard?limit=${limit}&board=${board}`),
  myRank: () => apiFetch('/leaderboard/my-rank'),
};

export const badgesApi = {
  mine: () => apiFetch('/badges/my-badges'),
  all: () => apiFetch('/badges'),
};

export const activityApi = {
  list: (limit = 20, offset = 0, type?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (type) params.set('type', type);
    return apiFetch(`/activity-logs?${params}`);
  },
  types: () => apiFetch('/activity-logs/types'),
};

export const newsApi = {
  list: (limit = 10) => apiFetch(`/news?limit=${limit}`),
};

export const stopLossApi = {
  create: (data: { portfolio_item_id: string; trigger_price: number; quantity: number }) =>
    apiFetch('/stop-loss', post(data)),
  list: () => apiFetch('/stop-loss'),
  cancel: (id: string) => apiFetch(`/stop-loss/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export type HistoryRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

export const historyApi = {
  /** SWR anahtarı (swrFetcher ile kullanılır) */
  key: (range: HistoryRange) => `/portfolio/history?range=${range}`,
};

export const watchlistApi = {
  /** SWR anahtarı (swrFetcher ile kullanılır) */
  key: '/watchlist',
  add: (asset_type: AssetType, symbol: string) =>
    apiFetch('/watchlist', { method: 'POST', body: JSON.stringify({ asset_type, symbol }) }),
  remove: (asset_type: AssetType, symbol: string) =>
    apiFetch(`/watchlist/${encodeURIComponent(asset_type)}/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Bekleyen emirler (limit alış/satış, zarar durdur, kâr al)
// ---------------------------------------------------------------------------

export type OrderSide = 'buy' | 'sell';
/** trailing_stop: takip eden stop (satış) · market_on_open: ABD borsası kapalıyken açılışta gerçekleşen hisse emri */
export type OrderType = 'limit' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'market_on_open';

export interface CreateOrderRequest {
  asset_type: AssetType;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /** limit / stop_loss / take_profit için zorunlu */
  trigger_price?: number;
  /** trailing_stop: yüzde VEYA TL mesafe */
  trail_percent?: number;
  trail_amount?: number;
  /** 1–90 gün; varsayılan 30 (market_on_open'da yok sayılır) */
  expires_in_days?: number;
}

export const ordersApi = {
  create: (data: CreateOrderRequest) => apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) }),
  list: (status: 'active' | 'history' | 'all' = 'active') => apiFetch(`/orders?status=${status}`),
  cancel: (id: string) => apiFetch(`/orders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Yalnızca takip eden stop: mesafe (yüzde VEYA TL) */
  update: (id: string, data: { trail_percent?: number; trail_amount?: number }) =>
    apiFetch(`/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ---------------------------------------------------------------------------
// Sezonlar (aylık, getiri bazlı sıralama) ve özel ligler
// ---------------------------------------------------------------------------

export const seasonsApi = {
  /** Aktif sezon; oturum açıksa `me` alanı dolu gelir. */
  current: () => apiFetch('/seasons/current').then((r) => toCurrentSeason(unwrap(r))),
  leaderboard: (slug: string, limit = 50, offset = 0) =>
    apiFetch(`/seasons/${encodeURIComponent(slug)}/leaderboard?limit=${limit}&offset=${offset}`).then((r) =>
      toSeasonLeaderboard(unwrap(r), offset),
    ),
  /** En yeniden eskiye sezonlar ve kazananları. */
  list: (limit = 12) => apiFetch(`/seasons?limit=${limit}`).then((r) => toSeasonSummaries(unwrap(r))),
  myAwards: () => apiFetch('/seasons/me/awards').then((r) => toSeasonAwards(unwrap(r))),
};

export const leaguesApi = {
  list: () => apiFetch('/leagues').then((r) => toLeagues(unwrap(r))),
  create: (data: CreateLeagueRequest) => apiFetch('/leagues', post(data)).then((r) => toLeague(unwrap(r))),
  preview: (code: string) =>
    apiFetch(`/leagues/preview?code=${encodeURIComponent(code)}`).then((r) => toLeaguePreview(unwrap(r))),
  join: (code: string) => apiFetch('/leagues/join', post({ code })).then((r) => toLeague(unwrap(r))),
  get: (id: string) => apiFetch(`/leagues/${encodeURIComponent(id)}`).then((r) => toLeagueDetail(unwrap(r))),
  leave: (id: string) => apiFetch(`/leagues/${encodeURIComponent(id)}/leave`, post({})),
  regenerateCode: (id: string) =>
    apiFetch(`/leagues/${encodeURIComponent(id)}/invite-code`, post({})).then((r) => String(unwrap<any>(r)?.invite_code ?? '')),
  removeMember: (id: string, userId: string) =>
    apiFetch(`/leagues/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  remove: (id: string) => apiFetch(`/leagues/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Kurucu: ad/açıklama/görünürlük; tarihler yalnızca lig başlamadan. */
  update: (id: string, data: UpdateLeagueRequest) =>
    apiFetch(`/leagues/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }).then((r) => toLeague(unwrap(r))),
  /** Herkese açık ligler (Keşfet). */
  discover: (q: { search?: string; status?: PublicLeagueFilter; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams();
    if (q.search) params.set('search', q.search);
    if (q.status) params.set('status', q.status);
    params.set('limit', String(q.limit ?? 12));
    params.set('offset', String(q.offset ?? 0));
    return apiFetch(`/leagues/public?${params}`).then((r) => toPublicLeaguePage(unwrap(r)));
  },
  joinPublic: (id: string) => apiFetch(`/leagues/${encodeURIComponent(id)}/join-public`, post({})).then((r) => toLeague(unwrap(r))),
  /** Üyelerin son alım/satımları (yalnızca üyeler). */
  feed: (id: string, limit = 30) => apiFetch(`/leagues/${encodeURIComponent(id)}/feed?limit=${limit}`).then((r) => toLeagueFeed(unwrap(r))),
};

// ---------------------------------------------------------------------------
// Piyasa fiyat geçmişi (grafik), performans ve mini grafikler (herkese açık uçlar)
// ---------------------------------------------------------------------------

/** Grafik aralıkları (backend sözleşmesi). */
export type MarketRange = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export interface MarketHistoryPoint {
  /** Unix saniye */
  t: number;
  /** Varlığın kendi kotasyon para birimindeki fiyat */
  v: number;
}

export interface MarketHistory {
  symbol: string;
  type: AssetType;
  /** `points` değerlerinin para birimi (varlığın kendi kotasyonu) */
  currency: 'USD' | 'TRY';
  points: MarketHistoryPoint[];
  first: number | null;
  last: number | null;
  change: number | null;
  changePercent: number | null;
}

export type PerformancePeriod = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';
/** Dönemsel getiri (yüzde); veri yoksa null. */
export type MarketPerformance = Record<PerformancePeriod, number | null>;
/** `${type}:${SYMBOL}` → kapanış serisi (son 7 gün) */
export type Sparklines = Record<string, number[]>;

/** Sparkline isteği başına en fazla öğe (backend sınırı). */
export const SPARKLINE_BATCH = 60;

const marketQuery = (type: AssetType, symbol: string) =>
  `type=${encodeURIComponent(type)}&symbol=${encodeURIComponent(symbol.toUpperCase())}`;

/** 404 (uç henüz yok / varlık desteklenmiyor) hata değil, "veri yok" sayılır. */
async function orNullOn404<T>(endpoint: string): Promise<T | null> {
  try {
    return await swrFetcher<T>(endpoint);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const marketHistoryApi = {
  historyKey: (type: AssetType, symbol: string, range: MarketRange) => `/market/history?${marketQuery(type, symbol)}&range=${range}`,
  history: (type: AssetType, symbol: string, range: MarketRange) =>
    orNullOn404<MarketHistory>(marketHistoryApi.historyKey(type, symbol, range)),
  performanceKey: (type: AssetType, symbol: string) => `/market/performance?${marketQuery(type, symbol)}`,
  performance: (type: AssetType, symbol: string) => orNullOn404<MarketPerformance>(marketHistoryApi.performanceKey(type, symbol)),
  /** items: `${type}:${SYMBOL}` (en fazla SPARKLINE_BATCH) */
  sparklinesKey: (items: string[]) =>
    `/market/sparklines?items=${items
      .map((i) => {
        const [type, symbol = ''] = i.split(':');
        return `${encodeURIComponent(type)}:${encodeURIComponent(symbol)}`;
      })
      .join(',')}`,
  sparklines: (items: string[]) => orNullOn404<Sparklines>(marketHistoryApi.sparklinesKey(items)),
};

/* ------------------------------------------------------------------ */
/* Bildirimler                                                         */
/* ------------------------------------------------------------------ */

export type NotificationCategory = 'orders' | 'competition' | 'account' | 'system';

export interface AppNotification {
  id: string;
  /** ör. 'order.filled', 'badge.earned', 'system.announcement' */
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Uygulama içi yol (ör. '/portfolio') veya null */
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  items: AppNotification[];
  /** Sonraki sayfa imleci (ISO); yoksa null */
  next_before: string | null;
  unread_count: number;
}

export interface NotificationPrefs {
  orders: boolean;
  competition: boolean;
  /** Her zaman açık (kapatılamaz) */
  account: boolean;
  system: boolean;
  /** Haftalık e-posta özeti (bildirim kategorisi değil; varsayılan açık) */
  email_digest: boolean;
}

export interface NotificationListParams {
  limit?: number;
  before?: string | null;
  unread?: boolean;
  category?: NotificationCategory | null;
}

const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ['orders', 'competition', 'account', 'system'];

/** Backend'den gelen bildirim öğesini güvenle okur. */
export function toNotification(raw: any): AppNotification {
  const category = NOTIFICATION_CATEGORIES.includes(raw?.category) ? (raw.category as NotificationCategory) : 'system';
  return {
    id: String(raw?.id ?? ''),
    type: String(raw?.type ?? ''),
    category,
    title: String(raw?.title ?? ''),
    body: String(raw?.body ?? ''),
    link: typeof raw?.link === 'string' && raw.link ? raw.link : null,
    data: raw?.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : null,
    read_at: raw?.read_at ? String(raw.read_at) : null,
    created_at: String(raw?.created_at ?? new Date().toISOString()),
  };
}

function toNotificationPage(raw: any): NotificationPage {
  const items = Array.isArray(raw?.items) ? raw.items.map(toNotification) : [];
  return {
    items,
    next_before: typeof raw?.next_before === 'string' && raw.next_before ? raw.next_before : null,
    unread_count: Number(raw?.unread_count ?? 0) || 0,
  };
}

export const notificationsApi = {
  /** Liste uç noktası (aynı zamanda SWR anahtarının ilk öğesi). */
  listPath: ({ limit = 20, before, unread, category }: NotificationListParams = {}) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set('before', before);
    if (unread) qs.set('unread', '1');
    if (category) qs.set('category', category);
    return `/notifications?${qs}`;
  },
  list: async (path: string) => toNotificationPage(await swrFetcher<unknown>(path)),
  unreadCountPath: '/notifications/unread-count',
  unreadCount: async () => Number((await swrFetcher<{ count?: number }>('/notifications/unread-count'))?.count ?? 0) || 0,
  markRead: (id: string) => apiFetch(`/notifications/${encodeURIComponent(id)}/read`, post({})),
  markAllRead: (category?: NotificationCategory | null) => apiFetch('/notifications/read-all', post(category ? { category } : {})),
  remove: (id: string) => apiFetch(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  prefsPath: '/notifications/prefs',
  prefs: async (): Promise<NotificationPrefs> => {
    const raw = await swrFetcher<Partial<NotificationPrefs> | null>('/notifications/prefs');
    return { orders: raw?.orders !== false, competition: raw?.competition !== false, account: true, system: true, email_digest: raw?.email_digest !== false };
  },
  updatePrefs: (prefs: Partial<Pick<NotificationPrefs, 'orders' | 'competition' | 'email_digest'>>) =>
    apiFetch('/notifications/prefs', { method: 'PUT', body: JSON.stringify(prefs) }),
  /** SSE akışının yolu (API_BASE_URL'e eklenir) */
  streamPath: '/notifications/stream',
};

/* ------------------------------------------------------------------ */
/* Arena: hızlı al-sat turları ve canlı meydan okumalar                 */
/* ------------------------------------------------------------------ */

import { API_BASE_URL as ARENA_API_BASE } from '@portfoygo/shared/api';
import type { ArenaLeaderPeriod, ArenaSide, ArenaChallengeStatus } from '@/types';
import {
  toArenaInstruments,
  toChallenges,
  toHistoryPage,
  toLeaderboardRows,
  toLeadersPage,
  toMe,
  toPosition,
  toRoundState,
} from '@/components/arena/model';

/** Arena hatası: sözleşmedeki `code` (ör. ARENA_LIMIT) ve ek veriyle. */
export class ArenaApiError extends ApiError {
  constructor(
    message: string,
    status: number,
    public code: string | null,
    public data: any,
    /** 429 için saniye */
    public retryAfter: number | null,
  ) {
    super(message, status);
    this.name = 'ArenaApiError';
  }
}

/**
 * Tur başlatma gibi hata gövdesinin de okunması gereken istekler için (`apiFetch` yalnızca mesajı taşır).
 * Aynı çerez / CSRF başlığı kurallarıyla çalışır.
 */
async function arenaRequest(endpoint: string, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${ARENA_API_BASE}${endpoint}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'PortfoyGo' },
    });
  } catch {
    throw new ArenaApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0, null, null, null);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const retryHeader = Number(res.headers.get('Retry-After'));
    const retry = Number(body?.retry_after ?? body?.data?.retry_after);
    throw new ArenaApiError(
      (body && (body.message || body.error)) || 'Beklenmeyen bir hata oluştu.',
      res.status,
      typeof body?.code === 'string' ? body.code : typeof body?.error === 'string' && /^[A-Z_]+$/.test(body.error) ? body.error : null,
      body?.data ?? body,
      Number.isFinite(retry) && retry > 0 ? retry : Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : null,
    );
  }
  return unwrap(body);
}

const rid = (id: string) => encodeURIComponent(id);

export interface ArenaOpenRequest {
  instrument: string;
  side: ArenaSide;
  amount: number;
  stop_loss?: number;
  take_profit?: number;
}

export const arenaApi = {
  instrumentsKey: '/arena/instruments',
  instruments: async () => toArenaInstruments(await swrFetcher<unknown>('/arena/instruments')),
  /** 201 RoundState · 429 ARENA_LIMIT · 409 ARENA_ROUND_ACTIVE (ArenaApiError) */
  startRound: async (duration_s: number, instruments?: string[]) =>
    toRoundState(await arenaRequest('/arena/rounds', { method: 'POST', body: JSON.stringify(instruments?.length ? { duration_s, instruments } : { duration_s }) })),
  activeKey: '/arena/rounds/active',
  active: async () => {
    const raw = await swrFetcher<any>('/arena/rounds/active');
    return raw && typeof raw === 'object' && raw.round ? toRoundState(raw) : null;
  },
  round: async (id: string) => toRoundState(await swrFetcher<unknown>(`/arena/rounds/${rid(id)}`)),
  openPosition: async (id: string, body: ArenaOpenRequest) => {
    const raw = unwrap<any>(await apiFetch(`/arena/rounds/${rid(id)}/positions`, post(body)));
    return { position: toPosition(raw?.position), me: raw?.me ? toMe(raw.me) : null };
  },
  closePosition: async (id: string, pid: string) => {
    const raw = unwrap<any>(await apiFetch(`/arena/rounds/${rid(id)}/positions/${rid(pid)}/close`, post({})));
    return { position: toPosition(raw?.position), me: raw?.me ? toMe(raw.me) : null };
  },
  updateStops: async (id: string, pid: string, body: { stop_loss?: number | null; take_profit?: number | null }) => {
    const raw = unwrap<any>(await apiFetch(`/arena/rounds/${rid(id)}/positions/${rid(pid)}`, { method: 'PATCH', body: JSON.stringify(body) }));
    return toPosition(raw?.position ?? raw);
  },
  closeAll: async (id: string) => {
    const raw = unwrap<any>(await apiFetch(`/arena/rounds/${rid(id)}/close-all`, post({})));
    const closed = Array.isArray(raw?.closed) ? raw.closed.map(toPosition) : [];
    return { closed, me: raw?.me ? toMe(raw.me) : null };
  },
  streamUrl: (id: string) => `${ARENA_API_BASE}/arena/rounds/${rid(id)}/stream`,
  historyKey: (limit: number, offset: number) => `/arena/me/history?limit=${limit}&offset=${offset}`,
  history: async (limit = 10, offset = 0) => toHistoryPage(await swrFetcher<unknown>(arenaApi.historyKey(limit, offset))),
  leadersKey: (period: ArenaLeaderPeriod) => `/arena/leaderboard?period=${period}`,
  leaders: async (period: ArenaLeaderPeriod) => toLeadersPage(await swrFetcher<unknown>(arenaApi.leadersKey(period))),
  challengesKey: (status: ArenaChallengeStatus) => `/arena/challenges?status=${status}`,
  challenges: async (status: ArenaChallengeStatus) => toChallenges(await swrFetcher<unknown>(arenaApi.challengesKey(status))),
  joinChallenge: async (id: string) => {
    const raw = unwrap<any>(await apiFetch(`/arena/challenges/${rid(id)}/join`, post({})));
    return { round_id: String(raw?.round_id ?? '') };
  },
  challengeLeaderboardKey: (id: string) => `/arena/challenges/${rid(id)}/leaderboard`,
  challengeLeaderboard: async (id: string) => {
    const raw = await swrFetcher<any>(arenaApi.challengeLeaderboardKey(id));
    return { items: toLeaderboardRows(raw?.items ?? raw), status: typeof raw?.status === 'string' ? raw.status : null };
  },
};

/* ------------------------------------------------------------------ */
/* Portföy Sihirbazı: risk profili anketi ve kişisel dağılım önerisi     */
/* ------------------------------------------------------------------ */

import type { AdvisorPlanRequest } from '@/types';
import { toApplyResult, toPlan, toPlanSummaries, toProfileResult, toQuestionnaire } from '@/components/advisor/model';

export const advisorApi = {
  questionnaireKey: '/advisor/questionnaire',
  questionnaire: async () => toQuestionnaire(await swrFetcher<unknown>('/advisor/questionnaire')),
  profileKey: '/advisor/profile',
  /** En son risk profili; hiç anket doldurulmadıysa null. */
  profile: async () => toProfileResult(await swrFetcher<unknown>('/advisor/profile')),
  submitProfile: async (answers: Record<string, string>) => {
    const res = toProfileResult(unwrap(await apiFetch('/advisor/profile', post({ answers }))));
    if (!res) throw new ApiError('Risk profili hesaplanamadı.', 500);
    return res;
  },
  createPlan: async (body: AdvisorPlanRequest) => toPlan(unwrap(await apiFetch('/advisor/plans', post(body)))),
  plansKey: (limit = 10) => `/advisor/plans?limit=${limit}`,
  plans: async (limit = 10) => toPlanSummaries(await swrFetcher<unknown>(advisorApi.plansKey(limit))),
  planKey: (id: string) => `/advisor/plans/${encodeURIComponent(id)}`,
  plan: async (id: string) => toPlan(await swrFetcher<unknown>(advisorApi.planKey(id))),
  /** Yalnızca alım yapar; mevcut pozisyonlara dokunulmaz. */
  apply: async (id: string, amount_try: number) =>
    toApplyResult(unwrap(await apiFetch(`/advisor/plans/${encodeURIComponent(id)}/apply`, post({ amount_try, mode: 'buy_only' })))),
};

/* ------------------------------------------------------------------ */
/* Arena koçu: tur sonu değerlendirmesi                                  */
/* ------------------------------------------------------------------ */

import { toCoachReport } from '@/components/arena/coach/model';

export const coachApi = {
  /** 404: tur yok · 409 ROUND_NOT_FINISHED: tur henüz bitmedi */
  key: (roundId: string) => `/arena/rounds/${encodeURIComponent(roundId)}/coach`,
  report: async (roundId: string) => toCoachReport(await swrFetcher<unknown>(coachApi.key(roundId))),
};

/* ------------------------------------------------------------------ */
/* Oyun ekonomisi: çark, görevler, mağaza, sıralama, sorumlu oyun        */
/* ------------------------------------------------------------------ */

import type { GameBreakDuration, GameLeaderboardType, GameResponsibleSettings } from '@/types';
import { toGameReward, toSpinResult, toWheelState } from '@/components/game/wheel/model';
import { toQuestList } from '@/components/game/quests/model';
import { toShopItems } from '@/components/game/shop/model';
import { toGameLeaderboard, toLedgerPage } from '@/components/game/ranks/model';
import { toResponsibleState } from '@/components/game/responsible/model';

/** Oyun uç noktası hatası: sözleşmedeki `code` (ör. NO_SPINS, ADULT_CONFIRM_REQUIRED) ve ek veriyle. */
export class GameApiError extends ApiError {
  constructor(
    message: string,
    status: number,
    public code: string | null,
    public data: Record<string, any> | null,
  ) {
    super(message, status);
    this.name = 'GameApiError';
  }
}

/** Hata gövdesini (code, next_free_at, break_until…) koruyan istek; apiFetch ile aynı çerez/CSRF kuralları. */
async function gameRequest(endpoint: string, init: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${ARENA_API_BASE}${endpoint}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'PortfoyGo' },
    });
  } catch {
    throw new GameApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0, null, null);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:logout'));
    const code = typeof body?.code === 'string' ? body.code : typeof body?.error === 'string' && /^[A-Z_]+$/.test(body.error) ? body.error : null;
    const data = body?.data && typeof body.data === 'object' ? { ...body, ...body.data } : body && typeof body === 'object' ? body : null;
    throw new GameApiError((body && (body.message || (code ? null : body.error))) || 'Beklenmeyen bir hata oluştu.', res.status, code, data);
  }
  return unwrap(body);
}

const gid = (id: string) => encodeURIComponent(id);
const gamePost = (endpoint: string, body: unknown = {}) => gameRequest(endpoint, { method: 'POST', body: JSON.stringify(body) });

export const gameEconomyApi = {
  profileKey: '/game/profile',

  wheelKey: '/game/wheel',
  wheel: async () => toWheelState(await gameRequest('/game/wheel')),
  /** 429 NO_SPINS {next_free_at} · 403 ADULT_CONFIRM_REQUIRED · 403 ARENA_BREAK {break_until} (GameApiError) */
  spin: async (segments: Parameters<typeof toSpinResult>[1]) => {
    const raw = await gamePost('/game/wheel/spin');
    return { ...toSpinResult(raw, segments), profile: raw?.profile ?? null };
  },

  questsKey: '/game/quests',
  quests: async () => toQuestList(await gameRequest('/game/quests')),
  claimQuest: async (key: string) => {
    const raw = await gamePost(`/game/quests/${gid(key)}/claim`);
    return { reward: toGameReward(raw?.reward), profile: raw?.profile ?? null };
  },

  shopKey: '/game/shop',
  shop: async () => toShopItems(await gameRequest('/game/shop')),
  buy: async (id: string) => {
    const raw = await gamePost(`/game/shop/${gid(id)}/buy`);
    return { profile: raw?.profile ?? null };
  },
  equip: async (body: { avatar_id?: string | null; frame_id?: string | null; title_id?: string | null }) => {
    const raw = await gamePost('/game/cosmetics/equip', body);
    return { profile: raw?.profile ?? null };
  },

  leaderboardKey: (type: GameLeaderboardType, limit = 50) => `/game/leaderboard?type=${type}&limit=${limit}`,
  leaderboard: async (type: GameLeaderboardType, limit = 50) => toGameLeaderboard(await gameRequest(gameEconomyApi.leaderboardKey(type, limit))),

  ledgerKey: (limit = 20, offset = 0) => `/game/ledger?limit=${limit}&offset=${offset}`,
  ledger: async (limit = 20, offset = 0) => toLedgerPage(await gameRequest(gameEconomyApi.ledgerKey(limit, offset))),


  responsibleKey: '/game/responsible',
  responsible: async () => toResponsibleState(await gameRequest('/game/responsible')),
  updateResponsible: async (body: Partial<GameResponsibleSettings>) =>
    toResponsibleState(await gameRequest('/game/responsible', { method: 'PUT', body: JSON.stringify(body) })),
  confirmAdult: async () => {
    const raw = await gamePost('/game/responsible/confirm-adult', { confirm: true });
    return { profile: raw?.profile ?? null, responsible: toResponsibleState(raw?.responsible ?? raw?.profile?.responsible ?? raw) };
  },
  takeBreak: async (duration: GameBreakDuration) => {
    const raw = await gamePost('/game/responsible/break', { duration });
    return toResponsibleState(raw?.responsible ?? raw);
  },
};

/* ------------------------------------------------------------------ */
/* Oyun profili ve arena sosyal: düello, eşleşme, tepkiler, yayın        */
/* ------------------------------------------------------------------ */

import {
  toBroadcastState,
  toDuel,
  toDuelHistory,
  toDuelInvite,
  toGameProfile,
  toMatchTicket,
  toPublicProfile,
  toRoundRewards,
} from '@/components/game/model';

export const gameProfileApi = {
  /** gameEconomyApi.profileKey ile aynı anahtar: ödül / mağaza işlemleri profili yeniler */
  profileKey: '/game/profile',
  profile: async () => toGameProfile(await gameRequest('/game/profile')),
  publicProfileKey: (username: string) => `/game/public-profile/${gid(username)}`,
  publicProfile: async (username: string) => toPublicProfile(await gameRequest(gameProfileApi.publicProfileKey(username))),
  /** Bu turdan kazanılan jeton / XP + reyting farkı (sunucu defteri; ödül yazılana dek ready=false) */
  roundRewardsKey: (roundId: string) => `/game/rewards/round/${gid(roundId)}`,
  roundRewards: async (roundId: string) => toRoundRewards(await gameRequest(gameProfileApi.roundRewardsKey(roundId))),
};

export const arenaSocialApi = {
  /** 403 ADULT_CONFIRM_REQUIRED / ARENA_BREAK · 429 ARENA_PERSONAL_LIMIT (GameApiError) */
  createDuel: async (duration_s: number, instruments?: string[]) =>
    toDuelInvite(await gamePost('/arena/duels', instruments?.length ? { duration_s, instruments } : { duration_s })),
  duelKey: (code: string) => `/arena/duels/${gid(code)}`,
  duel: async (code: string) => toDuel(await gameRequest(arenaSocialApi.duelKey(code))),
  acceptDuel: async (code: string) => {
    const raw = await gamePost(`/arena/duels/${gid(code)}/accept`);
    return { round_id: String(raw?.round_id ?? ''), starts_at: typeof raw?.starts_at === 'string' ? raw.starts_at : null };
  },
  cancelDuel: (id: string) => gamePost(`/arena/duels/${gid(id)}/cancel`),
  rematch: async (id: string) => toDuelInvite(await gamePost(`/arena/duels/${gid(id)}/rematch`)),
  /** Son düellolar + galibiyet/mağlubiyet kaydı */
  myDuelsKey: (limit = 10) => `/arena/duels/mine?limit=${limit}`,
  myDuels: async (limit = 10) => toDuelHistory(await gameRequest(arenaSocialApi.myDuelsKey(limit))),

  matchmake: async (duration_s: number) => toMatchTicket(await gamePost('/arena/matchmaking', { duration_s })),
  ticket: async (ticket: string) => toMatchTicket(await gameRequest(`/arena/matchmaking/${gid(ticket)}`), ticket),
  cancelTicket: (ticket: string) => gameRequest(`/arena/matchmaking/${gid(ticket)}`, { method: 'DELETE' }),

  react: (roundId: string, emoji: string) => gamePost(`/arena/rounds/${gid(roundId)}/reactions`, { emoji }),

  /** Herkese açık yayın (OBS) */
  broadcastKey: (token: string) => `/arena/broadcast/${gid(token)}`,
  broadcast: async (token: string) => toBroadcastState(await gameRequest(arenaSocialApi.broadcastKey(token))),
  broadcastStreamUrl: (token: string) => `${ARENA_API_BASE}/arena/broadcast/${gid(token)}/stream`,
};

/* ------------------------------------------------------------------ */
/* Yatırım İmparatorluğu (idle) ve arena senaryoları                     */
/* ------------------------------------------------------------------ */

import type { IdleBuyQuantity } from '@/types';
import { toIdleLeaderboard, toIdleState, toTapResult } from '@/components/game/idle/model';
import { toRecentScenarioRounds, toScenarioDetail, toScenarioRoundInfo, toScenarios } from '@/components/game/scenarios/model';

/** Hatalar GameApiError (code: ör. INSUFFICIENT_CASH, UPGRADE_LOCKED, PRESTIGE_UNAVAILABLE) */
export const idleApi = {
  stateKey: '/idle/state',
  state: async () => toIdleState(await gameRequest('/idle/state')),
  buy: async (building_id: string, quantity: IdleBuyQuantity) => toIdleState(await gamePost('/idle/buy', { building_id, quantity })),
  upgrade: async (upgrade_id: string) => toIdleState(await gamePost('/idle/upgrade', { upgrade_id })),
  /** count: 1..20 */
  tap: async (count: number) => toTapResult(await gamePost('/idle/tap', { count: Math.max(1, Math.min(20, Math.floor(count))) })),
  prestige: async () => toIdleState(await gamePost('/idle/prestige')),
  leaderboardKey: '/idle/leaderboard',
  leaderboard: async () => toIdleLeaderboard(await gameRequest('/idle/leaderboard')),
};

export const scenariosApi = {
  listKey: '/arena/scenarios',
  list: async () => toScenarios(await gameRequest('/arena/scenarios')),
  /** Senaryo turu başlatır → RoundState (409 ARENA_ROUND_ACTIVE · 429 ARENA_LIMIT · 403 ADULT_CONFIRM_REQUIRED) */
  start: async (scenario_id: string, duration_s: number) =>
    toRoundState(await gamePost('/arena/rounds', { scenario_id, duration_s })),
  /** Brifing; debrief yalnızca kullanıcı senaryoyu en az bir kez bitirdiyse */
  detailKey: (idOrSlug: string) => `/arena/scenarios/${encodeURIComponent(idOrSlug)}`,
  detail: async (idOrSlug: string) => toScenarioDetail(await gameRequest(`/arena/scenarios/${encodeURIComponent(idOrSlug)}`)),
  roundKey: (roundId: string) => `/arena/rounds/${encodeURIComponent(roundId)}#senaryo`,
  round: async (roundId: string) => toScenarioRoundInfo(await gameRequest(`/arena/rounds/${encodeURIComponent(roundId)}`)),
  /** Son bitmiş senaryo turları (geçmişten kind = 'scenario') */
  recentKey: '/arena/me/history?limit=30&offset=0#senaryo',
  recent: async () => toRecentScenarioRounds(await gameRequest('/arena/me/history?limit=30&offset=0')),
};

/* ------------------------------------------------------------------ */
/* Haftalık Seçim — Kitlelerin Bilgeliği (haftalık kör seçim yarışması)  */
/* ------------------------------------------------------------------ */

import type { PickInput } from '@/types';
import { toPicksAssets, toPicksComment, toPicksCommentPage, toPicksCurrent, toPicksWeek, toPicksWeekPage, toWeeklyPick } from '@/components/game/picks/model';

const picksQuery = (path: string, params: Record<string, string | number | null | undefined>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
};

/**
 * Hatalar GameApiError: 409 PICKS_CLOSED (açılış geçti) · 400 ASSET_UNAVAILABLE ·
 * 403 ADULT_CONFIRM_REQUIRED / ARENA_BREAK · yorumlarda 409 PICKS_HIDDEN (açılıştan önce).
 */
export const picksApi = {
  currentKey: '/picks/current',
  /** Aktif ve önceki hafta + sunucu saati (geri sayımlar sunucu saatine göre) */
  current: async () => toPicksCurrent(await gameRequest('/picks/current'), Date.now()),
  weeksKey: (limit = 20, offset = 0) => `/picks/weeks?limit=${limit}&offset=${offset}`,
  weeks: async (limit = 20, offset = 0) => toPicksWeekPage(await gameRequest(picksApi.weeksKey(limit, offset))),
  weekKey: (weekId: string) => `/picks/weeks/${gid(weekId)}`,
  week: async (weekId: string) => toPicksWeek(await gameRequest(picksApi.weekKey(weekId))),
  /** Seçimi gönderir / değiştirir (açılışa kadar) */
  submit: async (weekId: string, body: PickInput) => {
    const raw = await gameRequest(`/picks/weeks/${gid(weekId)}/pick`, { method: 'PUT', body: JSON.stringify(body) });
    return { pick: raw?.pick ? toWeeklyPick(raw.pick, true) : null, week: raw?.week ? toPicksWeek(raw.week) : null };
  },
  /** Seçimi geri çeker (açılışa kadar) → {deleted, week} */
  withdraw: async (weekId: string) => {
    const raw = await gameRequest(`/picks/weeks/${gid(weekId)}/pick`, { method: 'DELETE' });
    return { deleted: raw?.deleted !== false, week: raw?.week ? toPicksWeek(raw.week) : null };
  },
  assetsKey: (q: string, type: string | null) => picksQuery('/picks/assets', { q: q.trim(), type }),
  assets: async (q: string, type: string | null) => toPicksAssets(await gameRequest(picksApi.assetsKey(q, type))),
  commentsKey: (weekId: string, limit = 50, before?: string | null) => picksQuery(`/picks/weeks/${gid(weekId)}/comments`, { limit, before }),
  comments: async (weekId: string, limit = 50, before?: string | null) => toPicksCommentPage(await gameRequest(picksApi.commentsKey(weekId, limit, before))),
  postComment: async (weekId: string, text: string) => {
    const raw = await gamePost(`/picks/weeks/${gid(weekId)}/comments`, { text });
    return toPicksComment(raw?.comment ?? raw);
  },
  deleteComment: (commentId: string) => gameRequest(`/picks/comments/${gid(commentId)}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------------ */
/* Hesap güvenliği: iki adımlı doğrulama (TOTP) + KVKK self-servis      */
/* ------------------------------------------------------------------ */

import type { TwoFactorSetup, TwoFactorStatus } from '@/types';
import { API_BASE_URL as ACCOUNT_API_BASE } from '@portfoygo/shared/api';

/**
 * /auth/2fa/* ve girişin ikinci adımı. Yeniden doğrulama hataları (yanlış şifre / kod) backend'de 400'dür;
 * yine de bu çağrılar silent401 ile yapılır: oturum düşmüşse hata mesajı gösterilir, sayfa aniden yönlenmez.
 */
export const twoFactorApi = {
  statusKey: '/auth/2fa/status',
  status: async (): Promise<TwoFactorStatus> => (await apiFetch<{ data: TwoFactorStatus }>('/auth/2fa/status')).data,
  setup: async (): Promise<TwoFactorSetup> =>
    (await apiFetch<{ data: TwoFactorSetup }>('/auth/2fa/setup', { ...post({}), silent401: true })).data,
  /** Başarılıysa kurtarma kodları (yalnızca bu yanıtta). Diğer cihazlardaki oturumlar kapanır. */
  enable: async (code: string): Promise<string[]> =>
    (await apiFetch<{ data: { recovery_codes: string[] } }>('/auth/2fa/enable', { ...post({ code }), silent401: true })).data
      .recovery_codes,
  /** code: 6 haneli kod ya da kurtarma kodu */
  disable: (password: string, code: string) => apiFetch('/auth/2fa/disable', { ...post({ password, code }), silent401: true }),
  regenerateRecoveryCodes: async (code: string): Promise<string[]> =>
    (await apiFetch<{ data: { recovery_codes: string[] } }>('/auth/2fa/recovery-codes', { ...post({ code }), silent401: true }))
      .data.recovery_codes,
  /** Girişin ikinci adımı: 6 haneli kod ya da kurtarma kodu */
  completeLogin: (challenge: string, input: { code?: string; recovery_code?: string }) =>
    apiFetch('/auth/login/2fa', { ...post({ challenge, ...input }), silent401: true }),
};

/** KVKK: verilerimi indir / hesabımı sil */
export const accountApi = {
  /** Kişisel verilerin JSON kopyası (Blob). Kullanıcı başına saatte 3 indirme. */
  exportData: async (): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${ACCOUNT_API_BASE}/me/export`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'PortfoyGo', Accept: 'application/json' },
      });
    } catch {
      throw new ApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message || 'Veriler indirilemedi.', res.status, body?.code);
    }
    return res.blob();
  },
  deleteAccount: (input: { password: string; totp?: string; confirm_username: string }) =>
    apiFetch('/me/delete', { ...post(input), silent401: true }),
};

/* ------------------------------------------------------------------ */
/* Herkese açık profil görünürlüğü (/u/<kullanıcı-adı>)                  */
/* ------------------------------------------------------------------ */

export interface ProfileVisibility {
  profile_public: boolean;
  username: string;
}

export const profileVisibilityApi = {
  key: '/me/profile-visibility',
  get: async (): Promise<ProfileVisibility> => {
    const raw = await swrFetcher<Partial<ProfileVisibility> | null>('/me/profile-visibility');
    return { profile_public: raw?.profile_public !== false, username: String(raw?.username ?? '') };
  },
  set: async (profile_public: boolean): Promise<ProfileVisibility> => {
    const raw = unwrap<Partial<ProfileVisibility> | null>(
      await apiFetch('/me/profile-visibility', { method: 'PATCH', body: JSON.stringify({ profile_public }) }),
    );
    return { profile_public: raw?.profile_public !== false, username: String(raw?.username ?? '') };
  },
};

// ---------------------------------------------------------------------------
// İşlem derinliği (020): piyasa emirleri hata koduyla (MARKET_CLOSED → next_open_at), açılışta (MOO) emir,
// ABD seans durumu. apiFetch yalnızca mesajı taşıdığı için gövdeyi koruyan ayrı istek.
// ---------------------------------------------------------------------------

import { API_BASE_URL as TRADE_API_BASE } from '@portfoygo/shared/api';
import { toUsMarketSession, type UsMarketSession } from '@/lib/marketHours';

/** İşlem uç noktası hatası: `code` (ör. MARKET_CLOSED, MARKET_OPEN, TRADE_REJECTED) ve gövdedeki ek alanlar. */
export class TradeApiError extends ApiError {
  constructor(
    message: string,
    status: number,
    public code: string | null,
    public data: Record<string, any> | null,
  ) {
    super(message, status);
    this.name = 'TradeApiError';
  }
}

async function tradeRequest(endpoint: string, init: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${TRADE_API_BASE}${endpoint}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'PortfoyGo' },
    });
  } catch {
    throw new TradeApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0, null, null);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:logout'));
    const code = typeof body?.code === 'string' ? body.code : null;
    throw new TradeApiError((body && (body.message || body.error)) || 'Beklenmeyen bir hata oluştu.', res.status, code, body && typeof body === 'object' ? body : null);
  }
  return body;
}

/** ABD borsası kapalıyken hisse piyasa emri 409 MARKET_CLOSED döner (`data.next_open_at`). */
export const isMarketClosedError = (err: unknown): err is TradeApiError => err instanceof TradeApiError && err.code === 'MARKET_CLOSED';

export const tradeApi = {
  /** Piyasa emri (alış/satış). Hatalar TradeApiError (409 MARKET_CLOSED, 400 TRADE_REJECTED, 503 PRICE_UNAVAILABLE). */
  market: (side: OrderSide, data: TradeRequest) => tradeRequest(`/transactions/${side}`, { method: 'POST', body: JSON.stringify(data) }),
  /** Bekleyen emir (tüm tipler); açılışta emri borsa açıkken 409 MARKET_OPEN döner. */
  createOrder: (data: CreateOrderRequest) => tradeRequest('/orders', { method: 'POST', body: JSON.stringify(data) }),
};

export const MARKET_SESSION_KEY = '/market/session';

export const marketSessionApi = {
  /** ABD hisse seansı; geri sayım için sunucu saati farkı ölçülür. */
  get: async (): Promise<UsMarketSession | null> => {
    const sent = Date.now();
    const body = await apiFetch('/market/session', { silent401: true });
    return toUsMarketSession(body?.data ?? body, Math.round((sent + Date.now()) / 2));
  },
};

/* ------------------------------------------------------------------ */
/* Model Portföy (100.000 USD) + sanal portföy varlık araması           */
/* ------------------------------------------------------------------ */

import type {
  AdvisorTemplate as SandboxAdvisorTemplate,
  AssetSearchItem as SandboxAssetSearchItem,
  CompareItem as SandboxCompareItem,
  ModelDetail as SandboxModelDetail,
  ModelList as SandboxModelList,
  RebalancePlan as SandboxRebalancePlan,
  SandboxAssetType,
  SandboxBacktest,
  SandboxHistory,
  SandboxHistoryRange,
  SandboxMetrics,
  SandboxPortfolio,
  SandboxTrade,
  SandboxTradeRequest,
  SandboxValuation,
  TargetWeight as SandboxTargetWeight,
} from '@/components/sandbox/types';

export interface SandboxWeightsBody {
  weights: SandboxTargetWeight[];
  cash_weight: number;
}

const mpPath = (id: string) => `/model-portfolios/${encodeURIComponent(id)}`;
const sendJson = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** /api/model-portfolios — hatalar ApiError (code: MODEL_LIMIT, WEIGHTS_INVALID, PRICE_UNAVAILABLE, INSUFFICIENT_CASH …) */
export const modelPortfolioApi = {
  listKey: '/model-portfolios',
  list: () => swrFetcher<SandboxModelList>('/model-portfolios'),
  detailKey: (id: string) => mpPath(id),
  detail: (id: string) => swrFetcher<SandboxModelDetail>(mpPath(id)),
  historyKey: (id: string, range: SandboxHistoryRange) => `${mpPath(id)}/history?range=${range}`,
  metricsKey: (id: string) => `${mpPath(id)}/metrics`,
  backtestKey: (id: string, days = 90) => `${mpPath(id)}/backtest?days=${days}`,
  tradesKey: (id: string, limit = 20, offset = 0) => `${mpPath(id)}/trades?limit=${limit}&offset=${offset}`,
  compareKey: (ids: string[]) => `/model-portfolios/compare?ids=${ids.map(encodeURIComponent).join(',')}`,
  advisorTemplateKey: '/model-portfolios/templates/advisor',
  fetch: <T,>(key: string) => swrFetcher<T>(key),
  create: async (body: { name: string } & Partial<SandboxWeightsBody>) =>
    unwrap(await apiFetch(`/model-portfolios`, post(body))) as { portfolio: SandboxPortfolio; rebalance: unknown },
  preview: async (body: SandboxWeightsBody) => unwrap(await apiFetch('/model-portfolios/preview', post(body))) as SandboxRebalancePlan,
  rename: async (id: string, name: string) => unwrap(await apiFetch(mpPath(id), sendJson('PATCH', { name }))) as SandboxPortfolio,
  remove: async (id: string) => {
    await apiFetch(mpPath(id), sendJson('DELETE'));
  },
  setWeights: async (id: string, body: SandboxWeightsBody, dryRun = false) =>
    unwrap(await apiFetch(`${mpPath(id)}/weights`, sendJson('PUT', { ...body, dry_run: dryRun }))) as {
      result: { executed: boolean; plan: SandboxRebalancePlan; trades: SandboxTrade[]; cash_usd: number };
      valuation: SandboxValuation | null;
    },
  trade: async (id: string, body: SandboxTradeRequest) =>
    unwrap(await apiFetch(`${mpPath(id)}/trade`, post(body))) as { result: { trade: SandboxTrade; cash_usd: number }; valuation: SandboxValuation },
};

export type {
  SandboxAdvisorTemplate,
  SandboxBacktest,
  SandboxCompareItem,
  SandboxHistory,
  SandboxMetrics,
};

/** GET /api/sandbox/assets — yalnızca işlem için taze fiyatı olan varlıklar (USD) */
export const sandboxApi = {
  assetsKey: (q: string, type: SandboxAssetType | null) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (type) p.set('type', type);
    const qs = p.toString();
    return `/sandbox/assets${qs ? `?${qs}` : ''}`;
  },
  assets: (q: string, type: SandboxAssetType | null) => swrFetcher<SandboxAssetSearchItem[]>(sandboxApi.assetsKey(q, type)),
};

/* ------------------------------------------------------------------ */
/* Ortak Akıl — Öneri Havuzu (/api/ideas): istemci ve normalleştiriciler src/lib/ideas.ts'te */
/* ------------------------------------------------------------------ */

export { ideasApi } from './ideas';

/* ------------------------------------------------------------------ */
/* Slot Makinesi — "Olasılık dersi" (/api/game/slot, migration 026)     */
/* ------------------------------------------------------------------ */

import { toSlotInfo, toSlotSpinResult } from '@/components/game/slot/model';

/**
 * Hatalar GameApiError: 410 SLOT_DISABLED · 400 INSUFFICIENT_COINS / INVALID_BET · 403 ADULT_CONFIRM_REQUIRED / ARENA_BREAK ·
 * 429 SLOT_COOLDOWN {retry_after_ms} / SLOT_DAILY_SPIN_LIMIT / SLOT_DAILY_LOSS_LIMIT {resets_at, max_bet} ·
 * 409 SLOT_REALITY_CHECK {session}. Aynı request_id ile yeniden deneme aynı sonucu döndürür (idempotent).
 */
export const slotApi = {
  key: '/game/slot',
  info: async () => toSlotInfo(await gameRequest('/game/slot')),
  spin: async (body: { bet: number; request_id: string; reality_check_ack?: boolean }) => toSlotSpinResult(await gamePost('/game/slot/spin', body)),
};
