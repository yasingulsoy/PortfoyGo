'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BoltIcon, PlayIcon, UserPlusIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { useActiveArenaRound, useArenaChallenges } from '@/hooks/useArena';
import { useGameProfile } from '@/hooks/useGameProfile';
import { durationLabel } from '@/components/arena/model';
import { GameButton, GameLinkButton, GameScreen, ModeTile, ShieldIcon, WheelIcon } from '@/components/game/ui';
import { ActiveRoundBanner, ChallengesDialog, DurationChips, HubHero, RecentDuels, SoloDialog } from '@/components/game/hub/HubParts';
import { ChartArt, ChecklistArt, FlagArt, PodiumArt, ScrollArt, ShopArt, TowerArt } from '@/components/game/hub/arts';
import ProblemDialog from '@/components/game/ProblemDialog';
import { useGameActions } from '@/components/game/useGameActions';
import { usePicksCurrent } from '@/hooks/usePicks';
import { picksHubBadge, PICKS_PATH } from '@/components/game/picks/model';
import { PicksArt } from '@/components/game/picks/parts';

const MATCH_DURATIONS = [60, 180, 300] as const;
/** Masaüstünde mod kutucukları biraz daha yüksek */
const TILE = 'lg:min-h-[140px]';
type MatchDuration = (typeof MATCH_DURATIONS)[number];

