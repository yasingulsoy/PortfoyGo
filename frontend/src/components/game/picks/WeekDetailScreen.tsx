'use client';

import GameButton from '@/components/game/ui/GameButton';
import GameColumns from '@/components/game/ui/GameColumns';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { usePicksWeek } from '@/hooks/usePicks';
import type { PicksWeek } from '@/types';
import { ComparePanel, CrowdPanel } from './CrowdPanel';
import Discussion from './Discussion';
import { PhaseChip } from './HistoryScreen';
import { MyPickCard } from './PickCard';
import PicksGrid from './PicksGrid';
import { ResultsSummary, Standings } from './Standings';
import { PICKS_HISTORY_PATH, atDayTime, isResultPhase, isRevealedPhase, weekRangeLabel } from './model';
import { PhaseTimeline, PicksFooterNote } from './parts';

/** Tek bir haftanın ayrıntısı (geçmişten). */
export default function WeekDetailScreen({ weekId }: { weekId: string }) {
  const { data: week, error, isLoading, mutate } = usePicksWeek(weekId);
  const status = (error as { status?: number } | null)?.status;

  return (
    <GameScreen topBar back={PICKS_HISTORY_PATH} backLabel="Geçmiş haftalara dön" title={week ? weekRangeLabel(week.starts_at, week.ends_at) : 'Hafta'} layout="full">
      {isLoading && !week ? (
        <GameLoader label="Hafta yükleniyor…" />
      ) : error && !week ? (
        <GameNotice
          tone="red"
          title={status === 404 ? 'Hafta bulunamadı' : 'Yüklenemedi'}
          className="mx-auto w-full max-w-xl"
          actions={
            status === 404 ? undefined : (
              <GameButton variant="blue" onClick={() => void mutate()}>
                Tekrar dene
              </GameButton>
            )
          }
        >
          {status === 404 ? 'Bu hafta kaydı yok ya da kaldırılmış.' : 'Hafta şu an yüklenemedi.'}
        </GameNotice>
      ) : week ? (
        <WeekColumns week={week} />
      ) : null}

      <PicksFooterNote />
    </GameScreen>
  );
}

/**
 * Telefonda tek sütun (kod sırası = görsel sıra). Masaüstünde solda hafta özeti / benim seçimim,
 * sağda sıralama ve seçimler, xl'de üçüncü sütunda kitle ve tartışma.
 */
function WeekColumns({ week }: { week: PicksWeek }) {
  const head = (
    <>
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <PhaseChip phase={week.phase} />
        <span className="g-title-sm text-sm">
          {weekRangeLabel(week.starts_at, week.ends_at, true)} · {week.participants.toLocaleString('tr-TR')} katılımcı
        </span>
      </div>
      <PhaseTimeline week={week} />
    </>
  );
  const discussion = (
    <Discussion weekId={week.week_id} count={week.comments_count} locked={!isRevealedPhase(week.phase)} lockedText={`Tartışma ${atDayTime(week.reveal_at)} açılır.`} />
  );

  if (isResultPhase(week.phase)) {
    return (
      <GameColumns
        main={
          <>
            {head}
            <ResultsSummary week={week} />
          </>
        }
        side={
          <>
            <Standings week={week} title={week.phase === 'settling' ? 'Geçici sıralama' : 'Son sıralama'} />
            <CrowdPanel week={week} showReturns />
          </>
        }
        extra={
          <>
            <PicksGrid week={week} showReturns />
            {discussion}
          </>
        }
      />
    );
  }
  if (week.phase === 'live') {
    return (
      <GameColumns
        main={
          <>
            {head}
            {week.my_pick && <MyPickCard pick={week.my_pick} phase="live" rank={week.my_rank} />}
            <ComparePanel week={week} />
          </>
        }
        side={<Standings week={week} live />}
        extra={
          <>
            <CrowdPanel week={week} showReturns />
            {discussion}
          </>
        }
      />
    );
  }
  if (week.phase === 'revealed') {
    return (
      <GameColumns
        main={
          <>
            {head}
            {week.my_pick && <MyPickCard pick={week.my_pick} phase="revealed" />}
            <CrowdPanel week={week} />
          </>
        }
        side={<PicksGrid week={week} />}
        extra={discussion}
      />
    );
  }
  return (
    <GameColumns
      main={
        <>
          {head}
          {week.my_pick && <MyPickCard pick={week.my_pick} phase={week.phase} revealAt={week.reveal_at} />}
          <GameNotice tone="purple" title="Seçimler gizli">
            Bu haftanın seçimleri {atDayTime(week.reveal_at)} açılacak.
          </GameNotice>
        </>
      }
      side={discussion}
    />
  );
}
