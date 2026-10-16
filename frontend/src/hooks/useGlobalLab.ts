'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { ApiError, swrFetcher } from '@portfoygo/shared/api';
import {
  globalLabKeys,
  type Analysis,
  type CatalogFilters,
  type LabInstrument,
  type LabInstrumentDetail,
  type LabMeta,
  type SavedScenario,
} from '@/lib/globalLab';
import { useLocalStorage } from './useLocalStorage';

const retry = (err: unknown) => !(err instanceof ApiError && [400, 401, 402, 403, 404].includes(err.status));
const OPTS = { revalidateOnFocus: false, shouldRetryOnError: retry } as const;

export function useLabMeta() {
  return useSWR<LabMeta>(globalLabKeys.meta, swrFetcher, { ...OPTS, revalidateIfStale: false });
}

export function useLabInstruments(filters: CatalogFilters = {}) {
  return useSWR<{ items: LabInstrument[]; total: number }>(globalLabKeys.instruments(filters), swrFetcher, { ...OPTS, keepPreviousData: true });
}

export function useLabInstrument(symbol: string | null) {
  return useSWR<LabInstrumentDetail>(symbol ? globalLabKeys.instrument(symbol) : null, swrFetcher, OPTS);
}

export function useResearchList() {
  return useSWR<{ items: LabInstrument[]; total: number; limit: number }>(globalLabKeys.researchList, swrFetcher, OPTS);
}

export function useSavedScenarios(enabled = true) {
  return useSWR<{ items: SavedScenario[]; total: number; limit: number }>(enabled ? globalLabKeys.scenarios : null, swrFetcher, OPTS);
}

export function useExampleScenario(enabled = true) {
  return useSWR<{ scenario: { name: string; mode: 'cells'; base_currency: 'USD' | 'TRY'; horizon_years: number; amount: number; allocations: { key: string; weight: number }[] }; analysis: Analysis }>(
    enabled ? globalLabKeys.example : null,
    swrFetcher,
    { ...OPTS, revalidateIfStale: false }
  );
}

const COMPARE_KEY = 'pg:global-lab:compare';

/** Sınıflandır sekmesindeki karşılaştırma seçimi (en fazla `max` araç; bu tarayıcıda saklanır) */
export function useCompareSelection(max = 4) {
  const [raw, setRaw] = useLocalStorage(COMPARE_KEY);
  const ids = useMemo<string[]>(() => {
    try {
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];
    } catch {
      return [];
    }
  }, [raw, max]);
  const write = useCallback((next: string[]) => setRaw(next.length ? JSON.stringify(next.slice(0, max)) : null), [setRaw, max]);
  const toggle = useCallback(
    (id: string): 'added' | 'removed' | 'full' => {
      if (ids.includes(id)) {
        write(ids.filter((x) => x !== id));
        return 'removed';
      }
      if (ids.length >= max) return 'full';
      write([...ids, id]);
      return 'added';
    },
    [ids, max, write]
  );
  return { ids, toggle, clear: () => write([]), set: write, full: ids.length >= max };
}
