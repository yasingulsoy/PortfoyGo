'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClockIcon, PencilSquareIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import GameDialog from '@/components/game/ui/GameDialog';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { playSound } from '@/components/game/ui/sound';
import ProblemDialog from '@/components/game/ProblemDialog';
import { useNow } from '@/hooks/useNow';
import { usePickActions, usePicksCurrent } from '@/hooks/usePicks';
import type { PickInput, PicksCurrent, PicksPhase, PicksWeek } from '@/types';
import { CrowdPanel, ComparePanel } from './CrowdPanel';
import Discussion from './Discussion';
import { MyPickCard } from './PickCard';
import PickForm from './PickForm';
import PicksGrid from './PicksGrid';
import RewardCelebration from './RewardCelebration';
import { ResultsPanel, RewardsTable, Standings } from './Standings';
import { PHASE_LABELS, PICKS_HISTORY_PATH, atDayTime, canEditPick, formatDayTime, isResultPhase, phaseDeadline, placedInWeek, weekRangeLabel } from './model';
import { LiveDot, PhaseTimeline, PicksCountdown, PicksFooterNote, SealedEnvelope, WhyHiddenPanel } from './parts';

const PHASE_RIBBON: Record<PicksPhase, string> = {
  upcoming: 'g-ribbon--purple',
  submit: 'g-ribbon--gold',
  revealed: 'g-ribbon--pink',
  live: 'g-ribbon--green',
  settling: 'g-ribbon--orange',
  finished: 'g-ribbon--teal',
};

/** Evre değişiminde ekran okuyucuya kısa duyuru (yalnızca değişimde; geri sayım duyurulmaz). */
const PHASE_ANNOUNCE: Record<PicksPhase, string> = {
  upcoming: 'Yeni hafta yakında başlıyor.',
  submit: 'Seçimler açık: zarfını bırakabilirsin.',
  revealed: 'Zarflar açıldı! Artık herkesin seçimini görebilirsin.',
  live: 'Yarış başladı. Sıralama dakikada bir güncellenir.',
  settling: 'Hafta bitti, sonuçlar hesaplanıyor.',
  finished: 'Sonuçlar açıklandı.',
};

/** Haftalık Seçim ana ekranı: GET /picks/current evreye göre ekranı belirler. */
export default function PicksScreen() {
  const { data, error, isLoading, mutate } = usePicksCurrent();
  const status = (error as { status?: number } | null)?.status;

  return (
    <GameScreen
      topBar
      back="/oyun"
      backLabel="Oyun Merkezi’ne dön"
      title="Haftalık Seçim"
      actions={
        <GameLinkButton href={PICKS_HISTORY_PATH} variant="ghost" size="sm" icon={<ClockIcon aria-hidden="true" />} aria-label="Geçmiş haftalar">
          Geçmiş
        </GameLinkButton>
      }
    >
      <p className="g-title-sm -mt-2 mb-5 text-base">Kitlelerin Bilgeliği · her hafta tek gizli seçim</p>

      {isLoading && !data ? (
        <GameLoader label="Hafta yükleniyor…" />
      ) : error && !data ? (
        <GameNotice
          tone={status === 404 ? 'purple' : 'red'}
          title={status === 404 ? 'Çok yakında' : 'Yüklenemedi'}
          actions={
            <GameButton variant="blue" onClick={() => void mutate()}>
              Tekrar dene
            </GameButton>
          }
        >
          {status === 404 ? 'Haftalık Seçim henüz hazırlanıyor. Biraz sonra tekrar dene.' : error instanceof Error && error.message ? error.message : 'Veriler yüklenemedi.'}
        </GameNotice>
      ) : data ? (
        <WeekView current={data} onRefresh={() => void mutate()} />
      ) : null}

      <PicksFooterNote />
    </GameScreen>
  );
}

