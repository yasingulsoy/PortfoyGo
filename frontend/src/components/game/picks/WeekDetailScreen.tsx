'use client';

import GameButton from '@/components/game/ui/GameButton';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { usePicksWeek } from '@/hooks/usePicks';
import { ComparePanel, CrowdPanel } from './CrowdPanel';
import Discussion from './Discussion';
import { PhaseChip } from './HistoryScreen';
import { MyPickCard } from './PickCard';
import PicksGrid from './PicksGrid';
import { ResultsPanel, Standings } from './Standings';
import { PICKS_HISTORY_PATH, atDayTime, isResultPhase, isRevealedPhase, weekRangeLabel } from './model';
import { PhaseTimeline, PicksFooterNote } from './parts';

/** Tek bir haftanın ayrıntısı (geçmişten). */
export default function WeekDetailScreen({ weekId }: { weekId: string }) {
  const { data: week, error, isLoading, mutate } = usePicksWeek(weekId);
  const status = (error as { status?: number } | null)?.status;

  return (
    <GameScreen topBar back={PICKS_HISTORY_PATH} backLabel="Geçmiş haftalara dön" title={week ? weekRangeLabel(week.starts_at, week.ends_at) : 'Hafta'}>
      {isLoading && !week ? (
        <GameLoader label="Hafta yükleniyor…" />
      ) : error && !week ? (
        <GameNotice
          tone="red"
          title={status === 404 ? 'Hafta bulunamadı' : 'Yüklenemedi'}
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
        <div className="space-y-5">
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <PhaseChip phase={week.phase} />
            <span className="g-title-sm text-sm">{weekRangeLabel(week.starts_at, week.ends_at, true)} · {week.participants.toLocaleString('tr-TR')} katılımcı</span>
          </div>
          <PhaseTimeline week={week} />

          {isResultPhase(week.phase) ? (
            <>
              <ResultsPanel week={week} />
              <CrowdPanel week={week} showReturns />
              <PicksGrid week={week} showReturns />
            </>
          ) : week.phase === 'live' ? (
            <>
              {week.my_pick && <MyPickCard pick={week.my_pick} phase="live" rank={week.my_rank} />}
              <ComparePanel week={week} />
              <Standings week={week} live />
              <CrowdPanel week={week} showReturns />
            </>
          ) : week.phase === 'revealed' ? (
            <>
              {week.my_pick && <MyPickCard pick={week.my_pick} phase="revealed" />}
              <CrowdPanel week={week} />
              <PicksGrid week={week} />
            </>
          ) : (
            <>
              {week.my_pick && <MyPickCard pick={week.my_pick} phase={week.phase} revealAt={week.reveal_at} />}
              <GameNotice tone="purple" title="Seçimler gizli">
                Bu haftanın seçimleri {atDayTime(week.reveal_at)} açılacak.
              </GameNotice>
            </>
          )}

          <Discussion weekId={week.week_id} count={week.comments_count} locked={!isRevealedPhase(week.phase)} lockedText={`Tartışma ${atDayTime(week.reveal_at)} açılır.`} />
        </div>
      ) : null}

      <PicksFooterNote />
    </GameScreen>
  );
}
