'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import Logo from '@portfoygo/shared/ui/Logo';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';

/** Üst çubuktaki butonlar tema düğmesiyle aynı yükseklikte (40px / lg: 44px) */
const BTN =
  'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium shadow-card transition-colors sm:px-4 lg:h-11';

/**
 * Ziyaretçi üst çubuğu (TailAdmin beyaz başlık). Oturum açmış kullanıcılar SidebarLayout kabuğunu görür;
 * bu çubuk yalnızca misafirlere ve oturum kontrolü sürerken herkese açık sayfalarda gösterilir.
 */
export default function TopBar() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-[76px] lg:px-8">
        <Link href="/" aria-label="PortfoyGo ana sayfa" className="shrink-0 rounded-lg">
          <Logo />
        </Link>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {!loading && !user && (
            <>
              <Link href="/login" className={`${BTN} bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2 max-[359px]:hidden`}>
                Giriş yap
              </Link>
              <Link href="/register" className={`${BTN} bg-brand text-brand-fg hover:bg-brand-hover`}>
                <span className="sm:hidden">Kayıt ol</span>
                <span className="max-sm:hidden">Hesap oluştur</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
