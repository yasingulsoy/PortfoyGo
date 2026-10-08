'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/context/AuthContext';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { TradeProvider } from '@/components/trade/TradeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import CommandPalette from '@/components/command/CommandPalette';
import Shortcuts from '@/components/command/Shortcuts';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ToastProvider>
        <AuthProvider>
          <PortfolioProvider>
            <TradeProvider>
              {children}
              <CommandPalette />
              <Shortcuts />
            </TradeProvider>
          </PortfolioProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
