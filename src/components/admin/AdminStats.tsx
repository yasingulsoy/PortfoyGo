'use client';

import useSWR from 'swr';
import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  CheckBadgeIcon,
  NoSymbolIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import Button from '@/components/ui/Button';
import UserInitial from '@/components/profile/UserInitial';
import { adminApi } from '@/lib/api';
import { cn, formatNumber, formatTRY } from '@/lib/format';
import { pickStats, pickTopUsers } from './model';

export const ADMIN_STATS_KEY = 'admin:stats';

const ICONS: Record<string, typeof UsersIcon> = {
  users: UsersIcon,
  active: CheckBadgeIcon,
  banned: NoSymbolIcon,
  new: UserPlusIcon,
  tx: ArrowsRightLeftIcon,
  volume: BanknotesIcon,
  portfolio: WalletIcon,
};

const TONES = {
  brand: 'bg-brand-soft text-brand',
  up: 'bg-up-soft text-up',
  down: 'bg-down-soft text-down',
  gold: 'bg-gold-soft text-gold',
  neutral: 'bg-surface-2 text-muted',
};

export function useAdminStats() {
  return useSWR(ADMIN_STATS_KEY, () => adminApi.stats(), { refreshInterval: 120_000, revalidateOnFocus: false });
}

export default function AdminStats() {
  const { data, error, isLoading, mutate } = useAdminStats();
  const stats = pickStats(data);

  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert tone="error">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          İstatistikler alınamadı: {error instanceof Error ? error.message : 'beklenmeyen hata'}.
          <button type="button" onClick={() => void mutate()} className="font-semibold underline underline-offset-2">
            Tekrar dene
          </button>
        </span>
      </Alert>
    );
  }

  if (stats.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Genel istatistikler">
      {stats.map(({ def, value }) => {
        const Icon = ICONS[def.key] ?? UsersIcon;
        const text = def.kind === 'money' ? formatTRY(value) : formatNumber(value, 0);
        return (
          <li key={def.key} className="min-w-0">
            <Card className="h-full p-4">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', TONES[def.tone ?? 'neutral'])} aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-xs font-medium text-muted">{def.label}</p>
              <p className="num mt-1 truncate text-xl font-semibold tracking-tight" title={text}>
                {text}
              </p>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** İstatistik yanıtındaki ilk 10 kullanıcı (varsa). */
export function TopUsers() {
  const { data, isLoading } = useAdminStats();
  const users = pickTopUsers(data);

  return (
    <Card>
      <CardHeader icon={<TrophyIcon />} title="En değerli hesaplar" description="Toplam varlığa göre ilk 10" />
      {isLoading && !data ? (
        <div className="space-y-3 p-5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState title="Gösterilecek kullanıcı yok" className="py-8" />
      ) : (
        <ol className="divide-y divide-line">
          {users.slice(0, 10).map((u, i) => (
            <li key={u.id || u.username} className="flex items-center gap-3 px-5 py-2.5">
              <span className="num w-5 shrink-0 text-xs font-semibold text-subtle">{i + 1}</span>
              <UserInitial name={u.username} size={28} tone={i === 0 ? 'gold' : 'neutral'} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.username}</span>
              <span className="num shrink-0 text-sm">{formatTRY(u.totalValue)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function RetryStatsButton() {
  const { mutate, isValidating } = useAdminStats();
  return (
    <Button variant="ghost" size="sm" loading={isValidating} onClick={() => void mutate()}>
      İstatistikleri yenile
    </Button>
  );
}
