import { TrophyIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatTRY } from '@portfoygo/shared/format';
import type { Leader } from './model';

/** 1: altın, 2: nötr koyu, 3: nötr açık (yalnızca tasarım token'ları) */
const PLACE = {
  1: {
    medal: 'bg-gold text-surface',
    ring: 'ring-1 ring-gold/40',
    avatar: 'gold' as const,
    order: 'sm:order-2',
    lift: 'sm:pb-8 sm:pt-7',
    label: 'Birinci',
  },
  2: {
    medal: 'bg-muted text-surface',
    ring: '',
    avatar: 'neutral' as const,
    order: 'sm:order-1 sm:mt-8',
    lift: 'sm:pb-6',
    label: 'İkinci',
  },
  3: {
    medal: 'bg-subtle text-surface',
    ring: '',
    avatar: 'neutral' as const,
    order: 'sm:order-3 sm:mt-12',
    lift: 'sm:pb-5',
    label: 'Üçüncü',
  },
} as const;

/** İlk üç: mobilde 1-2-3 alt alta, sm+ genişlikte 2-1-3 kürsü düzeni. */
export default function Podium({ leaders, currentUsername }: { leaders: Leader[]; currentUsername?: string }) {
  const top = leaders.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <ol className="grid gap-3 sm:grid-cols-3 sm:items-start sm:gap-4" aria-label="İlk üç">
      {top.map((l, i) => {
        const place = (i + 1) as 1 | 2 | 3;
        const p = PLACE[place];
        const isMe = !!currentUsername && l.username === currentUsername;
        return (
          <li key={l.username} className={p.order}>
            <Card
              className={cn(
                'relative flex items-center gap-4 p-4 sm:flex-col sm:gap-0 sm:px-5 sm:text-center',
                p.lift,
                isMe ? 'ring-2 ring-brand' : p.ring,
                'overflow-hidden',
              )}
            >
              {place === 1 && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gold" />}
              <span className="sr-only">{p.label} sıra: </span>
              <div className="relative shrink-0">
                <UserInitial name={l.username} size={place === 1 ? 64 : 52} tone={p.avatar} className="sm:mx-auto" />
                <span
                  aria-hidden="true"
                  className={cn('num absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface text-xs font-bold', p.medal)}
                >
                  {l.rank}
                </span>
              </div>

              <div className="min-w-0 flex-1 sm:mt-3 sm:w-full">
                <p className="flex items-center gap-1.5 sm:justify-center">
                  {place === 1 && <TrophyIcon className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />}
                  <span className="truncate text-[15px] font-semibold tracking-tight">{l.username}</span>
                  {isMe && <Badge tone="brand">Sen</Badge>}
                </p>
                <p className="num mt-0.5 text-sm text-muted sm:mt-1">{formatTRY(l.totalValue)}</p>
              </div>

              <div className="shrink-0 text-right sm:mt-3 sm:text-center">
                <Delta value={l.plPercent} className={place === 1 ? 'text-sm' : undefined} />
                <p className="mt-1 text-xs">
                  <Money value={l.pl} signed />
                </p>
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

export function PodiumSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Card key={i} className={cn('flex items-center gap-4 p-4 sm:flex-col sm:py-6', i !== 1 && 'sm:mt-8')}>
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2 sm:w-full sm:flex-none">
            <Skeleton className="h-4 w-24 sm:mx-auto" />
            <Skeleton className="h-3 w-20 sm:mx-auto" />
          </div>
        </Card>
      ))}
    </div>
  );
}
