'use client';

import useSWR from 'swr';
import { CalendarDaysIcon, TrophyIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Delta } from '@portfoygo/shared/ui/Delta';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { swrFetcher } from '@/lib/api';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { num } from './model';
import { TableCardHeader, table } from './ui';

interface Season {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'finished';
}

interface Winner {
  rank: number;
  username: string;
  return_pct: number;
  title: string;
}

interface SeasonRow {
  season: Season;
  participants: number;
  winners: Winner[];
}

interface CurrentSeason {
  season: Season;
  participants: number;
}

const DAY = 86_400_000;

/** Sezon bitişi hariç tutulan bir sınırdır (ör. 1 Kasım 00:00); son gün bir önceki gündür. */
function formatRange(s: Season) {
  const start = new Date(s.starts_at);
  const end = new Date(new Date(s.ends_at).getTime() - 1);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('tr-TR', opts)} – ${end.toLocaleDateString('tr-TR', { ...opts, year: 'numeric' })}`;
}

/** Sezonun ilerleme yüzdesi ve kalan gün (render dışında hesaplanır). */
function seasonProgress(s: Season) {
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  const now = Date.now();
  const pct = end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0;
  return { pct, daysLeft: Math.max(0, Math.ceil((end - now) / DAY)) };
}

function StatusBadge({ status }: { status: Season['status'] }) {
  return status === 'active' ? <Badge tone="up">Aktif</Badge> : <Badge>Tamamlandı</Badge>;
}

const MEDAL: Record<number, 'gold' | 'neutral'> = { 1: 'gold' };

export default function Seasons() {
  const list = useSWR<SeasonRow[]>('/seasons?limit=12', swrFetcher, { revalidateOnFocus: false });
  const current = useSWR<CurrentSeason>('/seasons/current', swrFetcher, { revalidateOnFocus: false });
  const rows = Array.isArray(list.data) ? list.data : [];
  const finished = rows.filter((r) => r.season.status === 'finished');
  const winners = finished.flatMap((r) => r.winners.map((w) => ({ ...w, season: r.season })));

  return (
    <div className="space-y-4 md:space-y-6">
      <CurrentSeasonCard data={current.data} loading={current.isLoading && !current.data} error={current.error} finishedCount={finished.length} />

      <section aria-labelledby="season-list-title" className="space-y-4">
        <h2 id="season-list-title" className="text-lg font-semibold text-fg">
          Son sezonlar
        </h2>
        {list.isLoading && !list.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="space-y-3 p-5">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : list.error && !list.data ? (
          <Alert tone="error">Sezonlar alınamadı: {list.error instanceof Error ? list.error.message : 'beklenmeyen hata'}.</Alert>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon={<CalendarDaysIcon />} title="Henüz sezon yok" description="İlk sezon başladığında burada listelenir." />
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ season, participants, winners: w }) => {
              const champion = w.find((x) => x.rank === 1);
              return (
                <li key={season.id}>
                  <Card className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-fg">{season.name}</h3>
                        <p className="mt-0.5 text-sm text-muted">{formatRange(season)}</p>
                      </div>
                      <StatusBadge status={season.status} />
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-sm text-muted">
                      <UserGroupIcon className="h-4 w-4 text-subtle" aria-hidden="true" />
                      <span className="num">{formatNumber(participants, 0)}</span> katılımcı
                    </div>
                    <div className="mt-4 flex flex-1 items-end">
                      {champion ? (
                        <div className="flex w-full items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                          <UserInitial name={champion.username} size={32} tone="gold" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{champion.username}</p>
                            <p className="truncate text-xs text-muted">{champion.title}</p>
                          </div>
                          <Delta value={num(champion.return_pct)} />
                        </div>
                      ) : (
                        <p className="w-full rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
                          {season.status === 'active' ? 'Sezon sürüyor; kazananlar sezon sonunda belirlenir.' : 'Bu sezonda ödül alan olmadı.'}
                        </p>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card className="overflow-hidden">
        <TableCardHeader title="Sezon kazananları" description="Biten sezonların ilk üçü ve kazandıkları unvanlar" />
        {list.isLoading && !list.data ? (
          <div className="space-y-3 px-5 pb-5 sm:px-6" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : winners.length === 0 ? (
          <EmptyState icon={<TrophyIcon />} title="Henüz kazanan yok" description="İlk sezon bittiğinde kazananlar burada görünür." className="border-t border-line py-10" />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <caption className="sr-only">Biten sezonların kazananları</caption>
              <thead>
                <tr className={table.headRow}>
                  <th scope="col" className={table.th}>Sezon</th>
                  <th scope="col" className={cn(table.th, 'w-16')}>Sıra</th>
                  <th scope="col" className={table.th}>Kullanıcı</th>
                  <th scope="col" className={cn(table.th, 'hidden sm:table-cell')}>Unvan</th>
                  <th scope="col" className={cn(table.th, 'text-right')}>Getiri</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {winners.map((w) => (
                  <tr key={`${w.season.id}:${w.rank}:${w.username}`}>
                    <td className={cn(table.td, 'whitespace-nowrap font-medium text-fg')}>{w.season.name}</td>
                    <td className={table.td}>
                      <span
                        className={cn(
                          'num inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                          w.rank === 1 ? 'bg-gold-soft text-gold' : 'bg-surface-3 text-muted',
                        )}
                      >
                        {w.rank}
                      </span>
                    </td>
                    <td className={table.td}>
                      <div className="flex min-w-0 items-center gap-3">
                        <UserInitial name={w.username} size={32} tone={MEDAL[w.rank] ?? 'brand'} />
                        <span className="truncate font-medium text-fg">{w.username}</span>
                      </div>
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap sm:table-cell')}>{w.title}</td>
                    <td className={cn(table.td, 'text-right')}>
                      <Delta value={num(w.return_pct)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CurrentSeasonCard({ data, loading, error, finishedCount }: { data?: CurrentSeason; loading: boolean; error: unknown; finishedCount: number }) {
  if (loading) {
    return (
      <Card className="space-y-4 p-5 md:p-6" aria-hidden="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }
  if (error || !data?.season) {
    return <Alert tone="error">Güncel sezon bilgisi alınamadı{error instanceof Error ? `: ${error.message}` : ''}.</Alert>;
  }

  const { season, participants } = data;
  const { pct, daysLeft } = seasonProgress(season);

  return (
    <Card className="overflow-hidden">
      <div className="p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <CalendarDaysIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-muted">Güncel sezon</p>
              <h2 className="truncate text-2xl font-bold text-fg">{season.name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={season.status} />
            <span className="text-sm text-muted">{formatRange(season)}</span>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted">Sezon ilerlemesi</span>
            <span className="num font-medium text-fg">%{formatNumber(pct, 0)}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Sezon ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
        {[
          { label: 'Katılımcı', value: formatNumber(participants, 0) },
          { label: 'Kalan gün', value: season.status === 'active' ? formatNumber(daysLeft, 0) : '—' },
          { label: 'Biten sezon', value: formatNumber(finishedCount, 0) },
        ].map((x) => (
          <div key={x.label} className="px-3 py-4 text-center sm:py-5">
            <dt className="text-xs text-muted sm:text-sm">{x.label}</dt>
            <dd className="num mt-1 text-lg font-semibold text-fg">{x.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
