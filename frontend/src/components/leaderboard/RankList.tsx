import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatTRY } from '@portfoygo/shared/format';
import type { Leader } from './model';

const GRID = 'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[3rem_minmax(0,1fr)_11rem_10rem_6.5rem] md:gap-x-4';

/** 4. sıradan itibaren liste. Mobilde iki satırlı, md+ genişlikte tablo düzeni. */
export default function RankList({
  leaders,
  currentUsername,
  plLabel,
  showHeader = true,
}: {
  leaders: Leader[];
  currentUsername?: string;
  plLabel: string;
  /** Sayfalı listelerde ikinci ve sonraki parçalar sütun başlığını tekrarlamaz. */
  showHeader?: boolean;
}) {
  return (
    <div>
      <div className={cn(GRID, 'hidden border-b border-line px-5 py-2.5 text-xs font-medium text-subtle', showHeader && 'md:grid')} aria-hidden="true">
        <span>Sıra</span>
        <span>Oyuncu</span>
        <span className="text-right">Toplam varlık</span>
        <span className="text-right">{plLabel}</span>
        <span className="text-right">Getiri</span>
      </div>
      <ol className="divide-y divide-line">
        {leaders.map((l) => {
          const isMe = !!currentUsername && l.username === currentUsername;
          return (
            <li
              key={`${l.rank}-${l.username}`}
              aria-current={isMe ? 'true' : undefined}
              className={cn(GRID, 'px-5 py-3', isMe ? 'bg-brand-soft' : 'transition-colors hover:bg-surface-2/60')}
            >
              <span className={cn('num text-sm font-semibold', isMe ? 'text-brand' : 'text-muted')}>
                <span className="sr-only">Sıra </span>#{l.rank}
              </span>

              <div className="flex min-w-0 items-center gap-3">
                <UserInitial name={l.username} size={32} tone={isMe ? 'brand' : 'neutral'} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{l.username}</span>
                    {isMe && <Badge tone="brand">Sen</Badge>}
                  </p>
                  <p className="num truncate text-xs text-muted md:hidden">{formatTRY(l.totalValue)}</p>
                </div>
              </div>

              <span className="num hidden text-right text-sm font-medium md:block">
                <span className="sr-only">Toplam varlık </span>
                {formatTRY(l.totalValue)}
              </span>
              <span className="hidden text-right text-sm md:block">
                <span className="sr-only">{plLabel} </span>
                <Money value={l.pl} signed />
              </span>

              <div className="text-right">
                <span className="sr-only">Getiri </span>
                <Delta value={l.plPercent} variant="text" className="text-sm" />
                <p className="text-xs md:hidden">
                  <Money value={l.pl} signed />
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function RankListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="h-4 w-7" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
