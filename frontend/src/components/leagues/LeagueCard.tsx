import Link from 'next/link';
import { ArrowRightIcon, ClockIcon, TrophyIcon, UsersIcon } from '@heroicons/react/20/solid';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { formatLeagueDate, leagueTiming } from '@/lib/competition';
import { RankMedal } from '@/components/season/TitleBadge';
import type { League } from '@/types';
import { RoleBadge, StatusBadge, VisibilityBadge } from './shared';

/** "Liglerim" kartı: durum, geri sayım ve sıran (bitmiş ligde dondurulmuş final sıran). */
export default function LeagueCard({ league, now }: { league: League; now: number }) {
  const timing = leagueTiming(league, now);
  const finished = league.status === 'finished';
  const upcoming = league.status === 'upcoming';
  const rank = finished ? (league.my_final_rank ?? league.my_rank) : league.my_rank;
  const champion = finished && rank === 1;

  return (
    <Link href={`/leagues/${league.id}`} className="group block h-full rounded-2xl focus-visible:outline-offset-4">
      <Card className={cn('flex h-full flex-col p-5 transition-colors group-hover:border-line-strong sm:p-6', champion && 'border-gold/40')}>
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              champion ? 'bg-gold-soft text-gold' : 'bg-brand-soft text-brand',
            )}
            aria-hidden="true"
          >
            {champion ? <TrophyIcon className="h-6 w-6" /> : <UserGroupIcon className="h-6 w-6" />}
          </span>
          <div className="flex flex-wrap justify-end gap-1.5">
            <StatusBadge status={league.status} />
            {league.visibility === 'public' && <VisibilityBadge visibility="public" />}
            <RoleBadge role={league.role} />
          </div>
        </div>

        <h2 className="mt-5 truncate text-lg font-semibold text-fg group-hover:text-brand">{league.name}</h2>
        <p className="mt-0.5 truncate text-sm text-muted">Kurucu: {league.owner_username}</p>
        {league.description && <p className="mt-3 line-clamp-2 break-words text-sm text-muted">{league.description}</p>}

        <div className="mt-auto pt-5">
          {upcoming ? (
            <div className="rounded-xl border border-dashed border-brand/30 bg-brand-soft px-3.5 py-3 text-sm">
              <p className="text-xs text-muted">Başlangıç</p>
              <p className="mt-1 font-semibold text-fg">{league.starts_at ? formatLeagueDate(league.starts_at) : 'Yakında'}</p>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-3.5">
                <dt className="text-xs text-muted">{finished ? 'Final sıran' : 'Sıran'}</dt>
                <dd className="mt-1.5 flex items-center gap-2 text-base font-semibold text-fg">
                  {rank ? (
                    <>
                      <RankMedal rank={rank} />
                      {champion && <span className="text-xs font-medium text-gold">Şampiyon</span>}
                    </>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </dd>
              </div>
              <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-3.5">
                <dt className="text-xs text-muted">Getirin</dt>
                <dd className="mt-1.5">
                  {league.my_return_pct != null ? <Delta value={league.my_return_pct} /> : <span className="text-subtle">—</span>}
                </dd>
              </div>
            </dl>
          )}
          <div className="mt-4 flex items-center gap-4 border-t border-line pt-4 text-xs text-muted">
            <span className="inline-flex shrink-0 items-center gap-1">
              <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="num">
                {league.member_count}/{league.max_members}
              </span>
              <span className="sr-only">oyuncu</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{finished && league.ends_at ? `Bitiş: ${formatLeagueDate(league.ends_at)}` : timing.label}</span>
            </span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-brand">
              <span className="max-[400px]:sr-only">Görüntüle</span>
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function LeagueCardSkeleton() {
  return (
    <Card className="space-y-4 p-5 sm:p-6" aria-hidden="true">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-3 w-32" />
    </Card>
  );
}
