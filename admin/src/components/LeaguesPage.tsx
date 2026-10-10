'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon, TrashIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDate, formatDateTime, formatNumber } from '@portfoygo/shared/format';
import { adminApi, adminKeys } from '@/lib/api';
import { useDebouncedValue, usePaged } from '@/lib/hooks';
import type { AdminLeague } from '@/lib/types';
import { num } from './model';
import { useMetrics } from './Overview';
import { TableCardHeader, TableSkeleton, table } from './ui';
import { ConfirmModal, LoadError, Pagination, SearchInput, StaleNotice } from './controls';

const PAGE_SIZE = 20;

const isPast = (at: string) => new Date(at).getTime() <= Date.now();

function LeagueEnd({ endsAt }: { endsAt: string | null }) {
  if (!endsAt) return <Badge>Süresiz</Badge>;
  const ended = isPast(endsAt);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="whitespace-nowrap text-fg/80" title={formatDateTime(endsAt)}>
        {formatDate(endsAt)}
      </span>
      {ended ? <Badge>Bitti</Badge> : <Badge tone="up">Sürüyor</Badge>}
    </span>
  );
}

export default function LeaguesPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<AdminLeague | null>(null);
  const search = useDebouncedValue(query.trim(), 350);
  const metrics = useMetrics();

  const key = adminKeys.leagues({ search, limit: PAGE_SIZE, offset });
  const { items, total, error, loading, isValidating, mutate } = usePaged<AdminLeague>(key);

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Tüm ligler"
        description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} ${search ? 'eşleşen lig' : 'lig'} · en yeni önce`}
        actions={
          <SearchInput
            label="Lig ara"
            placeholder="Lig adı, kurucu veya davet kodu"
            value={query}
            onChange={(v) => {
              setQuery(v);
              setOffset(0);
            }}
          />
        }
      />
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Ligler yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={search ? <MagnifyingGlassIcon /> : <UserGroupIcon />}
          title={search ? 'Eşleşen lig yok' : 'Henüz lig yok'}
          description={search ? `"${search}" için sonuç bulunamadı.` : 'Kullanıcılar lig kurduğunda burada listelenir.'}
          className="border-t border-line"
        />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Lig listesi</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>Lig</th>
                <th scope="col" className={cn(table.th, 'hidden sm:table-cell')}>Kurucu</th>
                <th scope="col" className={cn(table.th, 'text-right')}>Üye</th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>Davet kodu</th>
                <th scope="col" className={cn(table.th, 'hidden lg:table-cell')}>Kuruluş</th>
                <th scope="col" className={cn(table.th, 'hidden sm:table-cell')}>Bitiş</th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-surface-2">
                  <td className={cn(table.td, 'max-w-[16rem]')}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
                        <UserGroupIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">{l.name}</p>
                        <p className="truncate text-xs text-subtle sm:hidden">
                          Kurucu:{' '}
                          <Link href={`/users/${encodeURIComponent(l.owner_id)}`} className="text-muted underline-offset-2 hover:underline">
                            {l.owner_username}
                          </Link>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap sm:table-cell')}>
                    <Link href={`/users/${encodeURIComponent(l.owner_id)}`} className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand">
                      <UserInitial name={l.owner_username} size={28} />
                      {l.owner_username}
                    </Link>
                  </td>
                  <td className={cn(table.td, 'num text-right text-fg')}>{formatNumber(num(l.member_count), 0)}</td>
                  <td className={cn(table.td, 'hidden md:table-cell')}>
                    <code className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs text-fg/80">{l.invite_code}</code>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap lg:table-cell')}>{formatDate(l.created_at)}</td>
                  <td className={cn(table.td, 'hidden sm:table-cell')}>
                    <LeagueEnd endsAt={l.ends_at} />
                  </td>
                  <td className={cn(table.td, 'text-right')}>
                    <Button
                      variant="down"
                      size="sm"
                      icon={<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={() => setTarget(l)}
                      aria-label={`${l.name} ligini sil`}
                    >
                      <span className="hidden sm:inline">Sil</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="Lig sayfaları" />

      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Ligi sil"
        description={target ? `${target.name} · ${formatNumber(num(target.member_count), 0)} üye` : undefined}
        confirmLabel="Ligi kalıcı olarak sil"
        tone="danger"
        reason={{ label: 'Gerekçe', placeholder: 'Denetim kaydına yazılır (ör. uygunsuz lig adı)' }}
        onConfirm={async (reason) => {
          if (!target) return;
          await adminApi.deleteLeague(target.id, reason || undefined);
          toast.success(`${target.name} ligi silindi`);
          setTarget(null);
          void mutate();
          void metrics.mutate();
        }}
      >
        <p>Lig ve tüm üyelikleri kalıcı olarak silinir; üyelerin portföyleri etkilenmez. Bu işlem geri alınamaz.</p>
      </ConfirmModal>
    </Card>
  );
}
