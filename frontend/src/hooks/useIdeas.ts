'use client';

import { useCallback, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ApiError, leaguesApi } from '@/lib/api';
import { ideasApi, isIdeasKey } from '@/lib/ideas';
import { useDebouncedValue } from '@/hooks/usePicks';
import { LEAGUES_KEY } from '@/components/leagues/shared';
import type { AssetType } from '@portfoygo/shared/types';
import type { IdeaComment, IdeaListFilters } from '@/types/ideas';

/* Ortak Akıl — Öneri Havuzu veri kancaları (SWR). */

/** 4xx yanıtlarında (yok / yetki yok / doğrulama) sürekli yeniden denenmesin. */
const retryUnlessClientError = (err: unknown) => !(err instanceof ApiError && err.status >= 400 && err.status < 500);

export function useIdeaList(filters: IdeaListFilters, enabled = true) {
  const key = enabled ? ideasApi.listKey(filters) : null;
  return useSWR(key, () => ideasApi.list(filters), {
    keepPreviousData: true,
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: false,
    // Canlı performans (saklanmış fiyatlar sunucuda 60 sn önbellekli)
    refreshInterval: 2 * 60_000,
  });
}

export function useIdea(id: string | null) {
  return useSWR(id ? ideasApi.detailKey(id) : null, () => ideasApi.detail(id!), {
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: true,
    refreshInterval: 2 * 60_000,
  });
}

export function useIdeaChart(id: string | null) {
  return useSWR(id ? ideasApi.chartKey(id) : null, () => ideasApi.chart(id!), {
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: false,
    refreshInterval: 5 * 60_000,
  });
}

export function useIdeaCompare(ids: string[]) {
  return useSWR(ids.length >= 2 ? ideasApi.compareKey(ids) : null, () => ideasApi.compare(ids), {
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: false,
  });
}

/** Seçilebilir varlık araması (GET /picks/assets) */
export function useIdeaAssets(q: string, type: AssetType | null, enabled = true) {
  const query = useDebouncedValue(q.trim(), 300);
  return useSWR(enabled ? ideasApi.assetsKey(query, type) : null, () => ideasApi.assets(query, type), {
    keepPreviousData: true,
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
}

/** Kullanıcının ligleri (Ligler sayfasıyla aynı önbellek anahtarı) */
export function useMyLeagues(enabled = true) {
  return useSWR(enabled ? LEAGUES_KEY : null, () => leaguesApi.list(), { revalidateOnFocus: false, shouldRetryOnError: retryUnlessClientError });
}

/** Yorumlar: ilk sayfa SWR, eskiler "Daha eski yorumlar" ile eklenir. */
export function useIdeaComments(id: string | null) {
  const first = useSWR(id ? ideasApi.commentsKey(id) : null, () => ideasApi.comments(id!), {
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: false,
  });
  const [older, setOlder] = useState<{ for: string; items: IdeaComment[]; has_more: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const mine = older && older.for === id ? older : null;
  const items = [...(first.data?.items ?? []), ...(mine?.items ?? [])].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
  const hasMore = mine ? mine.has_more : first.data?.has_more === true;

  const loadMore = useCallback(async () => {
    if (!id || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const page = await ideasApi.comments(id, items[items.length - 1].id);
      setOlder((prev) => ({ for: id, items: [...(prev && prev.for === id ? prev.items : []), ...page.items], has_more: page.has_more }));
    } finally {
      setLoadingMore(false);
    }
  }, [id, items, loadingMore]);

  const reset = useCallback(() => setOlder(null), []);
  return { ...first, items, hasMore, loadMore, loadingMore, reset };
}

/** Bir değişiklikten sonra tüm Ortak Akıl listelerini / detaylarını yeniler. */
export function useRefreshIdeas() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(isIdeasKey), [mutate]);
}
