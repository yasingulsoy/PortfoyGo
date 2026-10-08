'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowRightIcon, TrophyIcon } from '@heroicons/react/20/solid';
import { leaderboardApi } from '@/lib/api';
import { normalizeLeaders, type Board } from '@/components/leaderboard/model';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Delta } from '@/components/ui/Delta';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import Tabs from '@/components/ui/Tabs';
import { STARTING_BALANCE } from '@/lib/constants';
import { cn, formatNumber, formatTRY } from '@/lib/format';
import SectionHeading from './SectionHeading';

const LIMIT = 5;
const MEDALS = ['bg-gold text-black', 'bg-silver text-black', 'bg-bronze text-black'];
const COPY: Record<Board, string> = {
  week: 'Her Pazartesi herkes aynı çizgiden yarışa başlar. Yeni ya da eski oyuncu fark etmez; haftanın en yüksek getirisini yakalayan zirveye çıkar.',
  alltime: `Herkes aynı ${formatNumber(STARTING_BALANCE, 0)} ₺ ile başlar. Hesabını en çok büyüten oyuncular tüm zamanlar listesinin başında.`,
};
const BOARDS: { value: Board; label: string }[] = [
  { value: 'week', label: 'Bu hafta' },
  { value: 'alltime', label: 'Tüm zamanlar' },
];

/** Herkese açık liderlik tablosundan ilk 5. */
export default function LeaderboardTeaser() {
  const [board, setBoard] = useState<Board>('week');
  const { data, error, isLoading } = useSWR(`landing:leaders:${board}`, () => leaderboardApi.list(LIMIT, board), {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const leaders = useMemo(() => normalizeLeaders(data, board).slice(0, LIMIT), [data, board]);

  return (
    <section aria-labelledby="landing-leaders-title" className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div>
        <SectionHeading
          id="landing-leaders-title"
          eyebrow="Liderlik tablosu"
          title="Zirvede kimler var?"
          description={COPY[board]}
        />
        <div className="mt-7 flex flex-wrap gap-3">
          <LinkButton href="/register" size="lg" className="px-6">
            Sen de yarış
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </LinkButton>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-soft text-gold">
              <TrophyIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3 className="text-[15px] font-semibold tracking-tight text-fg">İlk {LIMIT}</h3>
          </div>
          <Tabs label="Liderlik dönemi" items={BOARDS} value={board} onChange={setBoard} />
        </div>

        {isLoading && leaders.length === 0 ? (
          <ul className="divide-y divide-line" aria-hidden="true">
            {Array.from({ length: LIMIT }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16" />
              </li>
            ))}
          </ul>
        ) : leaders.length === 0 ? (
          <EmptyState
            icon={<TrophyIcon />}
            title={error ? 'Sıralama şu an yüklenemedi' : 'Bu dönemde henüz sıralama yok'}
            description={error ? 'Birazdan tekrar dene; tablo her dakika yenilenir.' : 'İlk işlemini yapan zirveye yerleşir — neden sen olmayasın?'}
          />
        ) : (
          <ol className="divide-y divide-line">
            {leaders.map((l, i) => (
              <li key={`${l.rank}:${l.username}`} className="flex items-center gap-3 px-5 py-3.5">
                <span className={cn('num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold', MEDALS[i] ?? 'bg-surface-2 text-muted')}>
                  {l.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{l.username}</p>
                  <p className="num text-xs text-subtle">{formatTRY(l.totalValue)}</p>
                </div>
                <Delta value={l.plPercent} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
