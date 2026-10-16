'use client';

import useSWR from 'swr';
import { apiFetch, swrFetcher, withQuery } from '@/lib/api';
import { usePaged } from '@/lib/hooks';

/* Abonelikler (backend: routes/adminSubscriptions.ts, migration 025). Ödeme sağlayıcısı yok: Premium yalnızca
   ücretsiz deneme veya yönetici tanımıyla açılır. Denetim kaydı: subscription.grant / subscription.revoke. */

type Tone = 'neutral' | 'brand' | 'up' | 'down' | 'gold';

export type SubStatusFilter = 'current' | 'trial' | 'active' | 'canceled' | 'expired' | 'all';
export const PAGE = 25;

export interface AdminSubscription {
  id: string;
  user_id: string;
  username: string | null;
  email: string | null;
  plan_id: 'free' | 'premium';
  status: 'trial' | 'active' | 'canceled' | 'expired';
  source: 'trial' | 'admin' | 'payment';
  starts_at: string;
  ends_at: string | null;
  canceled_at: string | null;
  granted_by: string | null;
  granted_by_username: string | null;
  note: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubSummary {
  current_premium: number;
  current_trials: number;
  expiring_7d: number;
  trials_used: number;
}

export interface EntitlementState {
  plan: { id: string; name: string; price_display: string };
  status: 'free' | 'trial' | 'active';
  entitlements: string[];
  current: { id: string; plan_id: string; status: 'trial' | 'active'; source: string; starts_at: string; ends_at: string | null; days_left: number | null } | null;
  trial: { eligible: boolean; used: boolean; days: number; started_at: string | null; ended_at: string | null };
}

export interface AdminUserSubscription {
  user: { id: string; username: string };
  state: EntitlementState;
  history: AdminSubscription[];
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  features: { key: string; label: string }[];
  price_display: string;
}

export const STATUS_META: Record<AdminSubscription['status'], { label: string; tone: Tone }> = {
  trial: { label: 'Deneme', tone: 'brand' },
  active: { label: 'Premium', tone: 'up' },
  canceled: { label: 'İptal edildi', tone: 'neutral' },
  expired: { label: 'Süresi doldu', tone: 'gold' },
};

export const SOURCE_LABEL: Record<AdminSubscription['source'], string> = { trial: 'Ücretsiz deneme', admin: 'Yönetici', payment: 'Ödeme' };

export const STATUS_OPTIONS: { value: SubStatusFilter; label: string }[] = [
  { value: 'current', label: 'Geçerli (deneme + Premium)' },
  { value: 'trial', label: 'Süren denemeler' },
  { value: 'active', label: 'Premium (yönetici / ödeme)' },
  { value: 'expired', label: 'Süresi dolanlar' },
  { value: 'canceled', label: 'İptal edilenler' },
  { value: 'all', label: 'Tümü' },
];

export const subscriptionKeys = {
  list: (p: { status: SubStatusFilter; search?: string; offset: number }) =>
    withQuery('/admin/subscriptions', { status: p.status, search: p.search, limit: PAGE, offset: p.offset }),
  user: (userId: string) => `/admin/subscriptions/users/${encodeURIComponent(userId)}`,
  plans: '/admin/subscriptions/plans',
};

const postJson = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const subscriptionAdminApi = {
  /** days: null → süresiz; mode 'extend' geçerli aboneliği uzatır */
  grant: (userId: string, input: { days: number | null; note: string; mode: 'grant' | 'extend' }) =>
    apiFetch<{ data?: AdminUserSubscription }>(`/admin/subscriptions/users/${encodeURIComponent(userId)}/grant`, postJson(input)),
  revoke: (userId: string, note: string) =>
    apiFetch<{ data?: AdminUserSubscription }>(`/admin/subscriptions/users/${encodeURIComponent(userId)}/revoke`, postJson({ note })),
};

export function useSubscriptions(p: { status: SubStatusFilter; search?: string; offset: number }) {
  const list = usePaged<AdminSubscription>(subscriptionKeys.list(p));
  const summary = (list.data as { summary?: SubSummary } | undefined)?.summary ?? null;
  return { ...list, summary };
}

export function useUserSubscription(userId: string | null) {
  return useSWR<AdminUserSubscription>(userId ? subscriptionKeys.user(userId) : null, swrFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
}

export function usePlans() {
  return useSWR<Plan[]>(subscriptionKeys.plans, swrFetcher, { revalidateOnFocus: false });
}

/** "12 Kas 2026" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null;
}
