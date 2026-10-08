'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import Footer from './Footer';
import { BARE_ROUTES } from './nav';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.includes(pathname);

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-fg">
        İçeriğe geç
      </a>
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
        {children}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
