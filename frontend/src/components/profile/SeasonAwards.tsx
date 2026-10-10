'use client';

import useSWR from 'swr';
import { TrophyIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Link from 'next/link';
import { toolbarButtonClass } from '@/components/common/controls';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { formatDate } from '@portfoygo/shared/format';
import { seasonsApi } from '@/lib/api';
import { RankMedal, TitleBadge } from '@/components/season/TitleBadge';

export const SEASON_AWARDS_KEY = 'seasons:me:awards';

/** Kullanıcının kazandığı sezon unvanları. */
export default function SeasonAwards() {
  const { data, error, isLoading } = useSWR(SEASON_AWARDS_KEY, () => seasonsApi.myAwards(), { revalidateOnFocus: false });
  const awards = data ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Sezon unvanları"
        description={isLoading && !data ? 'Yükleniyor' : awards.length ? `${awards.length} unvan` : 'Aylık sezonlarda kazanılır'}
        action={
          <Link href="/leaderboard" className={toolbarButtonClass}>
            Bu sezon
          </Link>
        }
      />
      {isLoading && !data ? (
        <div className="space-y-3 px-5 pb-6 sm:px-6" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      ) : error && !data ? (
        <div className="px-5 pb-6 sm:px-6">
          <Alert tone="error">Sezon unvanların şu an alınamadı.</Alert>
        </div>
      ) : awards.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={<TrophyIcon />}
          title="Henüz sezon unvanın yok"
          description="İlk unvanını kazanmak için bu sezon ilk 10'a gir. Sezon sonunda en az bir işlem yapmış ilk 10 oyuncu unvan alır."
        />
      ) : (
        <DataTable label="Sezon unvanların" className="pb-2">
          <THead>
            <Th className="w-14">Sıra</Th>
            <Th>Sezon</Th>
            <Th className="hidden sm:table-cell">Unvan</Th>
            <Th align="right">Getiri</Th>
          </THead>
          <TBody>
            {awards.map((a) => (
              <Tr key={`${a.season_slug}-${a.rank}`}>
                <Td>
                  <RankMedal rank={a.rank} />
                </Td>
                <Td>
                  <p className="truncate font-medium text-fg">{a.season_name}</p>
                  {a.awarded_at && <p className="mt-0.5 text-xs text-muted">{formatDate(a.awarded_at)}</p>}
                  <TitleBadge rank={a.rank} title={a.title} className="mt-1.5 sm:hidden" />
                </Td>
                <Td className="hidden sm:table-cell">
                  <TitleBadge rank={a.rank} title={a.title} />
                </Td>
                <Td align="right">
                  <Delta value={a.return_pct} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      )}
    </Card>
  );
}
