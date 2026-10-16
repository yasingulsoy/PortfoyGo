'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { ToastProvider } from '@portfoygo/shared/ui/Toast';
import { AdminAuthProvider } from '@/lib/auth';

export default function Providers({ children, nonce }: { children: ReactNode; /** CSP nonce (kök layout → proxy) */ nonce?: string }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange nonce={nonce}>
      <ToastProvider>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
