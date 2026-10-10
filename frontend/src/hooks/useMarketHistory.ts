'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import {
  marketHistoryApi,
  SPARKLINE_BATCH,
  type MarketHistoryPoint,
  type MarketPerformance,
  type MarketRange,
  type Sparklines,
} from '@/lib/api';
import type { AssetType } from '@/types';

const EMPTY_POINTS: MarketHistoryPoint[] = [];

/** Artan, tekil ve sonlu zaman damgalı nokta listesi (lightweight-charts bunu şart koşar). */
export function cleanPoints(points: readonly MarketHistoryPoint[] | null | undefined): MarketHistoryPoint[] {
  if (!points || points.length === 0) return EMPTY_POINTS;
  const byTime = new Map<number, number>();
  for (const p of points) {
    const t = Math.floor(Number(p?.t));
    const v = Number(p?.v);
    if (Number.isFinite(t) && Number.isFinite(v)) byTime.set(t, v);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

/* ------------------------------------------------------------------ */
/* Fiyat geçmişi                                                       */
/* ------------------------------------------------------------------ */

/** Yedek kaynak (/api/asset/history, CoinGecko) için gün sayısı. Rota en fazla 365 gün döndürür. */
function fallbackDays(range: MarketRange): number {
  switch (range) {
    case '1D':
      return 1;
    case '1W':
      return 7;
    case '1M':
      return 30;
    case '3M':
      return 90;
    case '6M':
      return 180;
    case 'YTD': {
      const now = new Date();
      const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
      return Math.max(1, Math.ceil((now.getTime() - jan1) / 86_400_000));
    }
    default:
      return 365;
  }
}

async function fetchCryptoFallback([, coinId, range]: readonly [string, string, MarketRange]): Promise<MarketHistoryPoint[]> {
  const res = await fetch(`/api/asset/history?type=crypto&id=${encodeURIComponent(coinId)}&days=${fallbackDays(range)}`);
  if (!res.ok) return EMPTY_POINTS;
  const json = (await res.json()) as { series?: { time: number; value: number }[] };
  return cleanPoints((json.series ?? []).map((p) => ({ t: p.time, v: p.value })));
}

export interface UseMarketHistory {
  /** Varlığın kendi kotasyon para birimindeki noktalar */
  points: MarketHistoryPoint[];
  currency: 'USD' | 'TRY';
  /** İlk yükleme (gösterilecek hiç veri yok) */
  isLoading: boolean;
  /** Arka planda yenileniyor / aralık değişti, eski veri gösteriliyor */
  isValidating: boolean;
  error: unknown;
  source: 'api' | 'fallback' | null;
}

/**
 * Bir varlığın fiyat geçmişi. Kripto için backend boş dönerse CoinGecko yedeğine düşer.
 * Aralık değişince önceki seri, yenisi gelene kadar gösterilmeye devam eder.
 */
export function useMarketHistory(type: AssetType, symbol: string, range: MarketRange, coinId?: string): UseMarketHistory {
  const key = symbol ? marketHistoryApi.historyKey(type, symbol, range) : null;
  const primary = useSWR(key, () => marketHistoryApi.history(type, symbol, range), {
    revalidateOnFocus: false,
    keepPreviousData: true,
    refreshInterval: range === '1D' ? 60_000 : 5 * 60_000,
    errorRetryCount: 2,
  });

  const apiPoints = useMemo(() => cleanPoints(primary.data?.points), [primary.data]);
  const settled = !primary.isLoading && (primary.data !== undefined || primary.error !== undefined);
  const needFallback = type === 'crypto' && !!coinId && settled && apiPoints.length < 2;

  const fallback = useSWR(needFallback ? (['asset-history', coinId, range] as const) : null, fetchCryptoFallback, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    refreshInterval: 5 * 60_000,
  });

  if (needFallback) {
    const pts = fallback.data ?? EMPTY_POINTS;
    return {
      points: pts,
      currency: 'USD',
      isLoading: fallback.isLoading,
      isValidating: fallback.isValidating,
      error: fallback.error,
      source: pts.length > 1 ? 'fallback' : null,
    };
  }

  return {
    points: apiPoints,
    currency: primary.data?.currency === 'TRY' ? 'TRY' : 'USD',
    isLoading: primary.isLoading && apiPoints.length === 0,
    isValidating: primary.isValidating,
    error: primary.error,
    source: apiPoints.length > 1 ? 'api' : null,
  };
}

/* ------------------------------------------------------------------ */
/* Dönemsel performans                                                 */
/* ------------------------------------------------------------------ */

export function useMarketPerformance(type: AssetType, symbol: string) {
  const key = symbol ? marketHistoryApi.performanceKey(type, symbol) : null;
  const { data, error, isLoading } = useSWR<MarketPerformance | null>(key, () => marketHistoryApi.performance(type, symbol), {
    revalidateOnFocus: false,
    refreshInterval: 10 * 60_000,
    errorRetryCount: 2,
  });
  return { performance: data ?? null, error, isLoading };
}

/* ------------------------------------------------------------------ */
/* Mini grafikler (7 gün)                                              */
/* ------------------------------------------------------------------ */

export const sparklineKey = (type: AssetType, symbol: string) => `${type}:${symbol.toUpperCase()}`;

async function fetchSparklines([, joined]: readonly [string, string]): Promise<Sparklines | null> {
  const ids = joined.split(',');
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += SPARKLINE_BATCH) chunks.push(ids.slice(i, i + SPARKLINE_BATCH));
  const results = await Promise.all(chunks.map((c) => marketHistoryApi.sparklines(c)));
  if (results.every((r) => r === null)) return null;
  return Object.assign({}, ...results.filter(Boolean)) as Sparklines;
}

/**
 * Listelenen varlıkların 7 günlük kapanış serileri; tek istekte (en fazla 60'lık gruplar halinde) alınır.
 * Anahtar, sıralanmış öğe listesinden üretilir; aynı küme için tekrar istek atılmaz.
 */
export function useSparklines(items: ReadonlyArray<{ type: AssetType; symbol: string }>) {
  const joined = useMemo(() => [...new Set(items.map((i) => sparklineKey(i.type, i.symbol)))].sort().join(','), [items]);
  const { data, isLoading } = useSWR(joined ? (['sparklines', joined] as const) : null, fetchSparklines, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    refreshInterval: 10 * 60_000,
    dedupingInterval: 60_000,
    errorRetryCount: 1,
  });

  const get = useCallback((type: AssetType, symbol: string) => data?.[sparklineKey(type, symbol)], [data]);
  return { get, isLoading, available: !!data };
}
