'use client';

import { CalendarDaysIcon, ClockIcon, FlagIcon, UsersIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { formatDate, formatNumber } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import { formatRemaining, seasonLastDay } from '@/lib/competition';
import type { Season } from '@/types';

/** Aktif sezonun adı, geri sayımı, katılımcı sayısı ve kısa kurallar. */
export default function SeasonHeaderCard({ season, participants }: { season: Season; participants: number }) {
  const now = useNow();
  const remaining = formatRemaining(season.ends_at, now);
  const finished = season.status === 'finished' || !remaining;

  return (
    <Card>
      <div className="flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand sm:flex" aria-hidden="true">
            <CalendarDaysIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">Aylık sezon</Badge>
              {finished ? <Badge>Sona erdi</Badge> : <Badge tone="up">Devam ediyor</Badge>}
            </p>
            <h2 className="text-lg font-semibold text-fg sm:text-xl">{season.name}</h2>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDate(season.starts_at)} – {formatDate(seasonLastDay(season.ends_at))}
            </p>
            <p className="max-w-2xl pt-1 text-sm leading-relaxed text-muted">
              Bakiyeler sıfırlanmaz: sıralama, sezona girdiğin andaki toplam varlığına göre elde ettiğin yüzde getiriyle
              yapılır. Sezon sonunda bu sezon en az bir işlem yapmış ilk 10 oyuncu unvan kazanır —{' '}
              <span className="font-medium text-fg">Sezon Şampiyonu</span>, <span className="font-medium text-fg">Sezon Podyumu</span> ve{' '}
              <span className="font-medium text-fg">Sezonun İlk 10&apos;u</span>.
            </p>
          </div>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-3 text-sm xl:w-80">
          <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-3.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              {finished ? <FlagIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {finished ? 'Durum' : 'Kalan süre'}
            </dt>
            <dd className="num mt-1.5 text-base font-semibold text-fg" aria-live="off">
              {finished ? 'Sona erdi' : remaining}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-3.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" /> Katılımcı
            </dt>
            <dd className="num mt-1.5 text-base font-semibold text-fg">{formatNumber(participants, 0)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

export function SeasonHeaderSkeleton() {
  return (
    <Card className="p-5 sm:p-6" aria-hidden="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    </Card>
  );
}
