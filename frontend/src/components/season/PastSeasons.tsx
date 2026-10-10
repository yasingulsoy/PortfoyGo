'use client';

import useSWR from 'swr';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { formatDate, formatNumber } from '@portfoygo/shared/format';
import { seasonsApi } from '@/lib/api';
import { seasonLastDay } from '@/lib/competition';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { RankMedal, TitleBadge } from './TitleBadge';

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
        title="Geçmiş sezonlar"
        description={isLoading ? 'Yükleniyor' : finished.length ? `${finished.length} sezon tamamlandı · ilk üç` : undefined}
      />
      {isLoading ? (
        <div className="space-y-4 px-5 pb-6 sm:px-6" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : error && finished.length === 0 ? (
        <div className="px-5 pb-6 sm:px-6">
          <Alert tone="error">Geçmiş sezonlar şu an alınamadı.</Alert>
        </div>
      ) : (
        <DataTable label="Geçmiş sezonlar ve kazananları" className="pb-2">
          <THead>
            <Th className="hidden sm:table-cell">Sezon</Th>
            <Th className="hidden sm:table-cell">Katılımcı</Th>
            <Th>Kazananlar</Th>
          </THead>
          <TBody>
            {finished.map(({ season, participants, winners }) => (
              <Tr key={season.id || season.slug}>
                <Td className="hidden sm:table-cell">
                  <p className="font-medium text-fg">{season.name}</p>
                  <p className="num mt-0.5 whitespace-nowrap text-xs text-muted">{formatDate(seasonLastDay(season.ends_at))}</p>
                </Td>
                <Td className="num hidden text-fg sm:table-cell">{formatNumber(participants, 0)}</Td>
                <Td>
                  <p className="mb-2.5 sm:hidden">
                    <span className="font-medium text-fg">{season.name}</span>
                    <span className="num block text-xs text-muted">
                      {formatDate(seasonLastDay(season.ends_at))} · {formatNumber(participants, 0)} katılımcı
                    </span>
                  </p>
                  {winners.length === 0 ? (
                    <p className="text-xs text-muted">Bu sezon unvan kazanan olmadı.</p>
                  ) : (
                    <ol className="space-y-2" aria-label={`${season.name} kazananları`}>
                      {winners.slice(0, MAX_WINNERS).map((w) => (
                        <li key={`${w.rank}-${w.username}`} className="flex min-w-0 items-center gap-2.5">
                          <RankMedal rank={w.rank} className="shrink-0" />
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 truncate font-medium text-fg">{w.username}</span>
                            <TitleBadge rank={w.rank} title={w.title} className="max-md:hidden" />
                          </span>
                          <Delta value={w.return_pct} className="shrink-0" />
                        </li>
                      ))}
                    </ol>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      )}
    </Card>
  );
}
