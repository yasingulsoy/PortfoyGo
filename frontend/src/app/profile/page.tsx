'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowRightStartOnRectangleIcon,
  CheckBadgeIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon,
  TrophyIcon,
} from '@heroicons/react/20/solid';
import { ArrowsRightLeftIcon, BanknotesIcon, ScaleIcon, WalletIcon } from '@heroicons/react/24/outline';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { leaderboardApi } from '@/lib/api';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatDate, formatNumber, formatPercent } from '@portfoygo/shared/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { User } from '@/types';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import Breadcrumb from '@/components/common/Breadcrumb';
import MetricCard, { MetricGrid } from '@/components/common/MetricCard';
import { toolbarButtonClass } from '@/components/common/controls';
import BadgesGrid from '@/components/profile/BadgesGrid';
import ActivityLog from '@/components/profile/ActivityLog';
import SeasonAwards from '@/components/profile/SeasonAwards';
import NotificationPrefsCard from '@/components/notifications/NotificationPrefsCard';
import DisplayPrefsCard from '@/components/profile/DisplayPrefsCard';
import ProfileVisibilityCard from '@/components/profile/ProfileVisibilityCard';
import ResponsibleProfileCard from '@/components/game/responsible/ResponsibleProfileCard';
import ArenaHistory from '@/components/arena/ArenaHistory';
import TwoFactorSection from '@/components/profile/TwoFactorSection';
import AccountDataCard from '@/components/profile/AccountDataCard';
import { computeTradeStats } from '@/components/profile/tradeStats';
import { MY_RANK_KEY } from '@/components/leaderboard/MyRankCard';
import { normalizeMyRank } from '@/components/leaderboard/model';

export default function ProfilePage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader title="Profil" description="Hesap bilgilerin, performansın, sezon unvanların, rozetlerin, oyun geçmişin ve son aktivitelerin." actions={<Breadcrumb items="Profil" />} />
      <UserCard user={user} />
      <InfoCard user={user} />
      <StatsRow />
      <SeasonAwards />
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2 xl:items-start">
        <BadgesGrid />
        <ActivityLog />
      </div>
      <ArenaHistory />
      <ProfileVisibilityCard />
      <DisplayPrefsCard />
      <NotificationPrefsCard />
      <ResponsibleProfileCard />
      <SecurityCard />
      <AccountDataCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useRanks(user: User) {
  const { data } = useSWR(user.email_verified ? MY_RANK_KEY : null, () => leaderboardApi.myRank(), { refreshInterval: 60_000 });
  const ranks = normalizeMyRank(data);
  return { rank: ranks.rank ?? user.rank, rankWeek: ranks.rankWeek };
}

/** TailAdmin profil "meta" kartı: avatar, ad, kısa bilgiler ve sağda sosyal bağlantı benzeri özet öğeler. */
function UserCard({ user }: { user: User }) {
  const { rank, rankWeek } = useRanks(user);

  return (
    <Card className="p-5 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full flex-col items-center gap-5 sm:flex-row sm:items-center xl:w-auto">
          <div className="rounded-full border border-line p-1">
            <UserInitial name={user.username} size={72} />
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <h2 className="flex flex-wrap items-center justify-center gap-2 text-lg font-semibold text-fg sm:justify-start">
              <span className="break-all">{user.username}</span>
              {user.is_admin && (
                <Badge tone="brand">
                  <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> Yönetici
                </Badge>
              )}
            </h2>
            <div className="mt-1.5 flex flex-col items-center gap-1 text-sm text-muted sm:flex-row sm:gap-3">
              <span className="break-all">{user.email}</span>
              <span className="hidden h-3.5 w-px bg-line-strong sm:block" aria-hidden="true" />
              <span>{user.created_at ? `${formatDate(user.created_at)} tarihinden beri üye` : 'Üye'}</span>
            </div>
          </div>
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-2 xl:justify-end" aria-label="Hesap özeti">
          <li>
            {user.email_verified ? (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-up">
                <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" /> Doğrulanmış
              </span>
            ) : (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-gold">
                <ExclamationCircleIcon className="h-4 w-4" aria-hidden="true" /> Doğrulanmamış
              </span>
            )}
          </li>
          <li>
            <Link
              href="/leaderboard"
              className="num inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2 hover:text-brand"
            >
              <TrophyIcon className="h-4 w-4 text-gold" aria-hidden="true" />
              <span className="sr-only">Genel sıralama: </span>
              {rank ? `#${rank}` : '—'}
              <span className="font-normal text-muted">genel</span>
            </Link>
          </li>
          {rankWeek && (
            <li>
              <span className="num inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-fg">
                #{rankWeek} <span className="font-normal text-muted">bu hafta</span>
              </span>
            </li>
          )}
        </ul>
      </div>
      {!user.email_verified && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Liderlik tablosunda görünmek ve liglere katılmak için e-posta adresini doğrula.</p>
          <LinkButton href="/verify-email" size="sm" className="shrink-0" icon={<EnvelopeIcon className="h-4 w-4" aria-hidden="true" />}>
            E-postamı doğrula
          </LinkButton>
        </div>
      )}
    </Card>
  );
}

