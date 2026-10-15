// Yönetim paneline özgü API uçları. Çekirdek istemci (apiFetch, oturum, CSRF) ortak pakettedir.

import { apiFetch, post } from '@portfoygo/shared/api';
import type { ArenaChallenge } from './types';

export { ApiError, apiFetch, session, swrFetcher } from '@portfoygo/shared/api';

export const authApi = {
  login: (email: string, password: string) => apiFetch('/auth/login', { ...post({ email, password }), silent401: true }),
  profile: () => apiFetch('/auth/profile', { silent401: true }),
  logout: () => apiFetch('/auth/logout', { ...post({}), silent401: true }),
  /** Yalnızca yerel geliştirme: şifresiz giriş (uzak DB'de 404) */
  devLogin: (username: string) => apiFetch('/auth/dev-login', { ...post({ username }), silent401: true }),
};

/** Boş / tanımsız değerleri atlayarak sorgu dizesi ekler: withQuery('/x', { a: 1, b: '' }) → '/x?a=1' */
export function withQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const id = (v: string) => encodeURIComponent(v);
const del = (body: unknown): RequestInit => ({ method: 'DELETE', body: JSON.stringify(body) });

export interface AnnouncementInput {
  title: string;
  body: string;
  /** '/' ile başlayan site yolu veya https:// adresi */
  link?: string | null;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  link: string | null;
  created_by_username: string | null;
  recipients: number;
  created_at: string;
}

/** POST /admin/arena/challenges gövdesi (sınırlar backend ile aynı) */
export interface ArenaChallengeInput {
  title: string;
  description?: string;
  sponsor?: string;
  prize_text?: string;
  /** ISO 8601; en erken şimdi + 1 dk, en geç şimdi + 30 gün */
  starts_at: string;
  /** 60..3600 saniye */
  duration_s: number;
  /** 2..5 enstrüman kodu */
  instruments: string[];
  /** 1.000..100.000 (varsayılan 10.000) */
  starting_cash?: number;
}

export const ARENA_LIMITS = {
  titleMin: 3,
  titleMax: 80,
  descriptionMax: 300,
  sponsorMax: 80,
  prizeMax: 160,
  minLeadMs: 60_000,
  maxLeadMs: 30 * 86_400_000,
  durationMin: 60,
  durationMax: 3600,
  instrumentsMin: 2,
  instrumentsMax: 5,
  cashMin: 1000,
  cashMax: 100_000,
  cashDefault: 10_000,
} as const;

export type UserStatusFilter = 'all' | 'banned' | 'admins' | 'unverified';

/** SWR anahtarları (aynı zamanda GET uç noktaları; swrFetcher `data` zarfını açar). */
export const adminKeys = {
  metrics: (days = 30) => `/admin/metrics?days=${days}`,
  health: '/admin/health',
  users: (p: { limit: number; offset: number; search?: string; status?: UserStatusFilter }) =>
    withQuery('/admin/users', { limit: p.limit, offset: p.offset, search: p.search, status: p.status === 'all' ? undefined : p.status }),
  user: (userId: string) => `/admin/users/${id(userId)}`,
  transactions: (p: { search?: string; type?: string; asset_type?: string; from?: string; to?: string; limit: number; offset: number }) =>
    withQuery('/admin/transactions', p),
  orders: (p: { status?: string; type?: string; search?: string; limit: number; offset: number }) => withQuery('/admin/orders', p),
  leagues: (p: { search?: string; limit: number; offset: number }) => withQuery('/admin/leagues', p),
  audit: (p: { action?: string; admin_id?: string; limit: number; offset: number }) => withQuery('/admin/audit', p),
  announcements: (p: { limit: number; offset: number }) => withQuery('/admin/announcements', p),
  arenaChallenges: (p: { limit: number; offset: number }) => withQuery('/admin/arena/challenges', p),
};

/** Arena'nın herkese açık uçları (oyuncu uygulamasıyla ortak) */
export const arenaKeys = {
  instruments: '/arena/instruments',
  leaderboard: (challengeId: string) => `/arena/challenges/${id(challengeId)}/leaderboard`,
};

