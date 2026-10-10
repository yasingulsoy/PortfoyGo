'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { TrophyIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { Money } from '@portfoygo/shared/ui/Delta';
import { adminApi } from '@/lib/api';
import { cn, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { normalizeUsers, pickTopUsers } from './model';
import { TableCardHeader, table } from './ui';

export const ADMIN_STATS_KEY = 'admin:stats';

export function useAdminStats() {
  return useSWR(ADMIN_STATS_KEY, () => adminApi.stats(), { refreshInterval: 120_000, revalidateOnFocus: false });
}

/** İstatistik yanıtındaki ilk 10 kullanıcı: TailAdmin tablo kartı. */
export function TopUsers() {
  const { data, isLoading } = useAdminStats();
  const users = pickTopUsers(data);

  return (
    <Card className="overflow-hidden">
      <TableCardHeader title="En değerli hesaplar" description="Toplam varlığa göre ilk 10 doğrulanmış hesap" />
      {isLoading && !data ? (
        <div className="space-y-3 px-5 pb-5 sm:px-6" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={<TrophyIcon />} title="Gösterilecek kullanıcı yok" description="Doğrulanmış hesap olduğunda burada sıralanır." className="py-10" />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <caption className="sr-only">Toplam varlığa göre en değerli 10 hesap</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={cn(table.th, 'w-12')}>#</th>
                <th scope="col" className={table.th}>Kullanıcı</th>
                <th scope="col" className={cn(table.th, 'hidden text-right md:table-cell')}>Nakit</th>
                <th scope="col" className={cn(table.th, 'hidden text-right lg:table-cell')}>Portföy</th>
                <th scope="col" className={cn(table.th, 'text-right')}>Toplam varlık</th>
                <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>Kâr / zarar</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {users.slice(0, 10).map((u, i) => (
                <tr key={u.id || u.username}>
                  <td className={cn(table.td, 'num font-medium text-subtle')}>{i + 1}</td>
                  <td className={cn(table.td, 'max-w-[14rem]')}>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserInitial name={u.username} size={36} tone={i === 0 ? 'gold' : 'brand'} />
                      <div className="min-w-0">
                        <Link href={`/users/${encodeURIComponent(u.id)}`} className="block truncate font-medium text-fg hover:text-brand">
                          {u.username}
                        </Link>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className={cn(table.td, 'num hidden whitespace-nowrap text-right md:table-cell')}>{formatTRY(u.balance)}</td>
                  <td className={cn(table.td, 'num hidden whitespace-nowrap text-right lg:table-cell')}>{formatTRY(u.portfolioValue)}</td>
                  <td className={cn(table.td, 'num whitespace-nowrap text-right font-medium text-fg')}>{formatTRY(u.totalValue)}</td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap text-right sm:table-cell')}>
                    <Money value={u.profitLoss} signed />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Son kaydolan kullanıcılar (kullanıcı listesi kayıt tarihine göre yeniden eskiye sıralıdır). */
export function RecentSignups() {
  const { data, error, isLoading } = useSWR('admin:users:recent', () => adminApi.users(6, 0), { revalidateOnFocus: false });
  const { users } = normalizeUsers(data);

  return (
    <Card className="h-full overflow-hidden">
      <TableCardHeader
        title="Son kayıtlar"
        description="En yeni 6 hesap"
        actions={
          <Link href="/users" className="text-sm font-medium text-brand transition-colors hover:text-brand-hover">
            Tümünü gör
          </Link>
        }
      />
      {isLoading && !data ? (
        <div className="space-y-3 px-5 pb-5 sm:px-6" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState title={error ? 'Kayıtlar yüklenemedi' : 'Henüz kayıt yok'} className="py-10" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {users.map((u) => (
            <li key={u.id} className="relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 sm:px-6">
              <UserInitial name={u.username} size={36} tone={u.isBanned ? 'neutral' : 'brand'} />
              <div className="min-w-0 flex-1">
                <Link href={`/users/${encodeURIComponent(u.id)}`} className="block truncate text-sm font-medium text-fg after:absolute after:inset-0">
                  {u.username}
                </Link>
                <p className="truncate text-xs text-muted">{u.createdAt ? formatRelative(u.createdAt) : '—'}</p>
              </div>
              {u.isBanned ? <Badge tone="down">Yasaklı</Badge> : u.emailVerified ? <Badge tone="up">Doğrulanmış</Badge> : <Badge tone="gold">Bekliyor</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
