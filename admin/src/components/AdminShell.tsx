'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  BoltIcon,
  CalendarDaysIcon,
  CircleStackIcon,
  FilmIcon,
  MegaphoneIcon,
  ClipboardDocumentListIcon,
  EnvelopeIcon,
  ClockIcon,
  ServerStackIcon,
  Squares2X2Icon,
  TrophyIcon,
  UsersIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { ShieldExclamationIcon } from '@heroicons/react/20/solid';
import SidebarLayout, { type SidebarSection } from '@portfoygo/shared/ui/SidebarLayout';
import Logo from '@portfoygo/shared/ui/Logo';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';
import Button from '@portfoygo/shared/ui/Button';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useAdminAuth, useRequireAdmin } from '@/lib/auth';
import { APP_URL } from '@/lib/api';
import AdminUserMenu from './AdminUserMenu';
import TwoFactorRequired from './TwoFactorRequired';

const SECTIONS: SidebarSection[] = [
  {
    title: 'Menü',
    items: [
      { href: '/', label: 'Genel bakış', icon: Squares2X2Icon },
      { href: '/users', label: 'Kullanıcılar', icon: UsersIcon },
      { href: '/transactions', label: 'İşlemler', icon: ArrowsRightLeftIcon },
      { href: '/orders', label: 'Emirler', icon: ClockIcon },
      { href: '/leagues', label: 'Ligler', icon: TrophyIcon },
      { href: '/arena', label: 'Arena', icon: BoltIcon, match: (p) => p === '/arena' || (p.startsWith('/arena/') && !p.startsWith('/arena/scenarios')) },
      { href: '/arena/scenarios', label: 'Senaryolar', icon: FilmIcon },
      { href: '/picks', label: 'Haftalık Seçim', icon: EnvelopeIcon },
      { href: '/ideas', label: 'Ortak Akıl', icon: LightBulbIcon },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { href: '/system', label: 'Sistem durumu', icon: ServerStackIcon },
      { href: '/cache', label: 'Piyasa önbelleği', icon: CircleStackIcon },
      { href: '/seasons', label: 'Sezonlar', icon: CalendarDaysIcon },
      { href: '/announcements', label: 'Duyurular', icon: MegaphoneIcon },
      { href: '/audit', label: 'Denetim kaydı', icon: ClipboardDocumentListIcon },
    ],
  },
  {
    title: 'Diğer',
    items: [{ href: APP_URL, label: 'Siteye git', icon: ArrowTopRightOnSquareIcon, external: true }],
  },
];

/** Panel kabuğu: TailAdmin kenar menüsü + üst çubuk + yetki kapısı. /login sayfası kabuksuz gösterilir. */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;
  return <Guarded>{children}</Guarded>;
}

function Guarded({ children }: { children: ReactNode }) {
  const { status, ready } = useRequireAdmin();
  const { logout } = useAdminAuth();

  // Yönetici, ama ADMIN_REQUIRE_2FA açık ve hesabında iki adımlı doğrulama kapalı
  if (status === '2fa_required') return <TwoFactorRequired />;

  // Yönetici olmayan hesap: menüsüz, sade bir uyarı ekranı
  if (status === 'forbidden') {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 sm:px-6">
          <Logo />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={<ShieldExclamationIcon />}
            title="Bu alana erişim yetkiniz yok"
            description="Yönetim paneli yalnızca yönetici hesaplarına açıktır. Farklı bir hesapla giriş yapabilirsiniz."
            action={<Button onClick={() => void logout()}>Başka hesapla giriş yap</Button>}
          />
        </main>
      </div>
    );
  }

  return (
    <SidebarLayout
      sections={SECTIONS}
      logoBadge={<Badge tone="brand">Yönetim</Badge>}
      headerActions={
        <>
          <ThemeToggle />
          <AdminUserMenu />
        </>
      }
    >
      {ready ? children : <PageLoader />}
    </SidebarLayout>
  );
}
