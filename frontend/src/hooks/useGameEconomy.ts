'use client';

import useSWR from 'swr';
import { ApiError, gameEconomyApi } from '@/lib/api';
import type { GameLeaderboardType } from '@/types';

/** Uç henüz yoksa / yetki yoksa tekrar denemeye gerek yok. */
const retryUnlessClientError = (err: unknown) => !(err instanceof ApiError && err.status >= 400 && err.status < 500);

const OPTS = { shouldRetryOnError: retryUnlessClientError } as const;

export function useGameWheel() {
  return useSWR(gameEconomyApi.wheelKey, () => gameEconomyApi.wheel(), { ...OPTS, revalidateOnFocus: false });
}

export function useGameQuests() {
  return useSWR(gameEconomyApi.questsKey, () => gameEconomyApi.quests(), OPTS);
}

export function useGameShop() {
  return useSWR(gameEconomyApi.shopKey, () => gameEconomyApi.shop(), { ...OPTS, revalidateOnFocus: false });
}

export function useGameLeaderboard(type: GameLeaderboardType, limit = 50) {
  return useSWR(gameEconomyApi.leaderboardKey(type, limit), () => gameEconomyApi.leaderboard(type, limit), {
    ...OPTS,
    keepPreviousData: true,
    refreshInterval: 60_000,
  });
}

export function useGameLedger(limit = 20, offset = 0) {
  return useSWR(gameEconomyApi.ledgerKey(limit, offset), () => gameEconomyApi.ledger(limit, offset), { ...OPTS, keepPreviousData: true });
}

/** Sorumlu oyun ayarları ve durumu (GET /game/responsible). */
export function useGameResponsible() {
  return useSWR(gameEconomyApi.responsibleKey, () => gameEconomyApi.responsible(), OPTS);
}
