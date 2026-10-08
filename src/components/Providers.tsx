'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/context/AuthContext';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { TradeProvider } from '@/components/trade/TradeProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <PortfolioProvider>
          <TradeProvider>{children}</TradeProvider>
        </PortfolioProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
