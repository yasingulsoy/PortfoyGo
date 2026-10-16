'use client';

import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ApiError, modelPortfolioApi, swrFetcher } from '@/lib/api';
import type {
  AdvisorTemplate,
  CompareItem,
  ModelDetail,
  ModelList,
  SandboxHistory,
  SandboxHistoryRange,
  SandboxMetrics,
  SandboxTrade,
} from '@/components/sandbox/types';

const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 403, 404].includes(err.status));
const OPTS = { revalidateOnFocus: false, shouldRetryOnError: retryUnlessMissing, keepPreviousData: true } as const;

export function useModelList() {
  return useSWR<ModelList>(modelPortfolioApi.listKey, swrFetcher, { ...OPTS, refreshInterval: 5 * 60_000 });
}

export function useModelDetail(id: string | null) {
  return useSWR<ModelDetail>(id ? modelPortfolioApi.detailKey(id) : null, swrFetcher, { ...OPTS, refreshInterval: 2 * 60_000 });
}

export function useModelHistory(id: string | null, range: SandboxHistoryRange) {
  return useSWR<SandboxHistory>(id ? modelPortfolioApi.historyKey(id, range) : null, swrFetcher, OPTS);
}

export function useModelMetrics(id: string | null) {
  return useSWR<SandboxMetrics>(id ? modelPortfolioApi.metricsKey(id) : null, swrFetcher, OPTS);
}

export function useModelTrades(id: string | null, limit = 20, offset = 0) {
  return useSWR<{ items: SandboxTrade[]; total: number }>(id ? modelPortfolioApi.tradesKey(id, limit, offset) : null, swrFetcher, OPTS);
}

export function useModelCompare(ids: string[]) {
  return useSWR<{ items: CompareItem[] }>(ids.length > 0 ? modelPortfolioApi.compareKey(ids) : null, swrFetcher, OPTS);
}

/** "Portföy Sihirbazı önerim" şablonu; plan yoksa 404 NO_ADVISOR_PLAN (hata olarak döner, tekrar denenmez). */
export function useAdvisorTemplate(enabled: boolean) {
  return useSWR<AdvisorTemplate>(enabled ? modelPortfolioApi.advisorTemplateKey : null, swrFetcher, { ...OPTS, revalidateIfStale: false });
}

/** Bir portföyle ilgili tüm önbellek anahtarlarını (ve listeyi) yeniler. */
export function useRefreshModel() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (id?: string) =>
      mutate(
        (key) =>
          typeof key === 'string' &&
          (key === modelPortfolioApi.listKey || key.startsWith('/model-portfolios/compare') || (!!id && key.startsWith(modelPortfolioApi.detailKey(id)))),
      ),
    [mutate],
  );
}
