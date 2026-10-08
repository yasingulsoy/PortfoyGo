'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { portfolioApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useMarket } from '@/hooks/useMarketData';
import type { AssetType, Holding, Transaction } from '@/types';

interface PortfolioState {
  balance: number;
  holdings: Holding[];
  transactions: Transaction[];
  loaded: boolean;
  /** Son yükleme başarısız olduysa kullanıcıya gösterilecek mesaj */
  error: string | null;
}

interface PortfolioContextType extends PortfolioState {
  refresh: () => Promise<void>;
}

const INITIAL: PortfolioState = { balance: 0, holdings: [], transactions: [], loaded: false, error: null };

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

function mapHolding(item: any): Holding {
  return {
    id: String(item.id),
    symbol: String(item.symbol).toUpperCase(),
    name: item.name ?? item.symbol,
    assetType: (item.asset_type ?? 'stock') as AssetType,
    quantity: num(item.quantity),
    averagePrice: num(item.average_price),
    currentPrice: num(item.current_price),
    totalValue: num(item.total_value),
    profitLoss: num(item.profit_loss),
    profitLossPercent: num(item.profit_loss_percent),
  };
}

function mapTransaction(t: any): Transaction {
  return {
    id: String(t.id),
    type: t.type,
    symbol: String(t.symbol).toUpperCase(),
    name: t.name ?? t.symbol,
    assetType: (t.asset_type ?? 'stock') as AssetType,
    quantity: num(t.quantity),
    price: num(t.price),
    totalAmount: num(t.total_amount),
    commission: num(t.commission),
    netAmount: num(t.net_amount ?? t.total_amount),
    createdAt: t.created_at,
  };
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<PortfolioState>(INITIAL);
  // Eşzamanlı yenilemelerde yalnızca en son isteğin sonucu yazılır.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [portfolio, txs] = await Promise.all([portfolioApi.get(), portfolioApi.transactions(100)]);
      if (id !== requestId.current) return;
      setState({
        balance: num(portfolio?.balance),
        holdings: Array.isArray(portfolio?.portfolio) ? portfolio.portfolio.map(mapHolding) : [],
        transactions: Array.isArray(txs?.transactions) ? txs.transactions.map(mapTransaction) : [],
        loaded: true,
        error: null,
      });
    } catch (err) {
      if (id === requestId.current) {
        setState((s) => ({ ...s, loaded: true, error: err instanceof Error ? err.message : 'Portföy yüklenemedi.' }));
      }
      console.error('Portföy yüklenemedi', err);
    }
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      // Oturum kapandığında durumu sıfırla
      setState(INITIAL);
      return;
    }
    void refresh();
  }, [userId, refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio, PortfolioProvider içinde kullanılmalı');
  return ctx;
}

export interface LiveHolding extends Holding {
  livePrice: number;
  liveValue: number;
  livePL: number;
  livePLPercent: number;
  dayChangePercent: number | null;
  image?: string;
}

/**
 * Sunucudan gelen pozisyonları canlı piyasa fiyatlarıyla (TL) yeniden değerler.
 * Canlı fiyat yoksa sunucunun son değerlemesi kullanılır.
 */
export function useLivePortfolio() {
  const portfolio = usePortfolio();
  const market = useMarket();
  const { find } = market;

  const holdings = useMemo<LiveHolding[]>(
    () =>
      portfolio.holdings.map((h) => {
        const asset = find(h.assetType, h.symbol);
        const livePrice = asset?.priceTRY ?? h.currentPrice;
        const liveValue = livePrice * h.quantity;
        const cost = h.averagePrice * h.quantity;
        const livePL = liveValue - cost;
        return {
          ...h,
          livePrice,
          liveValue,
          livePL,
          livePLPercent: cost > 0 ? (livePL / cost) * 100 : 0,
          dayChangePercent: asset ? asset.changePercent : null,
          image: asset?.image,
        };
      }),
    [portfolio.holdings, find],
  );

  const totals = useMemo(() => {
    const invested = holdings.reduce((s, h) => s + h.averagePrice * h.quantity, 0);
    const value = holdings.reduce((s, h) => s + h.liveValue, 0);
    const pl = value - invested;
    return {
      invested,
      value,
      pl,
      plPercent: invested > 0 ? (pl / invested) * 100 : 0,
      netWorth: portfolio.balance + value,
    };
  }, [holdings, portfolio.balance]);

  return { ...portfolio, holdings, totals, market };
}
