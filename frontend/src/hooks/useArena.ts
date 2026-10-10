'use client';

import useSWR from 'swr';
import { ApiError, arenaApi } from '@/lib/api';
import type { ArenaChallengeStatus, ArenaLeaderPeriod } from '@/types';

/** Uç henüz yoksa / kayıt bulunamadıysa tekrar denemeye gerek yok. */
const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 403, 404].includes(err.status));

export function useArenaInstruments() {
  return useSWR(arenaApi.instrumentsKey, () => arenaApi.instruments(), { revalidateOnFocus: false, shouldRetryOnError: retryUnlessMissing });
}

/** Devam eden tur (yoksa null). */
export function useActiveArenaRound() {
  return useSWR(arenaApi.activeKey, () => arenaApi.active(), { shouldRetryOnError: retryUnlessMissing });
}

export function useArenaHistory(limit: number, offset: number) {
  return useSWR(arenaApi.historyKey(limit, offset), () => arenaApi.history(limit, offset), {
    keepPreviousData: true,
    shouldRetryOnError: retryUnlessMissing,
  });
}

export function useArenaLeaders(period: ArenaLeaderPeriod) {
  return useSWR(arenaApi.leadersKey(period), () => arenaApi.leaders(period), {
    keepPreviousData: true,
    refreshInterval: 60_000,
    shouldRetryOnError: retryUnlessMissing,
  });
}

/** Meydan okumalar; canlı / yaklaşan listeler dakikada bir yenilenir. */
export function useArenaChallenges(status: ArenaChallengeStatus) {
  return useSWR(arenaApi.challengesKey(status), () => arenaApi.challenges(status), {
    refreshInterval: status === 'finished' ? 0 : 30_000,
    shouldRetryOnError: retryUnlessMissing,
  });
}

export function useChallengeLeaderboard(id: string | null, live = false) {
  return useSWR(id ? arenaApi.challengeLeaderboardKey(id) : null, () => arenaApi.challengeLeaderboard(id!), {
    refreshInterval: live ? 15_000 : 0,
    shouldRetryOnError: retryUnlessMissing,
  });
}
