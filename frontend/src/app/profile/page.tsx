'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  ExclamationCircleIcon,
  LockClosedIcon,
  ScaleIcon,
  ShieldCheckIcon,
  TrophyIcon,
  WalletIcon,
} from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { leaderboardApi } from '@/lib/api';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatDate, formatNumber, formatPercent, formatTRY } from '@portfoygo/shared/format';
import type { User } from '@/types';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import Stat from '@portfoygo/shared/ui/Stat';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import BadgesGrid from '@/components/profile/BadgesGrid';
import ActivityLog from '@/components/profile/ActivityLog';
import { computeTradeStats } from '@/components/profile/tradeStats';
import { MY_RANK_KEY } from '@/components/leaderboard/MyRankCard';
import { normalizeMyRank } from '@/components/leaderboard/model';

export default function ProfilePage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hesap" title="Profil" description="Hesap bilgilerin, performansın, rozetlerin ve son aktivitelerin." />
      <UserCard user={user} />
      <StatsCard />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <BadgesGrid />
        <ActivityLog />
      </div>
      <SecurityCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UserCard({ user }: { user: User }) {
  const { data } = useSWR(user.email_verified ? MY_RANK_KEY : null, () => leaderboardApi.myRank(), { refreshInterval: 60_000 });
  const ranks = normalizeMyRank(data);
  const rank = ranks.rank ?? user.rank;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <UserInitial name={user.username} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{user.username}</h2>
            {user.email_verified ? (
              <Badge tone="up">
                <CheckBadgeIcon className="h-3.5 w-3.5" aria-hidden="true" /> Doğrulanmış
              </Badge>
            ) : (
              <Badge tone="gold">
                <ExclamationCircleIcon className="h-3.5 w-3.5" aria-hidden="true" /> Doğrulanmamış
              </Badge>
            )}
            {user.is_admin && (
              <Badge tone="brand">
                <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> Yönetici
              </Badge>
            )}
          </div>
          <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
          {!user.email_verified && (
            <p className="mt-2 text-xs text-muted">
              Liderlik tablosunda görünmek için{' '}
              <Link href="/verify-email" className="font-semibold text-brand underline underline-offset-2">
                e-postanı doğrula
              </Link>
              .
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm sm:w-72 sm:shrink-0">
          <div className="bg-surface p-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden="true" /> Üyelik
            </dt>
            <dd className="mt-1 font-medium">{user.created_at ? formatDate(user.created_at) : '—'}</dd>
          </div>
          <div className="bg-surface p-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <TrophyIcon className="h-3.5 w-3.5" aria-hidden="true" /> Sıralama
            </dt>
            <dd className="num mt-1 font-semibold">
              {rank ? (
                <Link href="/leaderboard" className="hover:text-brand">
                  #{rank}
                </Link>
              ) : (
                <span className="text-subtle">—</span>
              )}
            </dd>
            {ranks.rankWeek && <dd className="num text-xs text-subtle">Bu hafta #{ranks.rankWeek}</dd>}
          </div>
        </dl>
      </div>
      {!user.email_verified && (
        <div className="border-t border-line bg-surface-2/60 px-5 py-3 sm:px-6">
          <LinkButton href="/verify-email" size="sm" variant="primary">
            E-postamı doğrula
          </LinkButton>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function StatsCard() {
  const { totals, transactions, holdings, loaded } = useLivePortfolio();
  const stats = useMemo(() => computeTradeStats(transactions), [transactions]);
  const growth = totals.netWorth - STARTING_BALANCE;
  const closed = stats.wins + stats.losses;
  const winRate = closed > 0 ? (stats.wins / closed) * 100 : null;
  // Portföy bağlamı en fazla 100 işlem yükler
  const capped = transactions.length >= 100;

  return (
    <Card>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line lg:grid-cols-4">
        <StatCell>
          <Stat
            icon={<WalletIcon />}
            label="Toplam varlık"
            value={loaded ? formatTRY(totals.netWorth) : <Skeleton className="h-7 w-32" />}
            sub={
              loaded ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Delta value={(growth / STARTING_BALANCE) * 100} variant="text" />
                  <span className="text-subtle">başlangıçtan beri</span>
                </span>
              ) : undefined
            }
          />
        </StatCell>
        <StatCell>
          <Stat
            icon={<ArrowsRightLeftIcon />}
            label="Toplam işlem"
            value={loaded ? `${formatNumber(stats.total, 0)}${capped ? '+' : ''}` : <Skeleton className="h-7 w-16" />}
            sub={loaded ? `${formatNumber(stats.buys, 0)} alış · ${formatNumber(stats.sells, 0)} satış` : undefined}
          />
        </StatCell>
        <StatCell>
          <Stat
            icon={<ScaleIcon />}
            label="Kazanan / kaybeden"
            value={
              loaded ? (
                <span>
                  <span className="text-up">{stats.wins}</span>
                  <span className="text-subtle"> / </span>
                  <span className="text-down">{stats.losses}</span>
                </span>
              ) : (
                <Skeleton className="h-7 w-20" />
              )
            }
            sub={loaded ? (winRate == null ? 'Henüz kapanan satış yok' : `Başarı oranı ${formatPercent(winRate, { sign: false })}`) : undefined}
          />
        </StatCell>
        <StatCell>
          <Stat
            icon={<TrophyIcon />}
            label="Gerçekleşen K/Z"
            value={loaded ? <Money value={stats.realized} signed /> : <Skeleton className="h-7 w-28" />}
            sub={loaded ? `${holdings.length} açık pozisyon · K/Z ${formatTRY(totals.pl, { sign: true })}` : undefined}
          />
        </StatCell>
      </div>
    </Card>
  );
}

function StatCell({ children }: { children: ReactNode }) {
  return <div className="min-w-0 bg-surface p-4 sm:p-5">{children}</div>;
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
    <Card>
      <CardHeader icon={<LockClosedIcon />} title="Güvenlik" description="Oturumların ve hesap güvenliğin" />
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
