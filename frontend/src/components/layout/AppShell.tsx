'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Squares2X2Icon,
  BriefcaseIcon,
  ArrowsRightLeftIcon,
  TrophyIcon,
  UserGroupIcon,
  NewspaperIcon,
  UserCircleIcon,
  ShieldCheckIcon,
  ChartBarSquareIcon,
  BoltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import SidebarLayout, { type SidebarSection } from '@portfoygo/shared/ui/SidebarLayout';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';
import AnimatedNumber from '@portfoygo/shared/ui/AnimatedNumber';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { formatTRY } from '@portfoygo/shared/format';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { openCommandPalette } from '@/components/command/events';
import { STARTING_BALANCE } from '@/lib/constants';
import { ADMIN_URL } from '@/lib/site';
import TopBar from './TopBar';
import Footer from './Footer';
import UserMenu from './UserMenu';
import NotificationBell from '@/components/notifications/NotificationBell';
import { BARE_ROUTES } from './nav';

/** Herkese açık sayfalar: misafirler bu sayfalarda menüsüz, sade üst çubukla gezer. */
const PUBLIC_ROUTES = ['/', '/terms', '/privacy'];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (BARE_ROUTES.includes(pathname)) return <>{children}</>;

  // Ziyaretçi (veya oturum kontrol edilirken herkese açık sayfa): sade üst çubuk + footer
  if (!user && (loading ? PUBLIC_ROUTES.includes(pathname) : true)) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          {children}
        </main>
        <Footer />
      </div>
    );
  }

  const sections: SidebarSection[] = [
    {
      title: 'Menü',
      items: [
        { href: '/', label: 'Panel', icon: Squares2X2Icon },
        { href: '/markets', label: 'Piyasalar', icon: ChartBarSquareIcon, match: (p) => p === '/markets' || p.startsWith('/asset/') },
        { href: '/portfolio', label: 'Portföy', icon: BriefcaseIcon },
        { href: '/transactions', label: 'İşlemler', icon: ArrowsRightLeftIcon },
        { href: '/advisor', label: 'Portföy Sihirbazı', icon: SparklesIcon },
      ],
    },
    {
      title: 'Oyun',
      items: [{ href: '/arena', label: 'Arena', icon: BoltIcon }],
    },
    {
      title: 'Rekabet',
      items: [
        { href: '/leaderboard', label: 'Liderlik', icon: TrophyIcon },
        { href: '/leagues', label: 'Ligler', icon: UserGroupIcon },
      ],
    },
    {
      title: 'Diğer',
      items: [
        { href: '/news', label: 'Haberler', icon: NewspaperIcon },
        { href: '/profile', label: 'Profil', icon: UserCircleIcon },
        ...(user?.is_admin ? [{ href: ADMIN_URL, label: 'Yönetim paneli', icon: ShieldCheckIcon, external: true }] : []),
      ],
    },
  ];

  return (
    <SidebarLayout
      sections={sections}
      onSearch={openCommandPalette}
      searchPlaceholder="Varlık ara veya komut yaz…"
      footer={<NetWorthWidget />}
      headerActions={
        <>
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </>
      }
    >
      {children}
    </SidebarLayout>
  );
}

/** Menünün altındaki özet kart (TailAdmin'deki alt kutu). */
function NetWorthWidget() {
  const { balance, totals, loaded } = useLivePortfolio();
  if (!loaded) return null;
  const change = ((totals.netWorth - STARTING_BALANCE) / STARTING_BALANCE) * 100;
  return (
    <Link href="/portfolio" className="block rounded-2xl bg-surface-2 px-4 py-5 text-center transition-colors hover:bg-surface-3">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">Toplam varlık</p>
      <p className="mt-1.5 text-xl font-semibold text-fg">
        <AnimatedNumber value={totals.netWorth} format={formatTRY} />
      </p>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs">
        <Delta value={change} />
        <span className="text-muted">Nakit {formatTRY(balance)}</span>
      </div>
    </Link>
  );
}
