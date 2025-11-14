import useSWR from 'swr';
import { Stock } from '@/types';
import type { CryptoCoin } from '@/services/crypto';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const jsonFetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Network response was not ok');
  const json = await res.json();
  return json.data || json as T;
};

export function useStocks() {
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; data: Stock[] }, Error, string>(
    `${API_BASE_URL}/stocks`,
    (url) => jsonFetcher<{ success: boolean; data: Stock[] }>(url),
    {
      refreshInterval: 60000, // 1 dakika (cache'den geldiği için daha uzun)
      revalidateOnFocus: true,
    }
  );

  return {
    stocks: data?.data ?? [],
    lastUpdated: new Date(),
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

export function useCryptos() {
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; data: CryptoCoin[] }, Error, string>(
    `${API_BASE_URL}/cryptos?limit=25`,
    (url) => jsonFetcher<{ success: boolean; data: CryptoCoin[] }>(url),
    {
      refreshInterval: 60000, // 1 dakika (cache'den geldiği için daha uzun)
      revalidateOnFocus: true,
    }
  );

  return {
    cryptos: data?.data ?? [],
    isLoading,
    isError: error,
    refresh: mutate,
  };
}
