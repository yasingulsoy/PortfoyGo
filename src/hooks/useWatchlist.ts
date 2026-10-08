'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { ApiError, swrFetcher, watchlistApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AssetType } from '@/types';

export interface WatchlistItem {
  asset_type: AssetType;
  symbol: string;
  created_at: string;
}

/** Backend'deki WATCHLIST_LIMIT ile aynı olmalı (backend/src/services/watchlist.ts). */
export const WATCHLIST_LIMIT = 50;

const EMPTY: WatchlistItem[] = [];

const itemKey = (type: AssetType, symbol: string) => `${type}:${symbol.toUpperCase()}`;

/**
 * Kullanıcının izleme listesi. Tüm bileşenler aynı SWR önbelleğini paylaşır.
 * toggle() iyimser güncelleme yapar; istek başarısız olursa önceki duruma döner ve hata fırlatır.
 */
export function useWatchlist() {
  const { user } = useAuth();
  // Anahtar kullanıcıya özel: oturum değişince başka kullanıcının listesi görünmesin
  const key = user ? ([watchlistApi.key, user.id] as const) : null;
  const { data, error, isLoading, mutate } = useSWR<WatchlistItem[]>(key, ([url]: readonly [string, string]) => swrFetcher<WatchlistItem[]>(url), {
    revalidateOnFocus: false,
  });

  const items = data ?? EMPTY;
  const keys = useMemo(() => new Set(items.map((i) => itemKey(i.asset_type, i.symbol))), [items]);

  const isWatched = useCallback((type: AssetType, symbol: string) => keys.has(itemKey(type, symbol)), [keys]);

  const toggle = useCallback(
    async (type: AssetType, symbol: string): Promise<boolean> => {
      const sym = symbol.toUpperCase();
      const k = itemKey(type, sym);
      const watching = keys.has(k);

      if (!watching && keys.size >= WATCHLIST_LIMIT) {
        throw new ApiError(`İzleme listesine en fazla ${WATCHLIST_LIMIT} varlık eklenebilir`, 409);
      }

      await mutate(
        async () => {
          if (watching) await watchlistApi.remove(type, sym);
          else await watchlistApi.add(type, sym);
          return undefined;
        },
        {
          optimisticData: (current?: WatchlistItem[]) => {
            const list = current ?? EMPTY;
            return watching
              ? list.filter((i) => itemKey(i.asset_type, i.symbol) !== k)
              : [...list, { asset_type: type, symbol: sym, created_at: new Date().toISOString() }];
          },
          rollbackOnError: true,
          populateCache: false,
          revalidate: true,
        },
      );
      return !watching;
    },
    [keys, mutate],
  );

  return { items, isWatched, toggle, isLoading: !!key && isLoading, error, enabled: !!key };
}
