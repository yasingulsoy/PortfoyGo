'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { ApiError, gameProfileApi } from '@/lib/api';
import { toGameProfile } from '@/components/game/model';
import { useAuth } from '@/context/AuthContext';
import type { GameProfile } from '@/types';

/** Uç henüz yoksa / yetki yoksa sürekli yeniden denenmesin. */
const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 401, 403, 404].includes(err.status));

/**
 * Oyun profili (jeton, XP, seviye, puan, kademe, seri, çark / görev rozetleri, sorumlu oyun durumu).
 * Anahtar `/game/profile`: ödül, mağaza ve görev işlemleri aynı anahtarı `mutate` ederek günceller.
 * Önbellekte ham (normalleştirilmemiş) veri olsa bile okurken normalleştirilir.
 */
export function useGameProfile() {
  const { user } = useAuth();
  const swr = useSWR(user ? gameProfileApi.profileKey : null, () => gameProfileApi.profile(), {
    shouldRetryOnError: retryUnlessMissing,
    revalidateOnFocus: true,
    dedupingInterval: 4_000,
  });
  const seed = user?.username ?? '';
  const profile = useMemo<GameProfile | undefined>(() => (swr.data ? toGameProfile(swr.data, seed) : undefined), [swr.data, seed]);
  return { profile, error: swr.error as unknown, isLoading: swr.isLoading, mutate: swr.mutate };
}