/** Oyun Merkezi ana ekranı (Kafa Topu tarzı). */
export default function OyunHubPage() {
  const { user } = useAuth();
  const { profile } = useGameProfile();
  const active = useActiveArenaRound();
  const live = useArenaChallenges('live');
  const upcoming = useArenaChallenges('upcoming');
  const { startSolo, createInvite, busy, problem, clearProblem } = useGameActions();
  const [duration, setDuration] = useState<MatchDuration>(180);
  const [soloOpen, setSoloOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);

  const username = user?.username ?? '';
  const running = active.data && active.data.round.status !== 'finished' ? active.data.round : null;
  const liveCount = live.data?.length ?? 0;
  const upcomingCount = upcoming.data?.length ?? 0;
  const freeSpin = profile ? profile.spins.free_available || profile.spins.extra > 0 : false;
  const unclaimed = profile?.quests.unclaimed ?? 0;
  const picks = usePicksCurrent();
  const picksBadge = picksHubBadge(picks.data);

  return (
    <GameScreen topBar back="/" backLabel="Uygulamaya dön" layout="full">
      <h1 className="sr-only">Oyun Merkezi</h1>

      {running && (
        <ActiveRoundBanner
          roundId={running.id}
          label={running.kind === 'challenge' && running.challenge ? running.challenge.title : `${durationLabel(running.duration_s)} tur`}
        />
      )}

      {/* Telefonda tek sütun (profil → maç → modlar → son maçlar); masaüstünde lobi: solda oyuncu, maç ve son maçlar, sağda modlar. Kod sırası görsel sırayla aynı (klavye / ekran okuyucu). */}
      <div className="mx-auto flex w-full max-w-2xl flex-col lg:grid lg:max-w-none lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-8 xl:gap-x-10">
        <div className="lg:col-span-5 lg:row-start-1 xl:col-span-4">
          <HubHero profile={profile} username={username} />

          <section aria-label="Maç başlat" className="flex flex-col gap-4">
            <DurationChips label="Maç süresi" value={duration} options={MATCH_DURATIONS} onChange={setDuration} />
            <GameLinkButton
              href={`/oyun/hizli-mac?d=${duration}`}
              variant="green"
              size="xl"
              block
              icon={<BoltIcon aria-hidden="true" />}
              className="g-anim-pop"
              aria-label={`Hızlı maç: ${durationLabel(duration)}, bire bir eşleşme`}
            >
              HIZLI MAÇ
            </GameLinkButton>
            <div className="grid grid-cols-2 gap-3">
              <GameButton variant="blue" size="md" wrap loading={busy === 'invite'} onClick={() => void createInvite(duration)} icon={<UserPlusIcon aria-hidden="true" />}>
                Arkadaşını Davet Et
              </GameButton>
              <GameButton variant="purple" size="md" wrap onClick={() => setSoloOpen(true)} icon={<PlayIcon aria-hidden="true" />}>
                Solo Tur
              </GameButton>
            </div>
          </section>
        </div>

        <section
          aria-labelledby="g-modes"
          className="mt-8 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:mt-0 xl:col-span-8 xl:col-start-5"
        >
          <h2 id="g-modes" className="g-title-sm mb-3 text-xl lg:text-2xl">
            Oyun Modları
          </h2>
          <div className="grid grid-cols-2 gap-3 gap-y-4 sm:grid-cols-3 lg:gap-4 xl:grid-cols-4">
            <ModeTile title="Arena Turu" subtitle="Solo · 1/3/5/10 dk" art={<ChartArt />} color="blue" onClick={() => setSoloOpen(true)} className={TILE} />
            <ModeTile
              title="Meydan Okumalar"
              subtitle={liveCount ? `${liveCount} canlı · ${upcomingCount} yaklaşan` : upcomingCount ? `${upcomingCount} yaklaşan` : 'Canlı turnuvalar'}
              art={<FlagArt />}
              color="orange"
              badge={liveCount ? 'CANLI' : null}
              onClick={() => setChallengesOpen(true)}
              className={TILE}
            />
            <ModeTile title="Senaryolar" subtitle="Tarihi anları yeniden oyna" art={<ScrollArt />} color="teal" href="/oyun/senaryolar" className={TILE} />
            <ModeTile title="Yatırım İmparatorluğu" subtitle="Boşta kazanan şirketini kur" art={<TowerArt />} color="gold" href="/oyun/imparatorluk" className={TILE} />
            <ModeTile title="Günlük Çark" subtitle={freeSpin ? 'Ücretsiz çevirme hazır!' : 'Her gün ücretsiz'} art={<WheelIcon size={36} />} color="pink" href="/oyun/cark" badge={freeSpin ? '!' : null} className={TILE} />
            <ModeTile title="Görevler" subtitle={profile ? `${profile.quests.completed_today}/${profile.quests.total_today} tamam` : 'Günlük görevler'} art={<ChecklistArt />} color="green" href="/oyun/gorevler" badge={unclaimed || null} className={TILE} />
            <ModeTile title="Mağaza" subtitle="Avatar ve çerçeveler" art={<ShopArt />} color="purple" href="/oyun/magaza" className={TILE} />
            <ModeTile title="Sıralama" subtitle="Puan ve seviye listesi" art={<PodiumArt />} color="red" href="/oyun/siralama" className={TILE} />
            <ModeTile title="Haftalık Seçim" subtitle="Kitlelerin Bilgeliği" art={<PicksArt />} color="teal" href={PICKS_PATH} badge={picksBadge} wide className="sm:col-span-1 xl:col-span-4" />
          </div>
        </section>

        <div className="lg:col-span-5 lg:row-start-2 lg:self-start xl:col-span-4">
          <RecentDuels />
        </div>
      </div>

      <footer className="mt-8 flex justify-center">
        <Link
          href="/oyun/sorumlu-oyun"
          className="g-glass g-focus inline-flex items-center gap-2 rounded-full px-4 py-2 text-center text-xs font-extrabold text-(--g-on-color)"
        >
          <ShieldIcon size={18} />
          Sanal para · Gerçek yatırım değildir · Sorumlu oyun
        </Link>
      </footer>

      <SoloDialog open={soloOpen} onClose={() => setSoloOpen(false)} onStart={(d) => void startSolo(d)} busy={busy === 'solo'} />
      <ChallengesDialog open={challengesOpen} onClose={() => setChallengesOpen(false)} />
      <ProblemDialog problem={problem} onClose={clearProblem} />
    </GameScreen>
  );
}
