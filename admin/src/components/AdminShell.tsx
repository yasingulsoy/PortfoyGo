'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRightStartOnRectangleIcon, ArrowTopRightOnSquareIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import Logo from '@portfoygo/shared/ui/Logo';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';
import Button, { buttonClasses } from '@portfoygo/shared/ui/Button';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useAdminAuth, useRequireAdmin } from '@/lib/auth';
import { APP_URL } from '@/lib/api';

/** Panel kabuğu: üst çubuk + yetki kapısı. /login sayfası kabuksuz gösterilir. */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;
  return <Guarded>{children}</Guarded>;
}

function Guarded({ children }: { children: ReactNode }) {
  const { status, ready } = useRequireAdmin();
  const { user, logout } = useAdminAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Yönetim paneli ana sayfa" className="flex items-center gap-3">
            <Logo />
            <Badge tone="brand">Yönetim</Badge>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <a href={APP_URL} className={buttonClasses('ghost', 'sm', 'hidden sm:inline-flex')}>
              Siteye git <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </a>
            <ThemeToggle />
            {user && (
              <>
                <span className="hidden max-w-[12rem] truncate text-sm text-muted md:inline">{user.username}</span>
                <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Çıkış yap">
                  <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Çıkış</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {status === 'forbidden' ? (
          <EmptyState
            icon={<ShieldExclamationIcon />}
            title="Bu alana erişim yetkiniz yok"
            description="Yönetim paneli yalnızca yönetici hesaplarına açıktır. Farklı bir hesapla giriş yapabilirsiniz."
            action={<Button onClick={() => void logout()}>Başka hesapla giriş yap</Button>}
          />
        ) : ready ? (
          children
        ) : (
          <PageLoader />
        )}
      </main>
    </div>
  );
}
