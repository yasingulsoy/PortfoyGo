import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { RankMedal } from '@/components/season/TitleBadge';
import type { Leader } from './model';

/** Sabit sütun genişlikleri: sayfalı parçalar (ayrı tablolar) alt alta hizalı kalır. */
const COL = {
  rank: 'w-11 sm:w-14 md:w-16',
  total: 'hidden w-40 md:table-cell',
  pl: 'hidden w-36 lg:table-cell',
  ret: 'w-[6.5rem] sm:w-28',
};

/** 4. sıradan itibaren sıralama tablosu (TailAdmin tablo düzeni). */
export default function RankList({
  leaders,
  currentUsername,
  plLabel,
  showHeader = true,
}: {
  leaders: Leader[];
  currentUsername?: string;
  plLabel: string;
  /** Sayfalı listelerde ikinci ve sonraki parçalar sütun başlığını görsel olarak tekrarlamaz. */
  showHeader?: boolean;
}) {
  return (
    <DataTable label="Sıralama" tableClassName="table-fixed">
      <THead className={showHeader ? undefined : 'sr-only'}>
        <Th className={COL.rank}>Sıra</Th>
        <Th>Oyuncu</Th>
        <Th align="right" className={COL.total}>
          Toplam varlık
        </Th>
        <Th align="right" className={COL.pl}>
          {plLabel}
        </Th>
        <Th align="right" className={COL.ret}>
          Getiri
        </Th>
      </THead>
      <TBody>
        {leaders.map((l) => {
          const isMe = !!currentUsername && l.username === currentUsername;
          return (
            <Tr key={`${l.rank}-${l.username}`} aria-current={isMe ? 'true' : undefined} className={isMe ? 'bg-brand-soft' : 'hover:bg-surface-2'}>
              <Td className={COL.rank}>
                <RankMedal rank={l.rank} highlight={isMe} />
              </Td>
              <Td>
                <div className="flex min-w-0 items-center gap-3">
                  <UserInitial name={l.username} size={36} tone={isMe ? 'brand' : 'neutral'} className="max-sm:hidden" />
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-fg">{l.username}</span>
                      {isMe && <Badge tone="brand">Sen</Badge>}
                    </p>
                    <p className="num truncate text-xs text-muted md:hidden">{formatTRY(l.totalValue)}</p>
                  </div>
                </div>
              </Td>
              <Td align="right" className={cn(COL.total, 'num font-medium text-fg')}>
                {formatTRY(l.totalValue)}
              </Td>
              <Td align="right" className={COL.pl}>
                <Money value={l.pl} signed />
              </Td>
              <Td align="right" className={COL.ret}>
                <Delta value={l.plPercent} />
                <p className="mt-1 truncate text-xs lg:hidden">
                  <Money value={l.pl} signed />
                </p>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}

export function RankListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line border-t border-line px-5 sm:px-6" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5">
          <Skeleton className="h-4 w-7" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
