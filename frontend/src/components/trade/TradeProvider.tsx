'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AssetType } from '@/types';
import TradeModal from './TradeModal';

export type TradeSide = 'buy' | 'sell';

/** İşlem penceresinin ihtiyaç duyduğu asgari varlık bilgisi. */
export interface TradeTarget {
  type: AssetType;
  symbol: string;
  name: string;
  image?: string;
}

interface TradeContextType {
  openTrade: (target: TradeTarget, side?: TradeSide) => void;
}

const TradeContext = createContext<TradeContextType | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<TradeTarget | null>(null);
  const [side, setSide] = useState<TradeSide>('buy');

  const openTrade = useCallback((t: TradeTarget, s: TradeSide = 'buy') => {
    setTarget(t);
    setSide(s);
  }, []);

  const value = useMemo(() => ({ openTrade }), [openTrade]);

  return (
    <TradeContext.Provider value={value}>
      {children}
      <TradeModal target={target} side={side} onSideChange={setSide} onClose={() => setTarget(null)} />
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrade, TradeProvider içinde kullanılmalı');
  return ctx;
}
