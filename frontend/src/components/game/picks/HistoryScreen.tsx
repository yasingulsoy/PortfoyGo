'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, ClockIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GameButton from '@/components/game/ui/GameButton';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { TrophyIcon } from '@/components/game/ui/icons';
import { usePicksWeeks } from '@/hooks/usePicks';
import type { PicksPhase, PicksWeekSummary } from '@/types';
import { PHASE_LABELS, PICKS_PATH, pickWeekPath, weekRangeLabel } from './model';
import { LiveDot, PicksFooterNote, ReturnText } from './parts';

const STEP = 20;

const PHASE_CHIP: Record<PicksPhase, string> = {
  upcoming: 'bg-(--g-purple) text-(--g-on-color)',
  submit: 'bg-(--g-gold) text-(--g-gold-ink)',
  revealed: 'bg-(--g-pink) text-(--g-on-color)',
  live: 'bg-(--g-green) text-(--g-on-color)',
  settling: 'bg-(--g-orange) text-(--g-on-color)',
  finished: 'bg-(--g-teal) text-(--g-on-color)',
};

export function PhaseChip({ phase, className }: { phase: PicksPhase; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase', PHASE_CHIP[phase], className)}>
      {phase === 'live' && <LiveDot className="h-2 w-2" />}
      {PHASE_LABELS[phase]}
    </span>
  );
}

/** Geçmiş haftalar: kazanan, kitle getirisi ve benim sonucum. */
export default function PicksHistoryScreen() {
  const [limit, setLimit] = useState(STEP);
  const { data, error, isLoading, isValidating, mutate } = usePicksWeeks(limit, 0);
  const items = data?.items ?? [];
  const status = (error as { status?: number } | null)?.status;

  return (
    <GameScreen topBar back={PICKS_PATH} backLabel="Haftalık Seçim’e dön" title="Geçmiş haftalar">
      <p className="g-title-sm -mt-2 mb-5 text-base">Her haftanın kürsüsü, kitlenin sonucu ve senin yerin.</p>

      {isLoading && !data ? (
        <GameLoader label="Haftalar yükleniyor…" />
      ) : error && !data ? (
        <GameNotice
          tone="red"
          title="Yüklenemedi"
          actions={
            <GameButton variant="blue" onClick={() => void mutate()}>
              Tekrar dene
            </GameButton>
          }
        >
          {status === 404 ? 'Geçmiş haftalar henüz hazır değil.' : 'Geçmiş haftalar şu an yüklenemedi.'}
        </GameNotice>
      ) : items.length === 0 ? (
        <GameNotice icon={<ClockIcon />} title="Henüz geçmiş yok" tone="teal">
          İlk hafta bittiğinde sonuçlar burada listelenecek.
        </GameNotice>
      ) : (
        <>
          <ul className="space-y-3" aria-label="Haftalar">
            {items.map((w) => (
              <WeekRow key={w.week_id} week={w} />
            ))}
          </ul>
          {(data?.total ?? 0) > items.length && (
            <GameButton variant="ghost" size="md" block className="mt-4" loading={isValidating} onClick={() => setLimit((l) => l + STEP)}>
              Daha fazla hafta
            </GameButton>
          )}
        </>
      )}

      <PicksFooterNote />
    </GameScreen>
  );
}

function WeekRow({ week: w }: { week: PicksWeekSummary }) {
  const label = weekRangeLabel(w.starts_at, w.ends_at, true);
  return (
    <li>
      <Link href={pickWeekPath(w.week_id)} className="g-panel g-focus flex items-center gap-3 p-3.5 transition-transform active:translate-y-0.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold leading-tight">{label}</h2>
            <PhaseChip phase={w.phase} />
          </div>
          <p className="mt-0.5 text-xs font-bold text-(--g-ink-soft)">
            <span className="g-num">{w.participants.toLocaleString('tr-TR')}</span> katılımcı
            {w.crowd_return_pct != null && (
              <>
                {' '}
                · Kitle <ReturnText value={w.crowd_return_pct} />
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {w.winner ? (
              <span className="flex min-w-0 items-center gap-1.5 font-extrabold">
                <TrophyIcon size={18} />
                <Avatar avatarId={w.winner.avatar_id} seed={w.winner.username} size="xs" />
                <span className="truncate">{w.winner.username}</span>
                <ReturnText value={w.winner.return_pct} className="text-xs" />
              </span>
            ) : (
              <span className="text-xs font-bold text-(--g-ink-soft)">{w.phase === 'finished' ? 'Kazanan yok' : 'Kazanan hafta sonunda belli olur'}</span>
            )}
            <span className="text-xs font-extrabold">
              {w.my ? (
                w.my.status === 'void' ? (
                  <span className="text-(--g-ink-soft)">Sen: geçersiz</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-(--g-panel-2) px-2 py-0.5">
                    Sen: {w.my.rank != null ? <span className="g-num">{w.my.rank}.</span> : '—'}
                    <ReturnText value={w.my.return_pct} />
                  </span>
                )
              ) : (
                <span className="text-(--g-ink-soft)">Katılmadın</span>
              )}
            </span>
          </div>
        </div>
        <ChevronRightIcon className="h-6 w-6 shrink-0 text-(--g-ink-faint)" aria-hidden="true" />
      </Link>
    </li>
  );
}
