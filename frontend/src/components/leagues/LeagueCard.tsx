import Link from 'next/link';
import { ChevronRightIcon, ClockIcon, UsersIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import type { League } from '@/types';
import { RoleBadge, leagueTimeLabel } from './shared';

export default function LeagueCard({ league, now }: { league: League; now: number }) {
  const time = leagueTimeLabel(league.ends_at, now);
  return (
    <Link href={`/leagues/${league.id}`} className="group block h-full rounded-2xl focus-visible:outline-offset-4">
      <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-line-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{league.name}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">Kurucu: {league.owner_username}</p>
          </div>
          <RoleBadge role={league.role} />
        </div>

        {league.description && <p className="mt-3 line-clamp-2 break-words text-sm text-muted">{league.description}</p>}

        <div className="mt-auto pt-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
            <div className="bg-surface p-3">
              <dt className="text-xs text-muted">Sıran</dt>
              <dd className="num mt-1 font-semibold">{league.my_rank ? `#${league.my_rank}` : <span className="text-subtle">—</span>}</dd>
            </div>
            <div className="bg-surface p-3">
              <dt className="text-xs text-muted">Getirin</dt>
              <dd className="mt-1">
                {league.my_return_pct != null ? <Delta value={league.my_return_pct} variant="text" /> : <span className="text-subtle">—</span>}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="num">
                {league.member_count}/{league.max_members}
              </span>
              <span className="sr-only">oyuncu</span>
            </span>
            <span className={cn('inline-flex min-w-0 items-center gap-1', time.ended && 'text-down')}>
              <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{time.text}</span>
            </span>
            <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function LeagueCardSkeleton() {
  return (
    <Card className="space-y-4 p-5" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-3 w-32" />
    </Card>
  );
}
