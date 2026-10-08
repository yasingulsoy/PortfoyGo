'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { cn, formatTRY } from '@/lib/format';
import Logo from '@/components/Logo';
import { LinkButton } from '@/components/ui/Button';
import { SearchTrigger } from '@/components/command/CommandPalette';
import ThemeToggle from './ThemeToggle';
import UserMenu from './UserMenu';
import { NAV_ITEMS, isActive } from './nav';

export default function TopBar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="PortfoyGo ana sayfa" className="shrink-0">
          <Logo />
        </Link>

        {user && (
          <nav aria-label="Ana menü" className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {user && <NetWorthChip />}
          <SearchTrigger />
          <ThemeToggle />
          {!loading && !user && (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">Giriş yap</LinkButton>
              <LinkButton href="/register" size="sm">Hesap oluştur</LinkButton>
            </>
          )}
          {user && <UserMenu />}
        </div>
      </div>
    </header>
  );
}

function NetWorthChip() {
  const { balance, totals, loaded } = useLivePortfolio();
  if (!loaded) return null;
  return (
    <Link
      href="/portfolio"
      className="hidden items-center gap-3 rounded-lg border border-line bg-surface px-3 py-1.5 transition-colors hover:border-line-strong sm:flex"
      title="Toplam varlık ve kullanılabilir nakit"
    >
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wider text-subtle">Toplam</span>
        <span className="num text-sm font-semibold text-fg">{formatTRY(totals.netWorth)}</span>
      </span>
      <span className="h-6 w-px bg-line" aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wider text-subtle">Nakit</span>
        <span className="num text-sm font-medium text-muted">{formatTRY(balance)}</span>
      </span>
    </Link>
  );
}
