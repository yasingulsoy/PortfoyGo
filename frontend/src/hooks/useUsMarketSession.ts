'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { MARKET_SESSION_KEY, marketSessionApi } from '@/lib/api';
import { stockSessionStatus, type StockSessionStatus, type UsMarketSession } from '@/lib/marketHours';
import { useNow } from './useNow';

/** setTimeout üst sınırı (~24,8 gün) */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * ABD hisse seansı (GET /api/market/session; tüm bileşenler tek isteği paylaşır).
 * 5 dakikada bir ve açılış/kapanış anında yeniden çekilir; geri sayım sunucu saatine göre.
 */
export function useUsMarketSession(): { session: UsMarketSession | null; error: unknown; refresh: () => Promise<unknown> } {
  const { data, error, mutate } = useSWR(MARKET_SESSION_KEY, marketSessionApi.get, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });

  // Seans geçişinde (açılış / kapanış) durumu sunucudan tazele
  useEffect(() => {
    if (!data || !data.enforced) return;
    const serverNow = Date.now() + data.clockOffsetMs;
    const wait = (data.open ? data.nextCloseAt : data.nextOpenAt) - serverNow + 2_000;
    if (wait <= 0 || wait > MAX_TIMEOUT_MS) return;
    const id = setTimeout(() => void mutate(), wait);
    return () => clearTimeout(id);
  }, [data, mutate]);

  return { session: data ?? null, error, refresh: mutate };
}

/** Hisse seans durumu + canlı geri sayım ("Piyasa kapalı · açılışa 3 sa 12 dk"). */
export function useStockSessionStatus(tickMs = 30_000): StockSessionStatus & { session: UsMarketSession | null } {
  const { session } = useUsMarketSession();
  const now = useNow(tickMs);
  return { ...stockSessionStatus(session, now), session };
}
