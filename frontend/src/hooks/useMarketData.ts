'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import type { AssetType, CryptoCoin, MarketAsset, RateQuote, StockQuote } from '@/types';

// Referansı sabit boş diziler: `data ?? []` her render'da yeni dizi üretip
// effect döngülerine yol açıyordu.
const EMPTY_STOCKS: StockQuote[] = [];
const EMPTY_CRYPTOS: CryptoCoin[] = [];
const EMPTY_RATES: RateQuote[] = [];

const swrOptions = { revalidateOnFocus: true, keepPreviousData: true } as const;

export function useStocks() {
  const { data, error, isLoading, mutate } = useSWR<StockQuote[]>('/stocks', swrFetcher, { ...swrOptions, refreshInterval: 15_000 });
  return { stocks: data ?? EMPTY_STOCKS, error, isLoading, refresh: mutate };
}

export function useCryptos() {
  const { data, error, isLoading, mutate } = useSWR<CryptoCoin[]>('/cryptos?limit=25', swrFetcher, { ...swrOptions, refreshInterval: 15_000 });
  return { cryptos: data ?? EMPTY_CRYPTOS, error, isLoading, refresh: mutate };
}

export function useCurrencies() {
  const { data, error, isLoading, mutate } = useSWR<RateQuote[]>('/currencies', swrFetcher, { ...swrOptions, refreshInterval: 300_000 });
  const currencies = data ?? EMPTY_RATES;
  const usdTry = useMemo(() => {
    const usd = currencies.find((c) => c.code === 'USD');
    const rate = usd ? usd.selling || usd.buying : 0;
    return rate > 0 ? rate : null;
  }, [currencies]);
  return { currencies, usdTry, error, isLoading, refresh: mutate };
}

export function useCommodities() {
  const { data, error, isLoading, mutate } = useSWR<RateQuote[]>('/commodities', swrFetcher, { ...swrOptions, refreshInterval: 60_000 });
  return { commodities: data ?? EMPTY_RATES, error, isLoading, refresh: mutate };
}

/** Gram altın (GAU) ve *TRY kodlu emtialar TL cinsinden kote edilir; diğerleri USD. Backend ile aynı kural. */
export function isTryQuotedCommodity(code: string): boolean {
  const c = code.toUpperCase();
  return c === 'GAU' || c.endsWith('TRY');
}

const rateValue = (r: RateQuote) => r.selling || r.price || r.buying || 0;

function toTRY(usd: number, usdTry: number | null): number | null {
  return usdTry ? usd * usdTry : null;
}

export const FEATURED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'SAR', 'CAD', 'AUD'];

/**
 * Dört piyasayı tek, TL bazlı bir modele indirger.
 * UI'daki tüm fiyat hesapları buradaki priceTRY değerini kullanır.
 */
export function useMarket() {
  const { stocks, isLoading: l1, error: e1 } = useStocks();
  const { cryptos, isLoading: l2, error: e2 } = useCryptos();
  const { currencies, usdTry, isLoading: l3, error: e3 } = useCurrencies();
  const { commodities, isLoading: l4, error: e4 } = useCommodities();

  const stockAssets = useMemo<MarketAsset[]>(
    () =>
      stocks.map((s) => ({
        key: `stock:${s.symbol.toUpperCase()}`,
        type: 'stock',
        symbol: s.symbol.toUpperCase(),
        name: s.name || s.symbol,
        priceUSD: s.price,
        priceTRY: toTRY(s.price, usdTry),
        changePercent: s.changePercent ?? 0,
        volume: s.volume,
        marketCap: s.marketCap,
        high: s.high,
        low: s.low,
        open: s.open,
        previousClose: s.previousClose,
      })),
    [stocks, usdTry],
  );

  const cryptoAssets = useMemo<MarketAsset[]>(
    () =>
      cryptos.map((c) => ({
        key: `crypto:${c.symbol.toUpperCase()}`,
        type: 'crypto',
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        priceUSD: c.current_price,
        priceTRY: toTRY(c.current_price, usdTry),
        changePercent: c.price_change_percentage_24h ?? 0,
        image: c.image,
        coinId: c.id,
        volume: c.total_volume,
        marketCap: c.market_cap,
      })),
    [cryptos, usdTry],
  );

  const currencyAssets = useMemo<MarketAsset[]>(
    () =>
      currencies
        .filter((c) => c.code !== 'TRY' && rateValue(c) > 0)
        .map((c) => ({
          key: `currency:${c.code.toUpperCase()}`,
          type: 'currency',
          symbol: c.code.toUpperCase(),
          name: c.name || c.code,
          priceUSD: null,
          priceTRY: rateValue(c),
          changePercent: c.change_rate ?? 0,
        })),
    [currencies],
  );

  const commodityAssets = useMemo<MarketAsset[]>(
    () =>
      commodities
        .filter((c) => rateValue(c) > 0)
        .map((c) => {
          const raw = rateValue(c);
          const tryQuoted = isTryQuotedCommodity(c.code);
          return {
            key: `commodity:${c.code.toUpperCase()}`,
            type: 'commodity',
            symbol: c.code.toUpperCase(),
            name: c.name || c.code,
            priceUSD: tryQuoted ? null : raw,
            priceTRY: tryQuoted ? raw : toTRY(raw, usdTry),
            changePercent: c.change_rate ?? 0,
          };
        }),
    [commodities, usdTry],
  );

  const byType = useMemo<Record<AssetType, MarketAsset[]>>(
    () => ({ stock: stockAssets, crypto: cryptoAssets, currency: currencyAssets, commodity: commodityAssets }),
    [stockAssets, cryptoAssets, currencyAssets, commodityAssets],
  );

  const index = useMemo(() => {
    const map = new Map<string, MarketAsset>();
    for (const list of Object.values(byType)) for (const a of list) map.set(a.key, a);
    return map;
  }, [byType]);

  const find = useCallback(
    (type: AssetType, symbol: string) => index.get(`${type}:${symbol.toUpperCase()}`),
    [index],
  );

  return {
    byType,
    find,
    usdTry,
    isLoading: l1 || l2 || l3 || l4,
    errors: { stock: e1, crypto: e2, currency: e3, commodity: e4 } as Record<AssetType, unknown>,
  };
}
