'use client';

import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ApiError, swrFetcher } from '@/lib/api';
import { isPortfolioLeagueKey, portfolioLeagueApi } from '@/lib/portfolioLeagues';
import type {
  PortfolioLeagueDetail,
  PortfolioLeaguePerformance,
  PortfolioLeaguePortfolio,
  PortfolioLeagueStandings,
  PortfolioLeagueStrategies,
} from '@/types/portfolioLeague';
import type { LeagueStatus } from '@/types';

const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 403, 404].includes(err.status));
const OPTS = { revalidateOnFocus: false, shouldRetryOnError: retryUnlessMissing, keepPreviousData: true } as const;
/** Devam eden ligde canlı yenileme; bitmiş / başlamamış ligde gerekmez */
const live = (status: LeagueStatus | undefined, ms: number) => (status === 'active' ? ms : 0);

export function usePortfolioLeague(id: string, status?: LeagueStatus) {
  return useSWR<PortfolioLeagueDetail>(portfolioLeagueApi.detailKey(id), swrFetcher, { ...OPTS, refreshInterval: status === 'finished' ? 0 : 30_000 });
}

export function usePortfolioStandings(id: string, status?: LeagueStatus, enabled = true) {
  return useSWR<PortfolioLeagueStandings>(enabled ? portfolioLeagueApi.standingsKey(id) : null, swrFetcher, { ...OPTS, refreshInterval: live(status, 30_000) });
}

export function usePortfolioPerformance(id: string, status?: LeagueStatus, enabled = true) {
  return useSWR<PortfolioLeaguePerformance>(enabled ? portfolioLeagueApi.performanceKey(id) : null, swrFetcher, {
    ...OPTS,
    refreshInterval: live(status, 5 * 60_000),
  });
}

export function usePortfolioStrategies(id: string, enabled = true) {
  return useSWR<PortfolioLeagueStrategies>(enabled ? portfolioLeagueApi.strategiesKey(id) : null, swrFetcher, OPTS);
}

export function useLeaguePortfolio(id: string, status?: LeagueStatus, enabled = true) {
  return useSWR<PortfolioLeaguePortfolio>(enabled ? portfolioLeagueApi.portfolioKey(id) : null, swrFetcher, { ...OPTS, refreshInterval: live(status, 60_000) });
}

/** Bu ligin tüm portföy ligi verisini yeniler (işlem / takım / not sonrası) */
export function useRefreshPortfolioLeague(id: string) {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(isPortfolioLeagueKey(id)), [mutate, id]);
}
