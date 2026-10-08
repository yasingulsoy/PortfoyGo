'use client';

import useSWR from 'swr';
import { ArchiveBoxIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { formatDate, formatNumber } from '@portfoygo/shared/format';
import { seasonsApi } from '@/lib/api';
import { TitleBadge } from './TitleBadge';

export const SEASONS_LIST_KEY = 'seasons:list';
const MAX_WINNERS = 3;

/** Sona ermiş sezonlar ve kazananları (en yeniden eskiye). */
export default function PastSeasons() {
  const { data, error, isLoading } = useSWR(SEASONS_LIST_KEY, () => seasonsApi.list(12), { revalidateOnFocus: false });
  const finished = (data ?? []).filter((s) => s.season.status === 'finished');

  // İlk sezon devam ederken boş bir kart göstermek yerine hiç gösterme
  if (!isLoading && !error && finished.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ArchiveBoxIcon />}
        title="Geçmiş sezonlar"
        description={isLoading ? 'Yükleniyor' : finished.length ? `${finished.length} sezon tamamlandı` : undefined}
      />
      {isLoading ? (
        <div className="space-y-4 p-5" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : error && finished.length === 0 ? (
        <div className="p-5">
          <Alert tone="error">Geçmiş sezonlar şu an alınamadı.</Alert>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {finished.map(({ season, participants, winners }) => (
            <li key={season.id || season.slug} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">{season.name}</h3>
                <p className="num text-xs text-subtle">
                  {formatDate(season.ends_at)} · {formatNumber(participants, 0)} katılımcı
                </p>
              </div>
              {winners.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Bu sezon unvan kazanan olmadı.</p>
              ) : (
                <ol className="mt-3 space-y-2" aria-label={`${season.name} kazananları`}>
                  {winners.slice(0, MAX_WINNERS).map((w) => (
                    <li key={`${w.rank}-${w.username}`} className="flex items-center gap-3 text-sm">
                      <span className="num w-6 shrink-0 text-xs font-semibold text-muted">#{w.rank}</span>
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 truncate font-medium">{w.username}</span>
                        <TitleBadge rank={w.rank} title={w.title} />
                      </span>
                      <Delta value={w.return_pct} variant="text" className="shrink-0 text-xs" />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
