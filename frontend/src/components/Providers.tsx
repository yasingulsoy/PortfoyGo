'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/context/AuthContext';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { TradeProvider } from '@/components/trade/TradeProvider';
import { ToastProvider } from '@portfoygo/shared/ui/Toast';
import CommandPalette from '@/components/command/CommandPalette';
import Shortcuts from '@/components/command/Shortcuts';
import NotificationsProvider from '@/components/notifications/NotificationsProvider';

export default function Providers({ children, nonce }: { children: ReactNode; /** CSP nonce (kök layout → proxy) */ nonce?: string }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange nonce={nonce}>
      <ToastProvider>
        <AuthProvider>
          <NotificationsProvider>
            <PortfolioProvider>
              <TradeProvider>
                {children}
                <CommandPalette />
                <Shortcuts />
              </TradeProvider>
            </PortfolioProvider>
          </NotificationsProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
