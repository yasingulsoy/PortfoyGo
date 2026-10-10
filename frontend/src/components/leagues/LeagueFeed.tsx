'use client';

import useSWR from 'swr';
import { BoltIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { useNow } from '@/hooks/useNow';
import { ApiError, leaguesApi } from '@/lib/api';
import { formatAgo } from '@/lib/competition';
import { leagueFeedKey } from './shared';

/** "Lig akışı": üyelerin son alım/satımları; devam eden ligde 30 sn'de bir yenilenir. */
export default function LeagueFeed({ leagueId, live }: { leagueId: string; live: boolean }) {
  const now = useNow(30_000);
  const { data, error, isLoading } = useSWR(leagueFeedKey(leagueId), ([, id]) => leaguesApi.feed(id), {
    refreshInterval: live ? 30_000 : 0,
    revalidateOnFocus: live,
    shouldRetryOnError: (err: unknown) => !(err instanceof ApiError && [403, 404].includes(err.status)),
  });
  const items = data ?? [];
  const unavailable = error instanceof ApiError && error.status === 404;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Lig akışı"
        description={live ? 'Rakiplerin son hamleleri · canlı' : 'Rakiplerin son hamleleri'}
        icon={<BoltIcon className="h-5 w-5" />}
      />
      {isLoading && !data ? (
        <ul className="space-y-3 border-t border-line px-5 py-4 sm:px-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </li>
          ))}
        </ul>
      ) : error && !data ? (
        unavailable ? (
          <EmptyState className="border-t border-line" icon={<BoltIcon />} title="Akış yakında" description="Lig akışı kısa süre içinde burada görünecek." />
        ) : (
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <Alert tone="error">Lig akışı şu an alınamadı.</Alert>
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={<BoltIcon />}
          title="Henüz hamle yok"
          description="Lig başladıktan sonra üyelerin alım ve satımları burada akar."
        />
      ) : (
        <ol className="max-h-[26rem] divide-y divide-line overflow-y-auto border-t border-line" aria-live="polite" aria-relevant="additions">
          {items.map((e) => {
            const buy = e.type === 'buy';
            return (
              <li key={e.id} className="animate-enter flex items-center gap-3 px-5 py-3 sm:px-6">
                <UserInitial name={e.username} size={32} tone="neutral" />
                <p className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="font-medium text-fg">{e.username}</span>{' '}
                  <span className="num font-semibold text-fg">{e.symbol}</span> <span className="text-muted">{buy ? 'aldı' : 'sattı'}</span>
                  <span className="block text-xs text-subtle">
                    <time dateTime={e.created_at}>{formatAgo(e.created_at, now)}</time>
                  </span>
                </p>
                <Badge tone={buy ? 'up' : 'down'} className="shrink-0">
                  {buy ? 'Alım' : 'Satım'}
                </Badge>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
