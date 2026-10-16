// Abonelik altyapısı (backend: services/subscriptions, migration 025). Ödeme sağlayıcısı yoktur: Premium yalnızca
// tek seferlik 14 günlük deneme veya ekip tanımıyla açılır. Yetkiler her zaman sunucuda çözülür; buradaki durum
// yalnızca arayüzü yönlendirir (asıl kapı: 402 SUBSCRIPTION_REQUIRED).

import { ApiError, apiFetch, post } from '@portfoygo/shared/api';

export const FEATURES = {
  GLOBAL_LAB_PRO: 'global_lab_pro',
  GLOBAL_LAB_NOTES: 'global_lab_notes',
  GLOBAL_LAB_COMPARE: 'global_lab_compare',
} as const;
export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES] | (string & {});

export type PlanId = 'free' | 'premium';

export interface PlanFeature {
  key: string;
  label: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string | null;
  features: PlanFeature[];
  price_display: string;
  sort_order: number;
}

export interface PlansResponse {
  plans: Plan[];
  trial_days: number;
  payment: { available: boolean; message: string };
}

export interface CurrentSubscription {
  id: string;
  plan_id: PlanId;
  status: 'trial' | 'active';
  source: 'trial' | 'admin' | 'payment';
  starts_at: string;
  ends_at: string | null;
  days_left: number | null;
}

export interface EntitlementState {
  plan: { id: PlanId; name: string; price_display: string };
  status: 'free' | 'trial' | 'active';
  entitlements: string[];
  current: CurrentSubscription | null;
  trial: { eligible: boolean; used: boolean; days: number; started_at: string | null; ended_at: string | null };
  payment: { available: boolean; message: string };
}

export const ENTITLEMENTS_KEY = '/me/entitlements';
export const PLANS_KEY = '/subscriptions/plans';

const unwrap = <T>(res: unknown): T => {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
};

export const subscriptionsApi = {
  entitlements: async () => unwrap<EntitlementState>(await apiFetch(ENTITLEMENTS_KEY)),
  plans: async () => unwrap<PlansResponse>(await apiFetch(PLANS_KEY)),
  startTrial: async () => unwrap<EntitlementState>(await apiFetch('/subscriptions/trial', post({}))),
};

/** Backend'in Premium kapısı (402 SUBSCRIPTION_REQUIRED) */
export const isSubscriptionRequired = (err: unknown): boolean =>
  err instanceof ApiError && (err.code === 'SUBSCRIPTION_REQUIRED' || err.status === 402);

/** "12 Kasım 2026" */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Durum özeti: "Ücretsiz plan", "Premium deneme · 12 gün kaldı", "Premium · süresiz" */
export function statusSummary(s: EntitlementState | null | undefined): string {
  if (!s || s.status === 'free') return 'Ücretsiz plan';
  const left = s.current?.days_left;
  const tail = left === null || left === undefined ? 'süresiz' : left <= 0 ? 'bugün bitiyor' : `${left} gün kaldı`;
  return `${s.status === 'trial' ? 'Premium deneme' : 'Premium'} · ${tail}`;
}

/** Planların özellik birleşimi (karşılaştırma tablosu satırları; ilk görülme sırası) */
export function featureRows(plans: Plan[]): { key: string; label: string; plans: Record<string, boolean> }[] {
  const order: PlanFeature[] = [];
  const seen = new Set<string>();
  for (const p of [...plans].sort((a, b) => a.sort_order - b.sort_order)) {
    for (const f of p.features) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      order.push(f);
    }
  }
  return order.map((f) => ({
    key: f.key,
    label: f.label,
    plans: Object.fromEntries(plans.map((p) => [p.id, p.features.some((x) => x.key === f.key)])),
  }));
}
