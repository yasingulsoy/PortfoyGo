'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { type SWRConfiguration } from 'swr';
import { swrFetcher } from './api';
import type { Paged } from './types';

/** Değeri `ms` boyunca değişmezse yansıtır (arama kutusu → sunucu sorgusu). */
export function useDebouncedValue<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** { items, total, limit, offset } zarfını (veya düz diziyi) güvenle okur. */
export function toPaged<T>(res: unknown): Paged<T> {
  const r = res as Partial<Paged<T>> | T[] | null | undefined;
  if (Array.isArray(r)) return { items: r, total: r.length, limit: r.length, offset: 0 };
  const items = Array.isArray(r?.items) ? r.items : [];
  return { items, total: Number(r?.total ?? items.length) || 0, limit: Number(r?.limit ?? items.length) || 0, offset: Number(r?.offset ?? 0) || 0 };
}

/** Sayfalı liste uç noktası: önceki sayfa yeni veri gelene kadar görünür kalır. */
export function usePaged<T>(key: string | null, config?: SWRConfiguration) {
  const swr = useSWR<unknown>(key, swrFetcher, { keepPreviousData: true, revalidateOnFocus: false, ...config });
  const paged = useMemo(() => toPaged<T>(swr.data), [swr.data]);
  return { ...swr, ...paged, loading: swr.isLoading && swr.data === undefined };
}
