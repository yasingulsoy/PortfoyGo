import { TrophyIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import type { ArenaLeaderboardRow } from '@/types';
import { RankBadge } from './bits';

interface Props {
  rows: ArenaLeaderboardRow[];
  title?: string;
  description?: string;
  loading?: boolean;
  /** Gösterilecek en fazla satır (kendi satırın listede yoksa altta ayrıca gösterilir) */
  limit?: number;
  className?: string;
  emptyText?: string;
}

/** Meydan okuma sıralaması (canlı ya da sonuç). */
export default function LiveLeaderboard({ rows, title = 'Canlı sıralama', description, loading, limit = 10, className, emptyText = 'Henüz sıralama yok.' }: Props) {
  const top = rows.slice(0, limit);
  const me = rows.find((r) => r.is_me);
  const meOutside = me && !top.some((r) => r.is_me);
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader title={title} description={description} icon={<TrophyIcon />} className="pb-3" />
      {loading ? (
        <div className="space-y-2 px-5 pb-5 sm:px-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyText} className="py-8" />
      ) : (
        <ol className="px-3 pb-3 sm:px-4">
          {top.map((r) => (
            <Row key={`${r.rank}-${r.username}`} row={r} />
          ))}
          {meOutside && (
            <>
              <li aria-hidden="true" className="px-2 py-1 text-center text-xs text-subtle">
                ⋯
              </li>
              <Row row={me} />
            </>
          )}
        </ol>
      )}
    </Card>
  );
}

function Row({ row }: { row: ArenaLeaderboardRow }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl px-2 py-2', row.is_me && 'bg-brand-soft')}>
      <RankBadge rank={row.rank} />
      <span className={cn('min-w-0 flex-1 truncate text-sm', row.is_me ? 'font-semibold text-brand' : 'text-fg')}>
        {row.username}
        {row.is_me && <span className="ml-1 text-xs font-normal">(sen)</span>}
      </span>
      {row.equity != null && <span className="num hidden text-xs text-muted sm:inline">{formatUSD(row.equity)}</span>}
      <Delta value={row.return_pct} />
    </li>
  );
}
