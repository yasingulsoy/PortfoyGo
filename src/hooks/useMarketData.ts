import useSWR from 'swr';
import { MarketData } from '@/types';
import type { CryptoCoin } from '@/services/crypto';

const jsonFetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Network response was not ok');
  return res.json() as Promise<T>;
};

export function useStocks() {
  const { data, error, isLoading, mutate } = useSWR<MarketData, Error, string>(
    '/api/stocks',
    (url) => jsonFetcher<MarketData>(url),
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    }
  );

  return {
    stocks: data?.stocks ?? [],
    lastUpdated: data?.lastUpdated ? new Date(data.lastUpdated) : null,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

export function useCryptos() {
  const { data, error, isLoading, mutate } = useSWR<CryptoCoin[], Error, [string, string]>(
    ['cryptos', 'usd'],
    async ([, vsCurrency]) => jsonFetcher<CryptoCoin[]>(`/api/cryptos?vs=${encodeURIComponent(vsCurrency)}&limit=25`),
    {
      refreshInterval: 30000,
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
