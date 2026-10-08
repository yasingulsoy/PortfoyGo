// Backend (Express) API istemcisi. Tüm istekler buradan geçer.

import type { AssetType } from '@/types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
    // Proxy (route koruması) için çerez. Asıl yetki kontrolü backend'de yapılır.
    document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=${7 * 86400}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('portfolio');
    } catch {}
    document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
  },
  /** JWT'nin süresi dolmuş mu? (imza doğrulaması backend'de yapılır) */
  isExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  },
};

export const userStore = {
  get<T>(): T | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(user: unknown) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  },
};

let loggingOut = false;

function handleUnauthorized() {
  if (typeof window === 'undefined' || loggingOut) return;
  const path = window.location.pathname;
  if (['/login', '/register', '/forgot-password', '/verify-email'].includes(path)) return;
  loggingOut = true;
  tokenStore.clear();
  window.dispatchEvent(new CustomEvent('auth:logout'));
  window.location.replace(`/login?redirect=${encodeURIComponent(path)}`);
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const token = auth ? tokenStore.get() : null;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...rest, headers: finalHeaders });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token) handleUnauthorized();
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
  login: (email: string, password: string) =>
    apiFetch('/auth/login', { ...post({ email, password }), auth: false }),
  register: (username: string, email: string, password: string) =>
    apiFetch('/auth/register', { ...post({ username, email, password }), auth: false }),
  profile: () => apiFetch('/auth/profile'),
};

export const emailApi = {
  sendVerification: () => apiFetch('/email/send-verification', post({})),
  verify: (code: string) => apiFetch('/email/verify', post({ code })),
  sendReset: (email: string) => apiFetch('/email/send-reset', { ...post({ email }), auth: false }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    apiFetch('/email/reset-password', { ...post({ email, code, newPassword }), auth: false }),
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
  list: (limit = 10) => apiFetch(`/news?limit=${limit}`, { auth: false }),
};

export const stopLossApi = {
  create: (data: { portfolio_item_id: string; trigger_price: number; quantity: number }) =>
    apiFetch('/stop-loss', post(data)),
  list: () => apiFetch('/stop-loss'),
  cancel: (id: string) => apiFetch(`/stop-loss/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
