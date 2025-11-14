import useSWR from 'swr';
import { Stock } from '@/types';
import type { CryptoCoin } from '@/services/crypto';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

const jsonFetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Network response was not ok');
  const json = await res.json();
  // Backend'den { success: true, data: [...] } formatında geliyor
  if (json.success && json.data) {
    return json.data as T;
  }
  // Fallback: direkt array veya obje geliyorsa
  return json.data || json as T;
};

export function useStocks() {
  const { data, error, isLoading, mutate } = useSWR<Stock[], Error, string>(
    `${API_BASE_URL}/stocks`,
    (url) => jsonFetcher<Stock[]>(url),
    {
      refreshInterval: 60000, // 1 dakika (cache'den geldiği için daha uzun)
      revalidateOnFocus: true,
    }
  );

  return {
    stocks: data ?? [],
    lastUpdated: new Date(),
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

export function useCryptos() {
  const { data, error, isLoading, mutate } = useSWR<CryptoCoin[], Error, string>(
    `${API_BASE_URL}/cryptos?limit=25`,
    (url) => jsonFetcher<CryptoCoin[]>(url),
    {
      refreshInterval: 60000, // 1 dakika (cache'den geldiği için daha uzun)
      revalidateOnFocus: true,
    }
  );

  return {
    cryptos: data ?? [],
    isLoading,
    isError: error,
    refresh: mutate,
  };
}
