// Frontend'e özgü API uçları. Çekirdek istemci (apiFetch, oturum, CSRF) ortak pakettedir.

import type { AssetType, CreateLeagueRequest } from '@/types';
import { apiFetch, post } from '@portfoygo/shared/api';
import {
  toCurrentSeason,
  toLeague,
  toLeagueDetail,
  toLeaguePreview,
  toLeagues,
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
};
