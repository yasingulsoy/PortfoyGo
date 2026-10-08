'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, UsersIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import UserInitial from '@/components/profile/UserInitial';
import { adminApi } from '@/lib/api';
import { cn, formatDate, formatNumber, formatRelative, formatTRY } from '@/lib/format';
import { normalizeUsers, type AdminUser } from './model';
import { useAdminStats } from './AdminStats';

const PAGE_SIZE = 20;

export default function UsersTable({ currentUserId }: { currentUserId: string }) {
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const { data, error, isLoading, isValidating, mutate } = useSWR(`admin:users:${offset}`, () => adminApi.users(PAGE_SIZE, offset), {
    keepPreviousData: true,
  });
  const { mutate: mutateStats } = useAdminStats();
  const { users, total } = useMemo(() => normalizeUsers(data), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return users;
    return users.filter((u) => u.username.toLocaleLowerCase('tr').includes(q) || u.email.toLocaleLowerCase('tr').includes(q));
  }, [users, query]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openConfirm = (u: AdminUser) => {
    setModalError('');
    setTarget(u);
  };

  const confirmBan = async () => {
    if (!target) return;
    const ban = !target.isBanned;
    setSaving(true);
    setModalError('');
    try {
      const res = await adminApi.setBan(target.id, ban);
      setNotice({ tone: 'success', message: res?.message || (ban ? `${target.username} yasaklandı.` : `${target.username} kullanıcısının yasağı kaldırıldı.`) });
      setTarget(null);
      void mutate();
      void mutateStats();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<UsersIcon />}
        title="Kullanıcılar"
        description={data ? `${formatNumber(total, 0)} kayıtlı kullanıcı` : 'Yükleniyor'}
      />

      <div className="space-y-3 border-b border-line px-5 py-3">
        <label className="relative block sm:max-w-xs">
          <span className="sr-only">Bu sayfada kullanıcı ara</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kullanıcı adı veya e-posta"
            className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-sm placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
        {query && <p className="text-xs text-subtle">Arama yalnızca bu sayfadaki {users.length} kullanıcıda yapılır.</p>}
        {notice && (
          <Alert tone={notice.tone}>
            <span className="flex flex-wrap items-center gap-x-3">
              {notice.message}
              <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => setNotice(null)}>
                Kapat
              </button>
            </span>
          </Alert>
        )}
        {error && users.length > 0 && <Alert tone="error">Liste güncellenemedi; son alınan veriler gösteriliyor.</Alert>}
      </div>

      {isLoading && users.length === 0 ? (
        <div className="divide-y divide-line" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={error ? 'Kullanıcılar yüklenemedi' : 'Kullanıcı yok'}
          description={error instanceof Error ? error.message : undefined}
          action={error ? <Button variant="secondary" size="sm" onClick={() => void mutate()}>Tekrar dene</Button> : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<MagnifyingGlassIcon />} title="Eşleşen kullanıcı yok" description={`"${query}" bu sayfada bulunamadı.`} />
      ) : (
        <div className={cn('transition-opacity', isValidating && !isLoading && 'opacity-70')} aria-busy={isValidating}>
          {/* md+ : tablo */}
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Kullanıcı listesi, sayfa {page}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-subtle">
                <th scope="col" className="px-5 py-2.5 font-medium">Kullanıcı</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Durum</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Toplam varlık</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Nakit</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">Kayıt / son giriş</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">
                  <span className="sr-only">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((u) => (
                <tr key={u.id} className={cn('transition-colors hover:bg-surface-2/60', u.isBanned && 'bg-down-soft/40')}>
                  <td className="min-w-[12rem] max-w-[18rem] px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserInitial name={u.username} size={32} tone={u.isBanned ? 'neutral' : 'brand'} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.username}</p>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadges user={u} />
                  </td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right font-medium">{formatTRY(u.totalValue)}</td>
                  <td className="num hidden whitespace-nowrap px-3 py-3 text-right text-muted lg:table-cell">{formatTRY(u.balance)}</td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-muted xl:table-cell">
                    <p>{u.createdAt ? formatDate(u.createdAt) : '—'}</p>
                    <p className="text-subtle">{u.lastLogin ? formatRelative(u.lastLogin) : 'Hiç giriş yok'}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <BanButton user={u} self={u.id === currentUserId} onClick={() => openConfirm(u)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* mobil : kart listesi */}
          <ul className="divide-y divide-line md:hidden">
            {filtered.map((u) => (
              <li key={u.id} className={cn('space-y-2.5 px-5 py-3.5', u.isBanned && 'bg-down-soft/40')}>
                <div className="flex items-start gap-3">
                  <UserInitial name={u.username} size={36} tone={u.isBanned ? 'neutral' : 'brand'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.username}</p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                  <BanButton user={u} self={u.id === currentUserId} onClick={() => openConfirm(u)} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pl-12">
                  <StatusBadges user={u} />
                  <span className="num text-sm font-medium">{formatTRY(u.totalValue)}</span>
                </div>
                <p className="pl-12 text-xs text-subtle">
                  Kayıt {u.createdAt ? formatDate(u.createdAt) : '—'} · {u.lastLogin ? `son giriş ${formatRelative(u.lastLogin)}` : 'hiç giriş yok'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between gap-3 border-t border-line px-5 py-3" aria-label="Kullanıcı sayfaları">
          <p className="num text-xs text-muted">
            Sayfa {page} / {pages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} aria-label="Önceki sayfa">
              <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Önceki</span>
            </Button>
            <Button variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)} aria-label="Sonraki sayfa">
              <span className="hidden sm:inline">Sonraki</span>
              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

      <Modal
        open={!!target}
        onClose={() => !saving && setTarget(null)}
        size="sm"
        title={target?.isBanned ? 'Yasağı kaldır' : 'Kullanıcıyı yasakla'}
        description={target ? `${target.username} · ${target.email}` : undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={saving} data-autofocus>
              Vazgeç
            </Button>
            <Button variant={target?.isBanned ? 'primary' : 'danger'} loading={saving} onClick={() => void confirmBan()}>
              {target?.isBanned ? 'Yasağı kaldır' : 'Yasakla'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-muted">
          {target?.isBanned ? (
            <p>Bu kullanıcı yeniden giriş yapabilecek, işlem yapabilecek ve liderlik tablosunda görünebilecek.</p>
          ) : (
            <p>Yasaklanan kullanıcı oturum açamaz, işlem yapamaz ve liderlik tablosundan çıkarılır. Bu işlemi daha sonra geri alabilirsin.</p>
          )}
          {modalError && <Alert tone="error">{modalError}</Alert>}
        </div>
      </Modal>
    </Card>
  );
}

function StatusBadges({ user }: { user: AdminUser }) {
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