function WeekView({ current, onRefresh }: { current: PicksCurrent; onRefresh: () => void }) {
  const { active, previous, clock_offset_ms: offset } = current;
  // Geçen hafta (katılım olduysa) yeni yarış başlayana dek sonuçlarıyla gösterilir
  const showPrevious =
    !!previous && isResultPhase(previous.phase) && (previous.participants > 0 || !!previous.my_pick) && (active.phase === 'upcoming' || active.phase === 'submit' || active.phase === 'revealed');
  const celebrate = [active, previous].find((w): w is PicksWeek => !!w && placedInWeek(w)) ?? null;

  // Süre dolunca hemen ve kısa bir gecikmeyle yeniden çek (sunucu evreyi birkaç saniyede çevirebilir)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);
  const onDeadline = useCallback(() => {
    onRefresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(onRefresh, 4000);
  }, [onRefresh]);

  return (
    <div className="space-y-5">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {PHASE_ANNOUNCE[active.phase]}
      </p>

      <PhaseHero week={active} offset={offset} onDeadline={onDeadline} />

      {active.phase === 'upcoming' && <UpcomingView week={active} />}
      {active.phase === 'submit' && <SubmitView key={active.week_id} week={active} offset={offset} />}
      {active.phase === 'revealed' && <RevealedView key={active.week_id} week={active} />}
      {active.phase === 'live' && <LiveView key={active.week_id} week={active} />}
      {isResultPhase(active.phase) && (
        <>
          <ResultsPanel week={active} />
          <Discussion weekId={active.week_id} count={active.comments_count} lockedText="Tartışma kapalı." />
        </>
      )}

      {showPrevious && previous && (
        <section aria-labelledby="picks-prev-title" className="pt-4">
          <h2 id="picks-prev-title" className="g-title text-2xl">
            Geçen haftanın sonuçları
          </h2>
          <p className="g-title-sm mb-2 text-sm">{weekRangeLabel(previous.starts_at, previous.ends_at)} haftası</p>
          <ResultsPanel week={previous} />
        </section>
      )}

      <RewardCelebration week={celebrate} />
    </div>
  );
}

