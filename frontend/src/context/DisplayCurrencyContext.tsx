'use client';

import type { ReactNode } from 'react';
import { DisplayCurrencyContext, useDisplayCurrencyState } from '@/hooks/useDisplayCurrency';

/** Site geneli TL / USD görüntüleme tercihi (bkz. hooks/useDisplayCurrency.ts). Providers.tsx içinde bir kez. */
export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const value = useDisplayCurrencyState();
  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}
