// Backend (Express) API istemcisi. Tüm istekler buradan geçer.

import type { AssetType } from '@/types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

/**
 * Oturum: backend giriş yanıtında httpOnly `pg_session` çerezini set eder; JavaScript token'ı hiç
 * görmez. Tüm istekler `credentials: 'include'` ile gider. Durum değiştiren isteklerde backend
 * CSRF koruması olarak `X-Requested-With: PortfoyGo` başlığını ister (her istekte gönderilir).
 */
const CSRF_HEADERS = { 'X-Requested-With': 'PortfoyGo' } as const;

/** Önceki sürümlerden kalan localStorage/çerez kayıtları (token artık tarayıcı JS'inde tutulmaz). */
const LEGACY_KEYS = ['token', 'user', 'portfolio'];

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * İstemci tarafı oturum durumu. Yalnızca bir oturum kurulduysa (giriş / profil başarılı)
 * 401 yanıtı "oturum düştü" olarak ele alınır ve giriş sayfasına yönlendirilir.
 */
let sessionActive = false;
let loggingOut = false;

export const session = {
  isActive: () => sessionActive,
  setActive(active: boolean) {
    sessionActive = active;
    if (active) loggingOut = false;
  },
  /** Eski sürümden kalan token/kullanıcı kayıtlarını siler. */
  clearLegacy() {
    if (typeof window === 'undefined') return;
    try {
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch {}
    document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
  },
};

function handleUnauthorized() {
  if (typeof window === 'undefined' || loggingOut || !sessionActive) return;
  sessionActive = false;
  const path = window.location.pathname;
  window.dispatchEvent(new CustomEvent('auth:logout'));
  if (['/login', '/register', '/forgot-password', '/verify-email'].includes(path)) return;
  loggingOut = true;
  window.location.replace(`/login?redirect=${encodeURIComponent(path)}`);
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { /** 401'de oturumu kapatıp yönlendirme yapılmasın */ silent401?: boolean } = {},
): Promise<T> {
  const { silent401 = false, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...CSRF_HEADERS,
    ...(headers as Record<string, string> | undefined),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...rest, headers: finalHeaders, credentials: 'include' });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !silent401) handleUnauthorized();
    const message = (body && (body.message || body.error)) || 'Beklenmeyen bir hata oluştu.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

/** SWR için fetcher: { success, data } zarfını açar. */
export async function swrFetcher<T>(endpoint: string): Promise<T> {
  const json = await apiFetch<any>(endpoint);
  if (json && typeof json === 'object' && 'data' in json) return json.data as T;
  return json as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const authApi = {
  login: (email: string, password: string) => apiFetch('/auth/login', { ...post({ email, password }), silent401: true }),
  register: (username: string, email: string, password: string) =>
    apiFetch('/auth/register', post({ username, email, password })),
  profile: (opts: { silent401?: boolean } = {}) => apiFetch('/auth/profile', opts),
  /** Bu tarayıcıdaki oturumu kapatır (çerezleri siler). */
  logout: () => apiFetch('/auth/logout', { ...post({}), silent401: true }),
  /** Tüm cihazlardaki oturumları iptal eder. */
  logoutAll: () => apiFetch('/auth/logout-all', post({})),
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

export const adminApi = {
  stats: () => apiFetch('/admin/stats'),
  users: (limit = 50, offset = 0) => apiFetch(`/admin/users?limit=${limit}&offset=${offset}`),
  setBan: (userId: string, ban: boolean) => apiFetch(`/admin/users/${encodeURIComponent(userId)}/ban`, post({ ban })),
  refreshStocks: () => apiFetch('/stocks/refresh-cache', post({})),
  refreshCurrencies: () => apiFetch('/currencies/refresh', post({})),
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
export type OrderType = 'limit' | 'stop_loss' | 'take_profit';

export interface CreateOrderRequest {
  asset_type: AssetType;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  trigger_price: number;
  /** 1–90 gün; varsayılan 30 */
  expires_in_days?: number;
}

export const ordersApi = {
  create: (data: CreateOrderRequest) => apiFetch('/orders', { method: 'POST', body: JSON.stringify(data) }),
  list: (status: 'active' | 'history' | 'all' = 'active') => apiFetch(`/orders?status=${status}`),
  cancel: (id: string) => apiFetch(`/orders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
