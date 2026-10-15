'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { CheckCircleIcon, EyeIcon, GiftIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { cn, formatDateTime, formatUSD } from '@portfoygo/shared/format';
import { useArenaChallenges, useChallengeLeaderboard } from '@/hooks/useArena';
import { useNow } from '@/hooks/useNow';
import { arenaApi } from '@/lib/api';
import { useInstrumentLabels } from '@/components/arena/Challenges';
import { durationLabel, formatCountdown } from '@/components/arena/model';
import { Avatar, GameButton, GameLinkButton, GameLoader, GameNotice, GamePanel, GameScreen, ShieldIcon, TrophyIcon, playSound } from '@/components/game/ui';
import { PCT_TONE_CLASS, pctTone, signedPct } from '@/components/game/model';
import GameRoundScreen from '@/components/game/round/GameRoundScreen';
import ProblemDialog from '@/components/game/ProblemDialog';
import { toProblem, type GameProblem } from '@/components/game/useGameActions';
import type { ArenaChallenge, ArenaLeaderboardRow } from '@/types';

/** Katılan oyuncu için tur ekranı başlangıçtan bu kadar önce açılır (geri sayım tur ekranında akar). */
const OPEN_ROUND_BEFORE_MS = 2 * 60_000;

/** Meydan okuma: oyun lobisi (sponsor, ödül, geri sayım, katılım) → canlıyken tur ekranı → bitince kürsü. */
export default function ChallengeLobby({ id }: { id: string }) {
  const live = useArenaChallenges('live');
  const upcoming = useArenaChallenges('upcoming');
  const finished = useArenaChallenges('finished');
  const now = useNow(1000);
  const labels = useInstrumentLabels();
  const { mutate } = useSWRConfig();
  const [joinedRound, setJoinedRound] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [watching, setWatching] = useState(false);
  const [enteredRound, setEnteredRound] = useState<string | null>(null);
  const [problem, setProblem] = useState<GameProblem | null>(null);

  const all = [...(live.data ?? []), ...(upcoming.data ?? []), ...(finished.data ?? [])];
  const c = all.find((x) => x.id === id) ?? null;
  const settled = [live, upcoming, finished].every((s) => s.data !== undefined || s.error);

  if (!c) {
    return (
      <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Meydan Okuma">
        {settled ? (
          <GameNotice
            icon={<ShieldIcon />}
            tone="orange"
            title="Meydan okuma bulunamadı"
            actions={
              <GameLinkButton href="/oyun" variant="blue" size="md">
                Oyun Merkezi
              </GameLinkButton>
            }
          >
            Bu meydan okuma kaldırılmış ya da henüz yayınlanmamış olabilir.
          </GameNotice>
        ) : (
          <GameLoader label="Meydan okuma yükleniyor…" />
        )}
      </GameScreen>
    );
  }

  const roundId = joinedRound ?? c.round_id;
  const joined = c.joined || !!joinedRound;
  const startsIn = Date.parse(c.starts_at) - now;
  const isLive = c.status === 'live' || (c.status === 'upcoming' && startsIn <= 0);
  const showRound = !!roundId && c.status !== 'finished' && ((joined && (isLive || startsIn <= OPEN_ROUND_BEFORE_MS)) || (watching && isLive));

  // Tur ekranına girildiyse liste "bitti" olarak yenilense de ekran (ve sonuç ekranı) korunur
  if (showRound && enteredRound !== roundId) setEnteredRound(roundId);
  if ((showRound || enteredRound === roundId) && roundId) return <GameRoundScreen key={roundId} id={roundId} />;

  const join = async () => {
    setJoining(true);
    try {
      const { round_id } = await arenaApi.joinChallenge(c.id);
      playSound('coin');
      if (round_id) setJoinedRound(round_id);
      void mutate((key) => typeof key === 'string' && key.startsWith('/arena/challenges'));
    } catch (err) {
      setProblem(toProblem(err, 'Katılınamadı'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <GameScreen back="/oyun" backLabel="Oyun Merkezi" title="Meydan Okuma" background={c.status === 'finished' ? 'night' : 'sky'}>
      <div className="flex flex-col gap-4">
        <section className="g-panel p-4 pt-5 text-center" aria-labelledby="g-ch-title">
          <span
            className={cn(
              'g-ribbon text-sm',
              c.status === 'finished' ? 'g-ribbon--purple' : isLive ? 'g-ribbon--red' : 'g-ribbon--blue',
            )}
          >
            {c.status === 'finished' ? 'BİTTİ' : isLive ? '● CANLI' : 'YAKLAŞAN'}
          </span>
          <h2 id="g-ch-title" className="mt-3 text-2xl font-extrabold leading-tight">
            {c.title}
          </h2>
          {c.description && <p className="mt-2 whitespace-pre-line text-sm font-semibold text-(--g-ink-soft)">{c.description}</p>}
          {(c.sponsor || c.prize_text) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {c.sponsor && (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-(--g-purple-edge) bg-(--g-purple) px-3 py-1 text-xs font-extrabold text-(--g-on-color)">
                  <SparklesIcon className="h-4 w-4" aria-hidden="true" />
                  Sponsor: {c.sponsor}
                </span>
              )}
              {c.prize_text && (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-(--g-gold-edge) bg-(--g-gold) px-3 py-1 text-xs font-extrabold text-(--g-gold-ink)">
                  <GiftIcon className="h-4 w-4" aria-hidden="true" />
                  {c.prize_text}
                </span>
              )}
            </div>
          )}
        </section>

        {c.status !== 'finished' && (
          <section className="flex flex-col items-center gap-3 text-center" aria-label="Katılım">
            <p className="text-xs font-extrabold uppercase tracking-widest text-(--g-on-color) opacity-90">{isLive ? 'Şu an canlı' : 'Başlamasına'}</p>
            <p className="g-title g-num text-5xl" role="timer" aria-live="off">
              {isLive ? 'CANLI!' : formatCountdown(startsIn)}
            </p>
            {joined ? (
              <p className="g-glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold text-(--g-on-color)">
                <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
                Katıldın! Tur ekranı başlamadan 2 dk önce açılır.
              </p>
            ) : (
              <GameButton variant="green" size="xl" block loading={joining} onClick={() => void join()}>
                KATIL
              </GameButton>
            )}
            {isLive && !joined && c.round_id && (
              <GameButton variant="ghost" size="md" onClick={() => setWatching(true)} icon={<EyeIcon aria-hidden="true" />}>
                İzle
              </GameButton>
            )}
          </section>
        )}

        <dl className="grid grid-cols-2 gap-3">
          <Fact label="Başlangıç" value={formatDateTime(c.starts_at)} />
          <Fact label="Süre" value={durationLabel(c.duration_s)} />
          <Fact label="Sanal bakiye" value={formatUSD(c.starting_cash)} />
          <Fact label="Oyuncu" value={String(c.participants)} />
          <Fact label="Enstrümanlar" wide value={c.instruments.length ? labels(c.instruments).join(', ') : 'Tümü'} />
        </dl>

        <Standings c={c} />

        <p className="g-glass mx-auto flex w-fit items-center gap-2 rounded-full px-4 py-2 text-center text-xs font-extrabold text-(--g-on-color)">
          <ShieldIcon size={18} />
          Herkes aynı fiyat akışıyla oynar · Sanal para
        </p>
      </div>
      <ProblemDialog problem={problem} onClose={() => setProblem(null)} />
    </GameScreen>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('g-panel min-w-0 px-3 py-2', wide && 'col-span-2')}>
      <dt className="text-[11px] font-extrabold uppercase tracking-wide text-(--g-ink-soft)">{label}</dt>
      <dd className={cn('g-num text-sm font-extrabold', !wide && 'truncate')}>{value}</dd>
    </div>
  );
}

/** Canlı / son sıralama: ilk üç kürsüde, diğerleri listede. */
function Standings({ c }: { c: ArenaChallenge }) {
  const lb = useChallengeLeaderboard(c.id, c.status === 'live');
  const rows = lb.data?.items ?? [];
  if (c.status === 'upcoming' && rows.length === 0) {
    return null;
  }
  return (
    <GamePanel title={c.status === 'finished' ? 'Kürsü' : 'Canlı sıralama'} accent="gold" className="mt-6">
      {rows.length === 0 ? (
        <p className="py-3 text-center text-sm font-bold text-(--g-ink-soft)">{lb.isLoading ? 'Yükleniyor…' : c.status === 'finished' ? 'Sonuçlar hazırlanıyor.' : 'Sıralama tur başlayınca görünür.'}</p>
      ) : (
        <>
          {c.status === 'finished' && rows.length >= 1 && <Podium rows={rows.slice(0, 3)} />}
          <ol className="mt-2 space-y-1.5">
            {rows.slice(c.status === 'finished' ? 3 : 0, 50).map((r) => (
              <li key={`${r.rank}-${r.username}`} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5', r.is_me ? 'bg-(--g-gold-top) text-(--g-gold-ink)' : 'bg-(--g-panel-2)')}>
                <span className="g-num w-7 text-center text-sm font-extrabold">{r.rank}</span>
                <Avatar seed={r.username} size={28} ring={false} />
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{r.is_me ? `${r.username} (sen)` : r.username}</span>
                <span className={cn('g-num text-sm font-extrabold', PCT_TONE_CLASS[pctTone(r.return_pct)])}>{signedPct(r.return_pct)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </GamePanel>
  );
}

const PODIUM = [
  { place: 2, height: 'h-16', face: 'bg-(--g-tier-silver)', edge: 'border-(--g-tier-silver-edge)' },
  { place: 1, height: 'h-24', face: 'bg-(--g-gold)', edge: 'border-(--g-gold-edge)' },
  { place: 3, height: 'h-12', face: 'bg-(--g-tier-bronze)', edge: 'border-(--g-tier-bronze-edge)' },
] as const;

function Podium({ rows }: { rows: ArenaLeaderboardRow[] }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2 pt-6" aria-label="İlk üç">
      {PODIUM.map((p) => {
        const r = rows[p.place - 1];
        return (
          <div key={p.place} className="flex min-w-0 flex-col items-center gap-1">
            {r ? (
              <>
                <span className="relative">
                  {p.place === 1 && (
                    <span className="g-anim-bounce absolute -top-6 left-1/2 -translate-x-1/2 text-2xl" aria-hidden="true">
                      👑
                    </span>
                  )}
                  <Avatar seed={r.username} size={p.place === 1 ? 64 : 52} />
                </span>
                <span className="w-full truncate text-center text-xs font-extrabold">{r.username}</span>
                <span className={cn('g-num text-xs font-extrabold', PCT_TONE_CLASS[pctTone(r.return_pct)])}>{signedPct(r.return_pct)}</span>
              </>
            ) : (
              <span className="h-[52px]" />
            )}
            <div className={cn('flex w-full items-start justify-center rounded-t-2xl border-[3px] border-b-0 pt-1', p.height, p.face, p.edge)}>
              <span className="g-title-sm inline-flex items-center gap-0.5 text-xl">
                {p.place === 1 && <TrophyIcon size={18} />}
                {p.place}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
