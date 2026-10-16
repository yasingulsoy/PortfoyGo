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

/** Pencere açılırken ön doldurma: satışta pozisyonun bir kısmı (%25 / %50 / %100 → 0.25 / 0.5 / 1). */
export interface TradePreset {
  sellFraction?: number;
}

interface TradeContextType {
  openTrade: (target: TradeTarget, side?: TradeSide, preset?: TradePreset) => void;
}

const TradeContext = createContext<TradeContextType | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<TradeTarget | null>(null);
  const [side, setSide] = useState<TradeSide>('buy');
  const [preset, setPreset] = useState<TradePreset | undefined>(undefined);
  // Her açılış yeni bir form (aynı varlık farklı kısayolla açılınca da sıfırlansın)
  const [openId, setOpenId] = useState(0);

  const openTrade = useCallback((t: TradeTarget, s: TradeSide = 'buy', p?: TradePreset) => {
    setTarget(t);
    setSide(s);
    setPreset(p);
    setOpenId((n) => n + 1);
  }, []);

  const value = useMemo(() => ({ openTrade }), [openTrade]);

  return (
    <TradeContext.Provider value={value}>
      {children}
      <TradeModal target={target} side={side} preset={preset} openId={openId} onSideChange={setSide} onClose={() => setTarget(null)} />
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrade, TradeProvider içinde kullanılmalı');
  return ctx;
}
