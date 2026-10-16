'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { BanknotesIcon, ChartPieIcon, LockClosedIcon, WalletIcon } from '@heroicons/react/24/outline';
import {
  ArrowLeftIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  ClockIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserGroupIcon,
} from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import Tabs from '@portfoygo/shared/ui/Tabs';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDate, formatDateTime, formatNumber, formatQuantity, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { adminApi, adminKeys, swrFetcher } from '@/lib/api';
import { activityLabel, assetTypeLabel, errorStatus, isEndpointMissing, leagueRoleLabel } from '@/lib/labels';
import type { UserDetail as Detail } from '@/lib/types';
import { useAdminAuth } from '@/lib/auth';
import { num } from './model';
import { ADMIN_STATS_KEY } from './AdminStats';
import { MetricCard, PageBreadcrumb, table } from './ui';
import { ConfirmModal, LoadError } from './controls';
import { OrdersTableView, TransactionsTableView, useCancelOrder } from './RecordTables';

type ActionKey = 'role' | 'verify' | 'revoke' | 'ban';
type TabKey = 'holdings' | 'transactions' | 'orders' | 'activity' | 'leagues';

const bool = (v: unknown) => v === true || v === 'true' || v === 1 || v === 't';

export default function UserDetail({ userId }: { userId: string }) {
  const { user: me } = useAdminAuth();
  const toast = useToast();
  const { mutate: mutateKey } = useSWRConfig();
  const key = adminKeys.user(userId);
  const { data, error, isLoading, mutate } = useSWR<Detail>(key, swrFetcher, { revalidateOnFocus: false });
  const [action, setAction] = useState<ActionKey | null>(null);
  const [tab, setTab] = useState<TabKey>('holdings');
  const cancel = useCancelOrder(() => {
    void mutate();
  });

  const crumbs = [{ href: '/users', label: 'Kullanıcılar' }];

  if (isLoading && !data) {
    return (
      <>
        <PageBreadcrumb title="Kullanıcı detayı" crumbs={crumbs} />
        <div className="space-y-4 md:space-y-6" aria-hidden="true">
          <Card className="flex items-center gap-5 p-5 lg:p-6">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-4 w-48" />
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!data?.user) {
    const notFound = errorStatus(error) === 404 && !isEndpointMissing(error);
    return (
      <>
        <PageBreadcrumb title="Kullanıcı detayı" crumbs={crumbs} />
        <Card>
          {error ? (
            <LoadError
              error={error}
              title={notFound ? 'Kullanıcı bulunamadı' : 'Kullanıcı yüklenemedi'}
              description={notFound ? 'Bu kimliğe sahip bir hesap yok ya da silinmiş olabilir.' : undefined}
              onRetry={() => void mutate()}
              className="border-t-0"
            />
          ) : (
            <EmptyState title="Kullanıcı bulunamadı" />
          )}
          <div className="flex justify-center pb-8">
            <LinkButton href="/users" variant="secondary" size="sm" icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />}>
              Kullanıcılara dön
            </LinkButton>
          </div>
        </Card>
      </>
    );
  }

  const u = data.user;
  const isAdmin = bool(u.is_admin);
  const isBanned = bool(u.is_banned);
  const isDeleted = bool(u.is_deleted);
  const isBot = bool(u.is_bot);
  const verified = bool(u.email_verified);
  const self = String(me?.id ?? '') === String(u.id);
  const balance = num(u.balance);
  const reserved = num(u.reserved_cash);
  const portfolio = num(u.portfolio_value);
  const total = u.total_value != null ? num(u.total_value) : balance + reserved + portfolio;

  const holdings = data.holdings ?? [];
  const transactions = data.transactions ?? [];
  const orders = data.orders ?? [];
  const activity = data.activity ?? [];
  const leagues = data.leagues ?? [];
  const awards = data.awards ?? [];
  const activeOrders = orders.filter((o) => o.status === 'active').length;

  const refreshAll = () => {
    void mutate();
    void mutateKey(ADMIN_STATS_KEY);
    void mutateKey('admin:users:recent');
    void mutateKey((k) => typeof k === 'string' && k.startsWith('/admin/users?'));
    void mutateKey(adminKeys.metrics(30));
  };

  const ACTIONS: Record<ActionKey, { title: string; confirm: string; tone: 'primary' | 'danger'; body: ReactNode; run: () => Promise<unknown>; done: string }> = {
    role: {
      title: isAdmin ? 'Yöneticiliği kaldır' : 'Yönetici yap',
      confirm: isAdmin ? 'Yöneticiliği kaldır' : 'Yönetici yap',
      tone: isAdmin ? 'danger' : 'primary',
      body: isAdmin ? (
        <p>{u.username} yönetim paneline erişimini kaybeder. Açık panel oturumları bir sonraki istekte reddedilir.</p>
      ) : (
        <p>{u.username} yönetim paneline tam erişim kazanır: kullanıcıları yasaklayabilir, emirleri iptal edebilir ve ligleri silebilir.</p>
      ),
      run: () => adminApi.setRole(u.id, !isAdmin),
      done: isAdmin ? `${u.username} artık yönetici değil` : `${u.username} yönetici yapıldı`,
    },
    verify: {
      title: 'E-postayı doğrula',
      confirm: 'Doğrulanmış işaretle',
      tone: 'primary',
      body: <p>{u.email} adresi doğrulanmış sayılır; kullanıcı liderlik tablosuna ve sezonlara katılabilir.</p>,
      run: () => adminApi.verifyEmail(u.id),
      done: 'E-posta doğrulandı',
    },
    revoke: {
      title: 'Oturumları kapat',
      confirm: 'Tüm oturumları kapat',
      tone: 'danger',
      body: <p>{u.username} kullanıcısının tüm cihazlardaki açık oturumları sonlandırılır; yeniden giriş yapması gerekir.</p>,
      run: () => adminApi.revokeSessions(u.id),
      done: 'Oturumlar kapatıldı',
    },
    ban: {
      title: isBanned ? 'Yasağı kaldır' : 'Kullanıcıyı yasakla',
      confirm: isBanned ? 'Yasağı kaldır' : 'Yasakla',
      tone: isBanned ? 'primary' : 'danger',
      body: isBanned ? (
        <p>Bu kullanıcı yeniden giriş yapabilecek, işlem yapabilecek ve liderlik tablosunda görünebilecek.</p>
      ) : (
        <p>Yasaklanan kullanıcı oturum açamaz, işlem yapamaz ve liderlik tablosundan çıkarılır. Bu işlemi daha sonra geri alabilirsin.</p>
      ),
      run: () => adminApi.setBan(u.id, !isBanned),
      done: isBanned ? 'Yasak kaldırıldı' : `${u.username} yasaklandı`,
    },
  };

  const current = action ? ACTIONS[action] : null;

  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: 'holdings', label: 'Pozisyonlar', count: holdings.length },
    { value: 'transactions', label: 'İşlemler', count: transactions.length },
    { value: 'orders', label: 'Emirler', count: orders.length },
    { value: 'activity', label: 'Aktivite', count: activity.length },
    { value: 'leagues', label: 'Ligler & unvanlar', count: leagues.length + awards.length },
  ];

  return (
    <>
      <PageBreadcrumb title={u.username} crumbs={crumbs} />

      <div className="space-y-4 md:space-y-6">
        {isDeleted && (
          <Alert tone="info">
            Bu hesap{u.deleted_at ? ` ${formatDateTime(u.deleted_at)} tarihinde` : ''} kullanıcı tarafından silindi. Kişisel veriler
            anonimleştirildi; kalan işlem kayıtları yalnızca sıralama ve lig tutarlılığı için tutuluyor.
          </Alert>
        )}
        {/* Profil başlık kartı (TailAdmin profil düzeni) */}
        <Card className="p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              <UserInitial name={u.username} size={80} tone={isBanned ? 'neutral' : isAdmin ? 'gold' : 'brand'} className="border border-line" />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-fg">{u.username}</h2>
                <p className="mt-0.5 truncate text-sm text-muted">{u.email}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {isDeleted && <Badge>Silindi (KVKK)</Badge>}
                  {isBot && <Badge>Bot</Badge>}
                  {isBanned && <Badge tone="down">Yasaklı</Badge>}
                  {isAdmin && <Badge tone="brand">Yönetici</Badge>}
                  {verified ? <Badge tone="up">E-posta doğrulanmış</Badge> : <Badge tone="gold">E-posta doğrulanmamış</Badge>}
                  {self && <Badge>Sen</Badge>}
                </div>
                <dl className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted sm:justify-start">
                  <div className="flex gap-1">
                    <dt>Katıldı:</dt>
                    <dd className="text-fg/80">{u.created_at ? formatDate(u.created_at) : '—'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Son giriş:</dt>
                    <dd className="text-fg/80" title={u.last_login ? formatDateTime(u.last_login) : undefined}>
                      {u.last_login ? formatRelative(u.last_login) : 'Hiç giriş yok'}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Sıra:</dt>
                    <dd className="num text-fg/80">{u.rank ? `#${formatNumber(num(u.rank), 0)}` : '—'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
              <Button
                variant="secondary"
                size="md"
                icon={<ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setAction('role')}
                disabled={self}
                title={self ? 'Kendi rolünü değiştiremezsin' : undefined}
              >
                {isAdmin ? 'Yöneticiliği kaldır' : 'Yönetici yap'}
              </Button>
              {!verified && (
                <Button variant="secondary" icon={<CheckBadgeIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setAction('verify')}>
                  E-postayı doğrula
                </Button>
              )}
              <Button variant="secondary" icon={<ArrowRightStartOnRectangleIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setAction('revoke')}>
                Oturumları kapat
              </Button>
              {!self && (
                <Button
                  variant={isBanned ? 'secondary' : 'down'}
                  icon={<NoSymbolIcon className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setAction('ban')}
                >
                  {isBanned ? 'Yasağı kaldır' : 'Yasakla'}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4" aria-label="Hesap özeti">
          <li>
            <MetricCard icon={WalletIcon} label="Toplam varlık" value={formatTRY(total)} />
          </li>
          <li>
            <MetricCard icon={BanknotesIcon} label="Nakit" value={formatTRY(balance)} />
          </li>
          <li>
            <MetricCard icon={LockClosedIcon} label="Bloke nakit" value={formatTRY(reserved)} hint={activeOrders ? `${activeOrders} bekleyen emir` : 'Bekleyen emir yok'} />
          </li>
          <li>
            <MetricCard icon={ChartPieIcon} label="Portföy değeri" value={formatTRY(portfolio)} hint={`${holdings.length} pozisyon`} />
          </li>
        </ul>

        <Card className="min-w-0 overflow-hidden">
          <div className="px-5 pt-2 sm:px-6">
            <Tabs label="Kullanıcı ayrıntıları" variant="underline" items={tabs} value={tab} onChange={setTab} />
          </div>
          <div role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
            {tab === 'holdings' && <HoldingsPanel items={holdings} />}
            {tab === 'transactions' &&
              (transactions.length ? (
                <>
                  <PanelHeader text={`Son ${transactions.length} işlem`} link={{ href: `/transactions?search=${encodeURIComponent(u.username)}`, label: 'Tüm işlemler' }} />
                  <TransactionsTableView items={transactions} showUser={false} caption={`${u.username} işlemleri`} />
                </>
              ) : (
                <EmptyState icon={<ArrowsRightLeftIcon />} title="İşlem yok" description="Kullanıcı henüz alım satım yapmadı." />
              ))}
            {tab === 'orders' &&
              (orders.length ? (
                <>
                  <PanelHeader text={activeOrders ? `${activeOrders} bekleyen emir` : 'Bekleyen emir yok'} />
                  <OrdersTableView items={orders} showUser={false} caption={`${u.username} emirleri`} onCancel={cancel.open} />
                </>
              ) : (
                <EmptyState icon={<ClockIcon />} title="Emir yok" description="Kullanıcının limit veya stop emri bulunmuyor." />
              ))}
            {tab === 'activity' && <ActivityPanel items={activity} />}
            {tab === 'leagues' && <LeaguesPanel leagues={leagues} awards={awards} />}
          </div>
        </Card>
      </div>

      {cancel.modal}

      <ConfirmModal
        open={!!current}
        onClose={() => setAction(null)}
        title={current?.title ?? ''}
        description={`${u.username} · ${u.email}`}
        confirmLabel={current?.confirm ?? ''}
        tone={current?.tone}
        onConfirm={async () => {
          if (!current) return;
          const res: any = await current.run();
          toast.success(current.done, { description: res?.message });
          setAction(null);
          refreshAll();
        }}
      >
        {current?.body}
      </ConfirmModal>
    </>
  );
}

function PanelHeader({ text, link }: { text: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-muted sm:px-6">
      <span>{text}</span>
      {link && (
        <Link href={link.href} className="font-medium text-brand hover:text-brand-hover">
          {link.label}
        </Link>
      )}
    </div>
  );
}

function HoldingsPanel({ items }: { items: Detail['holdings'] }) {
  if (!items.length) return <EmptyState icon={<BriefcaseIcon />} title="Açık pozisyon yok" description="Kullanıcının portföyünde varlık bulunmuyor." />;
  return (
    <div className={cn(table.wrap, 'mt-2')}>
      <table className={table.table}>
        <caption className="sr-only">Açık pozisyonlar</caption>
        <thead>
          <tr className={table.headRow}>
            <th scope="col" className={table.th}>Varlık</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Miktar</th>
            <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>Ort. maliyet</th>
            <th scope="col" className={cn(table.th, 'hidden text-right md:table-cell')}>Güncel fiyat</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Değer</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Kâr / zarar</th>
          </tr>
        </thead>
        <tbody className={table.body}>
          {items.map((h) => (
            <tr key={h.id} className="transition-colors hover:bg-surface-2">
              <td className={table.td}>
                <p className="font-medium text-fg">{h.symbol}</p>
                <p className="max-w-[12rem] truncate text-xs text-subtle">
                  {h.name ? `${h.name} · ` : ''}
                  {assetTypeLabel(h.asset_type)}
                </p>
              </td>
              <td className={cn(table.td, 'num whitespace-nowrap text-right')}>{formatQuantity(num(h.quantity))}</td>
              <td className={cn(table.td, 'num hidden whitespace-nowrap text-right sm:table-cell')}>{formatTRY(num(h.average_price), { precise: true })}</td>
              <td className={cn(table.td, 'num hidden whitespace-nowrap text-right md:table-cell')}>{formatTRY(num(h.current_price), { precise: true })}</td>
              <td className={cn(table.td, 'num whitespace-nowrap text-right font-medium text-fg')}>{formatTRY(num(h.total_value))}</td>
              <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                <div className="flex flex-col items-end gap-0.5">
                  <Money value={num(h.profit_loss)} signed className="text-sm" />
                  <Delta value={num(h.profit_loss_percent)} variant="text" className="text-xs" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityPanel({ items }: { items: Detail['activity'] }) {
  if (!items.length) return <EmptyState icon={<ClockIcon />} title="Aktivite yok" description="Bu kullanıcı için kayıtlı etkinlik bulunmuyor." />;
  return (
    <ol className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg">
              <span className="font-medium">{activityLabel(a.activity_type)}</span>
              {a.description && <span className="text-muted"> · {a.description}</span>}
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
                {formatRelative(a.created_at)}
              </time>
              {a.ip_address && <span className="num"> · {a.ip_address}</span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LeaguesPanel({ leagues, awards }: { leagues: Detail['leagues']; awards: Detail['awards'] }) {
  return (
    <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
      <section aria-labelledby="ud-leagues" className="rounded-xl border border-line">
        <h3 id="ud-leagues" className="px-5 py-3 text-base font-semibold text-fg sm:px-6">
          Ligler
        </h3>
        {leagues.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {leagues.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                  <UserGroupIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="truncate">{l.name}</span>
                </span>
                <Badge tone={l.role === 'owner' ? 'gold' : 'neutral'}>{leagueRoleLabel(l.role)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-6 text-center text-sm text-muted sm:px-6">Hiçbir lige üye değil.</p>
        )}
      </section>
      <section aria-labelledby="ud-awards" className="rounded-xl border border-line">
        <h3 id="ud-awards" className="px-5 py-3 text-base font-semibold text-fg sm:px-6">
          Sezon unvanları
        </h3>
        {awards.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {awards.map((a, i) => (
              <li key={`${a.season_name}:${i}`} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <span
                  className={cn(
                    'num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    num(a.rank) === 1 ? 'bg-gold-soft text-gold' : 'bg-surface-3 text-muted',
                  )}
                >
                  {num(a.rank) === 1 ? <TrophyIcon className="h-4 w-4" aria-hidden="true" /> : num(a.rank)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{a.title}</p>
                  <p className="truncate text-xs text-muted">
                    {a.season_name} · {num(a.rank)}. sıra
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-6 text-center text-sm text-muted sm:px-6">Henüz sezon unvanı yok.</p>
        )}
      </section>
    </div>
  );
}
