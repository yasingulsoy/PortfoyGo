'use client';

import { UserMinusIcon } from '@heroicons/react/20/solid';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatDate } from '@portfoygo/shared/format';
import { RankMedal } from '@/components/season/TitleBadge';
import type { LeagueMember } from '@/types';

const gridFor = (withAction: boolean) =>
  cn(
    'grid items-center gap-x-3 md:gap-x-4',
    withAction
      ? 'grid-cols-[2.25rem_minmax(0,1fr)_auto_2rem] md:grid-cols-[3rem_minmax(0,1fr)_7rem_9rem_8rem_2.25rem]'
      : 'grid-cols-[2.25rem_minmax(0,1fr)_auto] md:grid-cols-[3rem_minmax(0,1fr)_7rem_9rem_8rem]',
  );

interface Props {
  members: LeagueMember[];
  /** Kurucu ise her üyenin yanında çıkarma düğmesi gösterilir. */
  canRemove: boolean;
  onRemove: (member: LeagueMember) => void;
}

/** Lig sıralaması: mobilde iki satırlı, md+ genişlikte tablo düzeni. */
export default function Standings({ members, canRemove, onRemove }: Props) {
  const grid = gridFor(canRemove);
  return (
    <div>
      <div className={cn(grid, 'hidden border-b border-line px-5 py-2.5 text-xs font-medium text-subtle md:grid')} aria-hidden="true">
        <span>Sıra</span>
        <span>Oyuncu</span>
        <span className="text-right">Getiri</span>
        <span className="text-right">K/Z</span>
        <span className="text-right">Katılım</span>
        {canRemove && <span />}
      </div>
      <ol className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.user_id || m.username} aria-current={m.is_me ? 'true' : undefined} className={cn(grid, 'px-5 py-3', m.is_me ? 'bg-brand-soft' : 'transition-colors hover:bg-surface-2/60')}>
            <RankMedal rank={m.rank} highlight={m.is_me} />

            <div className="flex min-w-0 items-center gap-3">
              <UserInitial name={m.username} size={32} tone={m.is_me ? 'brand' : m.rank === 1 ? 'gold' : 'neutral'} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{m.username}</span>
                  {m.is_me && <Badge tone="brand">Sen</Badge>}
                  {m.role === 'owner' && <Badge>Kurucu</Badge>}
                </p>
                <p className="truncate text-xs text-muted md:hidden">{m.joined_at ? `${formatDate(m.joined_at)} katıldı` : ''}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="sr-only">Getiri </span>
              <Delta value={m.return_pct} variant="text" className="text-sm" />
              <p className="text-xs md:hidden">
                <Money value={m.profit_tl} signed />
              </p>
            </div>
            <span className="hidden text-right text-sm md:block">
              <span className="sr-only">K/Z </span>
              <Money value={m.profit_tl} signed />
            </span>
            <span className="hidden text-right text-xs text-muted md:block">
              <span className="sr-only">Katılım </span>
              {m.joined_at ? formatDate(m.joined_at) : '—'}
            </span>

            {canRemove &&
              (m.role === 'owner' || m.is_me ? (
                <span />
              ) : (
                <button
                  type="button"
                  onClick={() => onRemove(m)}
                  aria-label={`${m.username} adlı oyuncuyu ligden çıkar`}
                  title="Ligden çıkar"
                  className="flex h-8 w-8 items-center justify-center justify-self-end rounded-lg text-subtle transition-colors hover:bg-down-soft hover:text-down"
                >
                  <UserMinusIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StandingsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