export const adminApi = {
  stats: () => apiFetch('/admin/stats'),
  users: (limit = 50, offset = 0) => apiFetch(adminKeys.users({ limit, offset })),
  setBan: (userId: string, ban: boolean) => apiFetch(`/admin/users/${id(userId)}/ban`, post({ ban })),
  setRole: (userId: string, isAdmin: boolean) => apiFetch(`/admin/users/${id(userId)}/role`, post({ is_admin: isAdmin })),
  verifyEmail: (userId: string) => apiFetch(`/admin/users/${id(userId)}/verify-email`, post({})),
  revokeSessions: (userId: string) => apiFetch(`/admin/users/${id(userId)}/revoke-sessions`, post({})),
  cancelOrder: (orderId: string, reason?: string) => apiFetch(`/admin/orders/${id(orderId)}/cancel`, post(reason ? { reason } : {})),
  deleteLeague: (leagueId: string, reason?: string) => apiFetch(`/admin/leagues/${id(leagueId)}`, del(reason ? { reason } : {})),
  runJob: (name: string) => apiFetch(`/admin/jobs/${id(name)}/run`, post({})),
  refreshStocks: () => apiFetch('/stocks/refresh-cache', post({})),
  refreshCurrencies: () => apiFetch('/currencies/refresh', post({})),
  /** Yasaklı olmayan tüm kullanıcılara 'system.announcement' bildirimi gönderir. */
  sendAnnouncement: (input: AnnouncementInput) => apiFetch<{ data?: { id: string; recipients: number } }>('/admin/announcements', post(input)),
  /** Yeni arena meydan okuması planlar (201 → data: meydan okuma) */
  createArenaChallenge: (input: ArenaChallengeInput) => apiFetch<{ data?: ArenaChallenge }>('/admin/arena/challenges', post(input)),
  /** Yalnızca 'scheduled' durumdaki meydan okumalar iptal edilebilir */
  cancelArenaChallenge: (challengeId: string) => apiFetch<{ data?: ArenaChallenge }>(`/admin/arena/challenges/${id(challengeId)}/cancel`, post({})),
};

/** Kullanıcı uygulamasının adresi (panelden siteye bağlantı) */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

/* ------------------------------------------------------------------ */
/* Arena senaryoları: lisanslı tarihsel seriler ve senaryo düzenleyici    */
/* ------------------------------------------------------------------ */

import type { BroadcastToken, ScenarioInput, SeriesCurrency } from './types';

export interface SeriesImportInput {
  /** ^[A-Z0-9_]{3,40}$ */
  series_code: string;
  label: string;
  currency: SeriesCurrency;
  /** Verinin kaynağı (zorunlu) */
  source: string;
  /** Lisans / kullanım hakkı notu (zorunlu) */
  license_note: string;
  csv?: string;
  rows?: [string | number, number][];
  /** true → mevcut noktalar silinip yenileriyle değiştirilir (varsayılan: birleştir) */
  replace?: boolean;
}

export const scenarioKeys = {
  series: '/admin/arena/series',
  seriesPreview: (code: string, limit = 500, range?: { from?: string; to?: string }) =>
    withQuery(`/admin/arena/series/${id(code)}/preview`, { limit, from: range?.from, to: range?.to }),
  scenarios: '/admin/arena/scenarios',
};

export const scenarioApi = {
  importSeries: (input: SeriesImportInput) => apiFetch<{ data?: unknown }>('/admin/arena/series/import', post(input)),
  deleteSeries: (code: string) => apiFetch(`/admin/arena/series/${id(code)}`, { method: 'DELETE' }),
  createScenario: (input: ScenarioInput) => apiFetch<{ data?: unknown }>('/admin/arena/scenarios', post(input)),
  updateScenario: (scenarioId: string, patch: Partial<ScenarioInput>) =>
    apiFetch<{ data?: unknown }>(`/admin/arena/scenarios/${id(scenarioId)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteScenario: (scenarioId: string) => apiFetch(`/admin/arena/scenarios/${id(scenarioId)}`, { method: 'DELETE' }),
  publishScenario: (scenarioId: string, published: boolean) =>
    apiFetch<{ data?: unknown }>(`/admin/arena/scenarios/${id(scenarioId)}/publish`, post({ published })),
};

/** Canlı yayın (OBS kaplaması) ve sunucu mesajı */
export const broadcastApi = {
  createToken: async (challengeId: string): Promise<BroadcastToken> => {
    const res = await apiFetch<{ data?: Partial<BroadcastToken> } & Partial<BroadcastToken>>(
      `/admin/arena/challenges/${id(challengeId)}/broadcast-token`,
      post({}),
    );
    const d = (res?.data ?? res) as Partial<BroadcastToken>;
    const token = String(d?.token ?? '');
    return { token, overlay_path: String(d?.overlay_path || (token ? `/yayin/${token}` : '')) };
  },
  /** text ≤ 140 karakter */
  sendMessage: (challengeId: string, text: string) => apiFetch(`/admin/arena/challenges/${id(challengeId)}/message`, post({ text })),
};

/** Yayın kaplamasının tam adresi (site kökü + overlay_path) */
export const overlayUrl = (overlayPath: string) => `${APP_URL}${overlayPath.startsWith('/') ? '' : '/'}${overlayPath}`;
