'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { MagnifyingGlassIcon, UsersIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import Tabs from '@portfoygo/shared/ui/Tabs';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { adminApi, adminKeys, apiFetch, type UserStatusFilter } from '@/lib/api';
import { useDebouncedValue } from '@/lib/hooks';
import { cn, formatDate, formatNumber, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { normalizeUsers, num, type AdminUser } from './model';
import { ADMIN_STATS_KEY } from './AdminStats';
import { useMetrics } from './Overview';
import { TableCardHeader, TableSkeleton, table } from './ui';
import { ConfirmModal, LoadError, Pagination, SearchInput, StaleNotice } from './controls';

const PAGE_SIZE = 20;

const STATUS_TABS: { value: UserStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'banned', label: 'Yasaklı' },
  { value: 'admins', label: 'Yöneticiler' },
  { value: 'unverified', label: 'Doğrulanmamış' },
];

export const userHref = (id: string) => `/users/${encodeURIComponent(id)}`;

export default function UsersTable({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<UserStatusFilter>('all');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const search = useDebouncedValue(query.trim(), 350);

  const key = adminKeys.users({ limit: PAGE_SIZE, offset, search, status });
  const { data, error, isLoading, isValidating, mutate } = useSWR(key, (k: string) => apiFetch(k), { keepPreviousData: true, revalidateOnFocus: false });
  const { mutate: mutateKey } = useSWRConfig();
  const { users, total } = useMemo(() => normalizeUsers(data), [data]);
  const metrics = useMetrics();
  const t = metrics.data?.totals;

  const tabs = STATUS_TABS.map((tab) => ({
    ...tab,
    count: !t
      ? undefined
      : tab.value === 'all'
        ? num(t.users)
        : tab.value === 'banned'
          ? num(t.banned_users)
          : tab.value === 'admins'
            ? num(t.admins)
            : Math.max(0, num(t.users) - num(t.verified_users)),
  }));

  const confirmBan = async () => {
    if (!target) return;
    const ban = !target.isBanned;
    const res = await adminApi.setBan(target.id, ban);
    toast.success(ban ? `${target.username} yasaklandı` : `${target.username} kullanıcısının yasağı kaldırıldı`, { description: res?.message });
    setTarget(null);
    void mutate();
    void mutateKey(ADMIN_STATS_KEY);
    void mutateKey('admin:users:recent');
    void metrics.mutate();
  };

  const filtered = search !== '' || status !== 'all';
  const loading = isLoading && users.length === 0;

  return (
    <Card className="overflow-hidden">
      <TableCardHeader
        title="Tüm kullanıcılar"
        description={data ? `${formatNumber(total, 0)} ${filtered ? 'eşleşen' : 'kayıtlı'} kullanıcı · en yeni kayıt önce` : 'Yükleniyor'}
        actions={
          <SearchInput
            label="Kullanıcı ara"
            placeholder="Kullanıcı adı veya e-posta"
            value={query}
            onChange={(v) => {
              setQuery(v);
              setOffset(0);
            }}
          />
        }
      />
      <div className="px-5 pb-4 sm:px-6">
        <Tabs
          label="Kullanıcı durumu"
          items={tabs}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
          className="w-fit max-w-full"
        />
      </div>
      <StaleNotice show={!!error && users.length > 0} />

      {loading ? (
        <TableSkeleton />
      ) : error && users.length === 0 ? (
        <LoadError error={error} title="Kullanıcılar yüklenemedi" onRetry={() => void mutate()} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon /> : <UsersIcon />}
          title={filtered ? 'Eşleşen kullanıcı yok' : 'Kullanıcı yok'}
          description={search ? `"${search}" için sonuç bulunamadı.` : undefined}
          className="border-t border-line"
        />
      ) : (
        <div className={cn('transition-opacity', isValidating && !isLoading && 'opacity-70')} aria-busy={isValidating}>
          {/* md+ : tablo */}
          <div className={cn(table.wrap, 'hidden md:block')}>
            <table className={table.table}>
              <caption className="sr-only">Kullanıcı listesi</caption>
              <thead>
                <tr className={table.headRow}>
                  <th scope="col" className={table.th}>Kullanıcı</th>
                  <th scope="col" className={table.th}>Durum</th>
                  <th scope="col" className={cn(table.th, 'text-right')}>Toplam varlık</th>
                  <th scope="col" className={cn(table.th, 'hidden text-right lg:table-cell')}>Nakit</th>
                  <th scope="col" className={cn(table.th, 'hidden xl:table-cell')}>Kayıt / son giriş</th>
                  <th scope="col" className={cn(table.th, 'text-right')}>
                    <span className="sr-only">İşlem</span>
                  </th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {users.map((u) => (
                  <tr key={u.id} onClick={() => router.push(userHref(u.id))} className={cn(table.rowLink, u.isBanned && 'bg-down-soft/40')}>
                    <td className={cn(table.td, 'min-w-[12rem] max-w-[18rem]')}>
                      <div className="flex min-w-0 items-center gap-3">
                        <UserInitial name={u.username} size={40} tone={u.isBanned ? 'neutral' : 'brand'} />
                        <div className="min-w-0">
                          <Link href={userHref(u.id)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-fg hover:text-brand">
                            {u.username}
                          </Link>
                          <p className="truncate text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={table.td}>
                      <StatusBadges user={u} />
                    </td>
                    <td className={cn(table.td, 'num whitespace-nowrap text-right font-medium text-fg')}>{formatTRY(u.totalValue)}</td>
                    <td className={cn(table.td, 'num hidden whitespace-nowrap text-right lg:table-cell')}>{formatTRY(u.balance)}</td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap text-xs xl:table-cell')}>
                      <p>{u.createdAt ? formatDate(u.createdAt) : '—'}</p>
                      <p className="text-subtle">{u.lastLogin ? formatRelative(u.lastLogin) : 'Hiç giriş yok'}</p>
                    </td>
                    <td className={cn(table.td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                      <BanButton user={u} self={u.id === currentUserId} onClick={() => setTarget(u)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobil : kart listesi */}
          <ul className="divide-y divide-line border-t border-line md:hidden">
            {users.map((u) => (
              <li key={u.id} className={cn('relative space-y-2.5 px-5 py-4', u.isBanned && 'bg-down-soft/40')}>
                <div className="flex items-start gap-3">
                  <UserInitial name={u.username} size={40} tone={u.isBanned ? 'neutral' : 'brand'} />
                  <div className="min-w-0 flex-1">
                    <Link href={userHref(u.id)} className="block truncate text-sm font-medium text-fg after:absolute after:inset-0">
                      {u.username}
                    </Link>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                  <div className="relative z-10">
                    <BanButton user={u} self={u.id === currentUserId} onClick={() => setTarget(u)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pl-[52px]">
                  <StatusBadges user={u} />
                  <span className="num text-sm font-medium text-fg">{formatTRY(u.totalValue)}</span>
                </div>
                <p className="pl-[52px] text-xs text-subtle">
                  Kayıt {u.createdAt ? formatDate(u.createdAt) : '—'} · {u.lastLogin ? `son giriş ${formatRelative(u.lastLogin)}` : 'hiç giriş yok'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="Kullanıcı sayfaları" />

      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.isBanned ? 'Yasağı kaldır' : 'Kullanıcıyı yasakla'}
        description={target ? `${target.username} · ${target.email}` : undefined}
        confirmLabel={target?.isBanned ? 'Yasağı kaldır' : 'Yasakla'}
        tone={target?.isBanned ? 'primary' : 'danger'}
        onConfirm={confirmBan}
      >
        {target?.isBanned ? (
          <p>Bu kullanıcı yeniden giriş yapabilecek, işlem yapabilecek ve liderlik tablosunda görünebilecek.</p>
        ) : (
          <p>Yasaklanan kullanıcı oturum açamaz, işlem yapamaz ve liderlik tablosundan çıkarılır. Bu işlemi daha sonra geri alabilirsin.</p>
        )}
      </ConfirmModal>
    </Card>
  );
}

export function StatusBadges({ user }: { user: Pick<AdminUser, 'isBanned' | 'isAdmin' | 'emailVerified'> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.isBanned && <Badge tone="down">Yasaklı</Badge>}
      {user.isAdmin && <Badge tone="brand">Yönetici</Badge>}
      {user.emailVerified ? <Badge tone="up">Doğrulanmış</Badge> : <Badge>Doğrulanmamış</Badge>}
    </span>
  );
}

function BanButton({ user, self, onClick }: { user: AdminUser; self: boolean; onClick: () => void }) {
  if (self) return <span className="text-xs text-subtle">Sen</span>;
  return (
    <Button
      variant={user.isBanned ? 'secondary' : 'down'}
      size="sm"
      onClick={onClick}
      aria-label={user.isBanned ? `${user.username} yasağını kaldır` : `${user.username} kullanıcısını yasakla`}
    >
      {user.isBanned ? 'Yasağı kaldır' : 'Yasakla'}
    </Button>
  );
}
