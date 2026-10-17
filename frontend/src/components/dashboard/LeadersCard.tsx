'use client';

import useSWR from 'swr';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { TrophyIcon } from '@heroicons/react/24/outline';
import { leaderboardApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import type { LeaderboardEntry } from '@/types';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

const MEDAL = ['bg-gold-soft text-gold', 'bg-surface-3 text-fg', 'bg-gold-soft text-bronze'];

/** Panel: tüm zamanların ilk 5 yatırımcısı. */
export default function LeadersCard({ className }: { className?: string }) {
  const dc = useDisplayCurrency();
  const { user } = useAuth();
  const { data, error, isLoading } = useSWR('leaders:top5', () => leaderboardApi.list(5, 'alltime'), { refreshInterval: 60_000 });
  const leaders: LeaderboardEntry[] = data?.leaderboard ?? [];

  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title="Liderler"
        description="Tüm zamanlar · ilk 5"
        action={
          <LinkButton href="/leaderboard" variant="ghost" size="sm">
            Tümü <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </LinkButton>
        }
      />
      {isLoading ? (
        <div className="space-y-4 px-5 pb-6 sm:px-6" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : leaders.length === 0 ? (
        <EmptyState className="py-8" icon={<TrophyIcon />} title={error ? 'Liderlik tablosu yüklenemedi' : 'Henüz sıralama yok'} />
      ) : (
        <ol className="px-5 pb-4 sm:px-6">
          {leaders.map((l, i) => {
            const me = user?.username === l.username;
            return (
              <li key={l.username} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                <span className={cn('num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', MEDAL[i] ?? 'bg-surface-2 text-muted')}>
                  {l.rank}
                </span>
                <UserInitial name={l.username} size={36} tone={me ? 'brand' : 'neutral'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">
                    {l.username}
                    {me && <span className="ml-1.5 text-xs font-normal text-brand">(sen)</span>}
                  </span>
                  <span className="num block truncate text-xs text-muted">{dc.money(l.total_value != null ? Number(l.total_value) : Number(l.portfolio_value) + Number(l.balance))}</span>
                </span>
                <Delta value={Number(l.profit_loss_percent)} />
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