/** TailAdmin "Kişisel bilgiler" kartı: etiket / değer ızgarası. */
function InfoCard({ user }: { user: User }) {
  const { rank, rankWeek } = useRanks(user);
  return (
    <Card className="p-5 lg:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-fg">Hesap bilgileri</h3>
          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:gap-x-24">
            <Info label="Kullanıcı adı">{user.username}</Info>
            <Info label="E-posta adresi">
              <span className="break-all">{user.email}</span>
            </Info>
            <Info label="E-posta durumu">
              {user.email_verified ? <Badge tone="up">Doğrulanmış</Badge> : <Badge tone="gold">Doğrulanmamış</Badge>}
            </Info>
            <Info label="Üyelik tarihi">{user.created_at ? formatDate(user.created_at) : '—'}</Info>
            <Info label="Hesap türü">{user.is_admin ? 'Yönetici' : 'Oyuncu'}</Info>
            <Info label="Sıralama">
              <span className="num">
                {rank ? `#${rank}` : '—'}
                {rankWeek ? <span className="text-muted"> · bu hafta #{rankWeek}</span> : null}
              </span>
            </Info>
          </dl>
        </div>
        <Link href="/leaderboard" className={toolbarButtonClass}>
          <TrophyIcon className="h-4 w-4" aria-hidden="true" />
          Sıralamaya git
        </Link>
      </div>
    </Card>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatsRow() {
  const { totals, transactions, holdings, loaded } = useLivePortfolio();
  const dc = useDisplayCurrency();
  const stats = useMemo(() => computeTradeStats(transactions), [transactions]);
  const growth = totals.netWorth - STARTING_BALANCE;
  const closed = stats.wins + stats.losses;
  const winRate = closed > 0 ? (stats.wins / closed) * 100 : null;
  // Portföy bağlamı en fazla 100 işlem yükler
  const capped = transactions.length >= 100;

  return (
    <MetricGrid>
      <MetricCard
        icon={<WalletIcon />}
        label="Toplam varlık"
        loading={!loaded}
        value={dc.money(totals.netWorth)}
        aside={<Delta value={(growth / STARTING_BALANCE) * 100} />}
        sub="başlangıçtan beri"
      />
      <MetricCard
        icon={<ArrowsRightLeftIcon />}
        label="Toplam işlem"
        loading={!loaded}
        value={`${formatNumber(stats.total, 0)}${capped ? '+' : ''}`}
        sub={`${formatNumber(stats.buys, 0)} alış · ${formatNumber(stats.sells, 0)} satış`}
      />
      <MetricCard
        icon={<ScaleIcon />}
        label="Kazanan / kaybeden"
        loading={!loaded}
        value={
          <span>
            <span className="text-up">{stats.wins}</span>
            <span className="text-subtle"> / </span>
            <span className="text-down">{stats.losses}</span>
          </span>
        }
        aside={winRate != null ? <Badge tone={winRate >= 50 ? 'up' : 'down'}>%{formatNumber(winRate, 0)} başarı</Badge> : undefined}
        sub={winRate == null ? 'Henüz kapanan satış yok' : `Başarı oranı ${formatPercent(winRate, { sign: false })}`}
      />
      <MetricCard
        icon={<BanknotesIcon />}
        label="Gerçekleşen K/Z"
        loading={!loaded}
        value={<Money value={dc.convert(stats.realized)} currency={dc.currency} signed />}
        sub={`${holdings.length} açık pozisyon · K/Z ${dc.money(totals.pl, { sign: true })}`}
      />
    </MetricGrid>
  );
}

/* ------------------------------------------------------------------ */

function SecurityCard() {
  const { logoutAll } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError('');
  };

  const confirm = async () => {
    setPending(true);
    setError('');
    const result = await logoutAll();
    // Başarılıysa AuthContext giriş sayfasına yönlendirir
    if (!result.success) {
      setError(result.message || 'İşlem başarısız. Lütfen tekrar dene.');
      setPending(false);
    }
  };

  return (
    // id="guvenlik": yönetim paneli ve 2FA bildirimleri buraya bağlantı verir (/profile#guvenlik)
    <Card id="guvenlik" className="scroll-mt-24">
      <CardHeader title="Güvenlik" description="Oturumların ve hesap güvenliğin" />
      <CardBody className="border-t border-line">
        <TwoFactorSection />
      </CardBody>
      <CardBody className="flex flex-col gap-4 border-t border-line sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-fg">Tüm cihazlardan çıkış yap</p>
          <p className="mt-1 text-muted">
            Telefon, tablet ve diğer tarayıcılar dahil açık olan tüm oturumların kapatılır. Hesabına tanımadığın bir
            cihazdan girildiğini düşünüyorsan bunu kullan ve ardından şifreni değiştir.
          </p>
        </div>
        <Button
          variant="down"
          className="shrink-0"
          icon={<ArrowRightStartOnRectangleIcon className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setOpen(true)}
        >
          Tüm cihazlardan çıkış yap
        </Button>
      </CardBody>

      <Modal
        open={open}
        onClose={close}
        size="sm"
        title="Tüm cihazlardan çıkış yapılsın mı?"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={pending} data-autofocus>
              Vazgeç
            </Button>
            <Button variant="danger" loading={pending} onClick={() => void confirm()}>
              Çıkış yap
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-muted">
          <p>Bu cihaz dahil tüm oturumların sonlandırılacak. Devam etmek için yeniden giriş yapman gerekecek.</p>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Modal>
    </Card>
  );
}
