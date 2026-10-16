'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { ENTITLEMENTS_KEY, PLANS_KEY, subscriptionsApi, type EntitlementState, type FeatureKey } from '@/lib/subscriptions';

const OPTS = { revalidateOnFocus: true, dedupingInterval: 15_000 } as const;

/**
 * Kullanıcının abonelik durumu ve yetkileri (GET /api/me/entitlements).
 * `has(feature)` yalnızca arayüz içindir; asıl kontrol sunucudadır (402 SUBSCRIPTION_REQUIRED).
 */
export function useEntitlements() {
  const swr = useSWR<EntitlementState>(ENTITLEMENTS_KEY, () => subscriptionsApi.entitlements(), OPTS);
  const state = swr.data ?? null;
  const has = useCallback((feature: FeatureKey) => !!state?.entitlements.includes(feature), [state]);
  const startTrial = useCallback(async () => {
    const next = await subscriptionsApi.startTrial();
    await swr.mutate(next, { revalidate: false });
    return next;
  }, [swr]);
  return {
    state,
    loading: swr.isLoading && !swr.data,
    error: swr.error as unknown,
    has,
    isPremium: state ? state.status !== 'free' : false,
    startTrial,
    refresh: () => swr.mutate(),
  };
}

/** Plan karşılaştırması (GET /api/subscriptions/plans; nadiren değişir) */
export function usePlans() {
  return useSWR(PLANS_KEY, () => subscriptionsApi.plans(), { revalidateOnFocus: false, revalidateIfStale: false });
}
