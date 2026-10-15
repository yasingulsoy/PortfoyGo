'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import GamePanel from '@/components/game/ui/GamePanel';
import GameButton from '@/components/game/ui/GameButton';
import GameScreen from '@/components/game/ui/GameScreen';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useGameQuests } from '@/hooks/useGameEconomy';
import { gameEconomyApi } from '@/lib/api';
import type { GameQuest, GameQuestList } from '@/types';
import { LossStreakNotice } from '../responsible';
import { rewardSummary } from '../wheel/model';
import { useCoinFlight } from './CoinFlight';
import { Countdown } from './Countdown';
import { sortQuests, toStreakInfo } from './model';
import { QuestCard } from './QuestCard';
import { StreakCalendar } from './StreakCalendar';
import { nextIstanbulMidnight } from './time';
import { ErrorPanel, LoadingPanel } from './screenParts';

/** Günlük görevler, ödül alma (jeton uçuşu) ve 7 günlük seri. */
export default function QuestsScreen() {
  const { data, error, isLoading, mutate } = useGameQuests();
  const { profile } = useGameProfile();
  const { mutate: globalMutate } = useSWRConfig();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState(() => nextIstanbulMidnight());
  const flight = useCoinFlight();

  const claim = async (quest: GameQuest, from: HTMLElement | null) => {
    if (claiming) return;
    setClaiming(quest.key);
    setClaimError(null);
    try {
      const res = await gameEconomyApi.claimQuest(quest.key);
      flight.fly(from, res.reward.coins ?? quest.reward.coins);
      setAnnounce(`Ödül alındı: ${rewardSummary(res.reward.coins || res.reward.xp ? res.reward : quest.reward)}`);
      await mutate(
        (list?: GameQuestList) =>
          list ? { ...list, items: list.items.map((q) => (q.key === quest.key ? { ...q, claimed: true, completed: true } : q)) } : list,
        {
          revalidate: true,
        },
      );
      void globalMutate(gameEconomyApi.profileKey);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Ödül alınamadı. Lütfen tekrar dene.');
      void mutate();
    } finally {
      setClaiming(null);
    }
  };

  const items = data ? sortQuests(data.items) : [];
  const ready = items.filter((q) => q.completed && !q.claimed).length;
  const streak = toStreakInfo(profile);

  return (
    <GameScreen
      topBar
      back="/oyun"
      backLabel="Oyun Merkezi’ne dön"
      title="Görevler"
      actions={
        <span className="g-hud h-9 px-3 text-sm" title="Görevler İstanbul saatiyle gece yarısı yenilenir">
          <span className="sr-only">Görevlerin yenilenmesine kalan süre: </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <Countdown
            target={resetAt}
            onDone={() => {
              setResetAt(nextIstanbulMidnight());
              void mutate();
              void globalMutate(gameEconomyApi.profileKey);
            }}
          />
        </span>
      }
    >
      <div className="space-y-5">
        <p className="g-title-sm -mt-2 text-base">{ready > 0 ? `${ready} ödül seni bekliyor!` : 'Her gün yeni görevler, yeni ödüller.'}</p>

        <LossStreakNotice />

        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>

        <GamePanel title="Günlük görevler" accent="green">
          {error && !data ? (
            <ErrorPanel error={error} onRetry={() => void mutate()} />
          ) : isLoading && !data ? (
            <LoadingPanel rows={3} />
          ) : items.length === 0 ? (
            <p className="py-6 text-center font-semibold text-(--g-ink-soft)">Bugün için görev yok. Yarın tekrar bak!</p>
          ) : (
            <ul className="space-y-3 pt-1">
              {items.map((q) => (
                <QuestCard key={q.key} quest={q} claiming={claiming === q.key} onClaim={claim} />
              ))}
            </ul>
          )}
          {claimError && (
            <div
              role="alert"
              className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-(--g-down-soft) px-3 py-2 text-sm font-semibold text-(--g-down)"
            >
              <span>{claimError}</span>
              <GameButton size="sm" variant="plain" onClick={() => setClaimError(null)}>
                Tamam
              </GameButton>
            </div>
          )}
        </GamePanel>

        <GamePanel title="Günlük seri" accent="orange">
          <StreakCalendar streak={streak} best={profile?.streak.best} />
        </GamePanel>

        <p className="px-1 text-center text-xs font-semibold text-(--g-on-color) opacity-90">
          Jeton ve XP yalnızca oyun içinde geçerlidir; gerçek para değeri yoktur.
        </p>

        {flight.layer}
      </div>
    </GameScreen>
  );
}
