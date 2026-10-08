// Yönetim paneline özgü API uçları. Çekirdek istemci (apiFetch, oturum, CSRF) ortak pakettedir.

import { apiFetch, post } from '@portfoygo/shared/api';

export { ApiError, apiFetch, session, swrFetcher } from '@portfoygo/shared/api';

export const authApi = {
  login: (email: string, password: string) => apiFetch('/auth/login', { ...post({ email, password }), silent401: true }),
  profile: () => apiFetch('/auth/profile', { silent401: true }),
  logout: () => apiFetch('/auth/logout', { ...post({}), silent401: true }),
};

export const adminApi = {
  stats: () => apiFetch('/admin/stats'),
  users: (limit = 50, offset = 0) => apiFetch(`/admin/users?limit=${limit}&offset=${offset}`),
  setBan: (userId: string, ban: boolean) => apiFetch(`/admin/users/${encodeURIComponent(userId)}/ban`, post({ ban })),
  refreshStocks: () => apiFetch('/stocks/refresh-cache', post({})),
  refreshCurrencies: () => apiFetch('/currencies/refresh', post({})),
};

/** Kullanıcı uygulamasının adresi (panelden siteye bağlantı) */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
