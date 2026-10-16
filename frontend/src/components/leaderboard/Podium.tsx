import { TrophyIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import ProfileLink from '@/components/profile/ProfileLink';
import { cn, formatTRY } from '@portfoygo/shared/format';
import type { Leader } from './model';

/** Madalya tonları: altın / gümüş / bronz (yalnızca tasarım token'ları) */
const PLACE = {
  1: { box: 'bg-gold-soft text-gold', chip: 'bg-gold-soft text-gold', avatar: 'gold' as const, label: 'Birinci', medal: 'Altın' },
  2: { box: 'bg-silver/15 text-silver', chip: 'bg-silver/15 text-fg', avatar: 'neutral' as const, label: 'İkinci', medal: 'Gümüş' },
  3: { box: 'bg-bronze/10 text-bronze', chip: 'bg-bronze/10 text-bronze', avatar: 'neutral' as const, label: 'Üçüncü', medal: 'Bronz' },
} as const;

/** İlk üç: TailAdmin metrik kartı düzeninde altın, gümüş ve bronz kartlar (mobilde alt alta). */
export default function Podium({ leaders, currentUsername }: { leaders: Leader[]; currentUsername?: string }) {
  const top = leaders.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <ol className="grid gap-4 sm:grid-cols-3 md:gap-6" aria-label="İlk üç">
      {top.map((l, i) => {
        const place = (i + 1) as 1 | 2 | 3;
        const p = PLACE[place];
        const isMe = !!currentUsername && l.username === currentUsername;
        return (
          <li key={l.username} className="min-w-0">
            <Card className={cn('h-full p-5 md:p-6', isMe && 'ring-2 ring-brand')}>
              <span className="sr-only">{p.label} sıra: </span>
              <div className="flex items-start justify-between gap-3">
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', p.box)} aria-hidden="true">
                  <TrophyIcon className="h-6 w-6" />
                </span>
                <span className={cn('num inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', p.chip)}>
                  #{l.rank} · {p.medal}
                </span>
              </div>

              <div className="mt-5 flex min-w-0 items-center gap-2.5">
                <UserInitial name={l.username} size={32} tone={isMe ? 'brand' : p.avatar} />
                <p className="min-w-0 truncate text-sm font-medium text-fg">
                  <ProfileLink username={l.username} />
                </p>
                {isMe && <Badge tone="brand">Sen</Badge>}
              </div>

              <p className="num mt-3 truncate text-2xl font-semibold text-fg">{formatTRY(l.totalValue)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Delta value={l.plPercent} />
                <Money value={l.pl} signed className="font-medium" />
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
    <div className="grid gap-4 sm:grid-cols-3 md:gap-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5 md:p-6">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="mt-5 h-4 w-28" />
          <Skeleton className="mt-3 h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-24" />
        </Card>
      ))}
    </div>
  );
}
