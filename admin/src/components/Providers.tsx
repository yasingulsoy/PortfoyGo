'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { ToastProvider } from '@portfoygo/shared/ui/Toast';
import { AdminAuthProvider } from '@/lib/auth';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ToastProvider>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