/** Evre etiketi + hafta + geri sayım + akış */
function PhaseHero({ week, offset, onDeadline }: { week: PicksWeek; offset: number; onDeadline: () => void }) {
  const dl = phaseDeadline(week);
  return (
    <section aria-label="Hafta durumu" className="flex flex-col items-center gap-3">
      <p className="flex flex-wrap items-center justify-center gap-2">
        <span className={cn('g-ribbon text-sm', PHASE_RIBBON[week.phase])}>
          {week.phase === 'live' && <LiveDot />}
          {PHASE_LABELS[week.phase]}
        </span>
        <span className="g-hud h-8 px-3 text-xs">{weekRangeLabel(week.starts_at, week.ends_at)} haftası</span>
      </p>
      {dl.at && <PicksCountdown target={dl.at} offsetMs={offset} label={dl.label} onDone={onDeadline} />}
      <PhaseTimeline week={week} className="mt-1 w-full" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Evreler                                                              */
/* ------------------------------------------------------------------ */

function UpcomingView({ week }: { week: PicksWeek }) {
  return (
    <>
      <section className="flex flex-col items-center gap-2 text-center">
        <SealedEnvelope />
        <h2 className="g-title text-2xl">Yeni hafta geliyor</h2>
        <p className="g-title-sm text-base">Seçimler {atDayTime(week.opens_at)} açılır. Bir varlık, bir yön, kısa bir not — hepsi bu.</p>
      </section>
      <WhyHiddenPanel revealText={atDayTime(week.reveal_at)} />
      <RewardsTable week={week} />
    </>
  );
}

function SubmitView({ week, offset }: { week: PicksWeek; offset: number }) {
  const now = useNow(5_000) + offset;
  const actions = usePickActions(week.week_id);
  const [editing, setEditing] = useState(false);
  const [sealCount, setSealCount] = useState(0);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [announce, setAnnounce] = useState('');
  const editable = canEditPick(week, now);
  const mine = week.my_pick;
  const revealText = atDayTime(week.reveal_at);
  const formRef = useRef<HTMLDivElement>(null);

  const openForm = () => {
    actions.clearError();
    setEditing(true);
    // Form açıldığında ilk alana odaklan
    setTimeout(() => {
      formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      formRef.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    }, 50);
  };

  const submit = async (input: PickInput) => {
    const ok = await actions.submit(input);
    if (!ok) return;
    setEditing(false);
    setSealCount((n) => n + 1);
    setAnnounce(`Seçimin mühürlendi: ${input.symbol}, ${input.direction === 'up' ? 'yükselir' : 'düşer'}.`);
    playSound('coin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const withdraw = async () => {
    const ok = await actions.withdraw();
    setConfirmWithdraw(false);
    if (ok) {
      setAnnounce('Seçimin geri çekildi.');
      setSealCount(0);
    }
  };

  const participants = week.participants;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      <section aria-labelledby="picks-vault-title" className="flex flex-col items-center gap-2 text-center">
        <SealedEnvelope key={sealCount} sealing={sealCount > 0} mine={!!mine} />
        <h2 id="picks-vault-title" className="g-title text-2xl">
          Gizli zarf
        </h2>
        <p className="g-title-sm max-w-sm text-base">
          {participants > 0 ? (
            <>
              <span className="g-num">{participants.toLocaleString('tr-TR')}</span> kişi seçimini yaptı — kimin neyi seçtiğini {revealText} göreceksin.
            </>
          ) : (
            <>Henüz kimse seçim yapmadı — ilk zarfı sen bırak! Tüm seçimler {revealText} açılır.</>
          )}
        </p>
      </section>

      {editing && editable ? (
        <div ref={formRef} className="scroll-mt-4">
          <PickForm
            initial={mine}
            busy={actions.busy === 'submit'}
            error={actions.error}
            onSubmit={(input) => void submit(input)}
            onCancel={() => {
              setEditing(false);
              actions.clearError();
            }}
          />
        </div>
      ) : mine ? (
        <MyPickCard
          pick={mine}
          phase="submit"
          revealAt={week.reveal_at}
          actions={
            editable ? (
              <div className="grid grid-cols-2 gap-3">
                <GameButton variant="blue" size="md" icon={<PencilSquareIcon aria-hidden="true" />} onClick={openForm}>
                  Değiştir
                </GameButton>
                <GameButton variant="plain" size="md" onClick={() => setConfirmWithdraw(true)} loading={actions.busy === 'withdraw'}>
                  Geri çek
                </GameButton>
                {actions.error && (
                  <p role="alert" className="col-span-2 rounded-2xl bg-(--g-down-soft) px-3 py-2 text-center text-sm font-bold text-(--g-down)">
                    {actions.error}
                  </p>
                )}
              </div>
            ) : null
          }
        />
      ) : editable ? (
        <GameButton variant="green" size="xl" block className="g-anim-pop" onClick={openForm}>
          SEÇİMİNİ YAP
        </GameButton>
      ) : (
        <GameNotice tone="purple" title="Zarflar mühürlendi">
          Bu haftanın seçim süresi doldu. Açılış birazdan!
        </GameNotice>
      )}

      <WhyHiddenPanel revealText={revealText} />
      <RewardsTable week={week} />
      <Discussion weekId={week.week_id} locked lockedText={`Tartışma ${revealText} açılır.`} />

      <GameDialog open={confirmWithdraw} onClose={() => setConfirmWithdraw(false)} title="Geri çekilsin mi?" accent="red">
        <p className="text-center text-sm font-semibold text-(--g-ink-soft)">
          Zarfın kitleden çıkarılır. Açılışa ({formatDayTime(week.reveal_at)}) kadar yeniden seçim yapabilirsin.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <GameButton variant="red" size="md" block loading={actions.busy === 'withdraw'} onClick={() => void withdraw()}>
            Evet, geri çek
          </GameButton>
          <GameButton variant="plain" size="md" block onClick={() => setConfirmWithdraw(false)} data-autofocus>
            Vazgeç
          </GameButton>
        </div>
      </GameDialog>

      <ProblemDialog problem={actions.problem} onClose={actions.clearProblem} />
    </>
  );
}

function RevealedView({ week }: { week: PicksWeek }) {
  return (
    <>
      <section className="text-center">
        <h2 className="g-title g-anim-pop text-[30px]">Zarflar açıldı!</h2>
        <p className="g-title-sm mt-1 text-base">
          <span className="g-num">{week.participants.toLocaleString('tr-TR')}</span> seçim ortada. Yarış {atDayTime(week.starts_at)} başlıyor; o zamana kadar seçimleri inceleyip tartış.
        </p>
      </section>
      {week.my_pick ? (
        <MyPickCard pick={week.my_pick} phase="revealed" />
      ) : (
        <GameNotice tone="blue" title="Bu hafta izleyicisin">
          Bu hafta seçim yapmadın. Kitleyi izleyip tartışmaya katılabilirsin; yeni seçimler Cumartesi açılır.
        </GameNotice>
      )}
      <CrowdPanel week={week} />
      <PicksGrid key={week.week_id} week={week} revealMoment />
      <Discussion weekId={week.week_id} count={week.comments_count} lockedText="Tartışma açılışta başlar." />
    </>
  );
}

function LiveView({ week }: { week: PicksWeek }) {
  return (
    <>
      {week.my_pick ? (
        <MyPickCard pick={week.my_pick} phase="live" rank={week.my_rank} />
      ) : (
        <GameNotice tone="blue" title="Bu hafta izleyicisin">
          Bu hafta seçim yapmadın. Sıralamayı izleyip tartışmaya katılabilirsin; yeni seçimler Cumartesi açılır.
        </GameNotice>
      )}
      <ComparePanel week={week} />
      <Standings week={week} live />
      <CrowdPanel week={week} showReturns />
      <Discussion weekId={week.week_id} count={week.comments_count} lockedText="Tartışma açılışta başlar." />
    </>
  );
}
