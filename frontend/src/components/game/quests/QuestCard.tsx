'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import { CoinIcon, StarIcon } from '@/components/game/ui/icons';
import type { GameQuest } from '@/types';
import { questPercent } from './model';

/** Görev anahtarına göre simge rengi ve yönlendirme. */
const QUEST_META: Record<string, { accent: string; edge: string; href: string; glyph: ReactNode }> = {
  arena_profit_round: { accent: '--g-green', edge: '--g-green-edge', href: '/oyun', glyph: <path d="M4 17l6-6 4 4 6-7M15 8h5v5" /> },
  arena_use_sl: { accent: '--g-red', edge: '--g-red-edge', href: '/oyun', glyph: <path d="M12 3l8 3v6c0 4.5-3.3 8-8 9-4.7-1-8-4.5-8-9V6zM9 12h6" /> },
  arena_3_instruments: { accent: '--g-teal', edge: '--g-teal-edge', href: '/oyun', glyph: <path d="M4 6h4v12H4zM10 10h4v8h-4zM16 4h4v14h-4z" /> },
  duel_play: { accent: '--g-blue', edge: '--g-blue-edge', href: '/oyun', glyph: <path d="M5 19L15 9M9 5l10 10M5 15l4 4M15 5l4 4" /> },
  duel_win: {
    accent: '--g-gold',
    edge: '--g-gold-edge',
    href: '/oyun',
    glyph: <path d="M7 4h10v5a5 5 0 0 1-10 0zM12 14v4M8 20h8M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />,
  },
  main_buy: { accent: '--g-purple', edge: '--g-purple-edge', href: '/markets', glyph: <path d="M4 5h2l2 10h10l2-7H7M9 20h.01M17 20h.01" /> },
  challenge_join: { accent: '--g-orange', edge: '--g-orange-edge', href: '/oyun', glyph: <path d="M5 21V4M5 4h11l-2 4 2 4H5" /> },
  idle_collect: { accent: '--g-pink', edge: '--g-pink-edge', href: '/oyun', glyph: <path d="M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5" /> },
};
const DEFAULT_META = { accent: '--g-blue', edge: '--g-blue-edge', href: '/oyun', glyph: <path d="M12 4v16M4 12h16" /> };

export function questMeta(key: string) {
  return QUEST_META[key] ?? DEFAULT_META;
}

export function QuestCard({
  quest,
  claiming,
  onClaim,
}: {
  quest: GameQuest;
  claiming: boolean;
  /** Ödül düğmesi öğesi ile (jeton uçuşu için) */
  onClaim: (quest: GameQuest, from: HTMLElement | null) => void;
}) {
  const meta = questMeta(quest.key);
  const pct = questPercent(quest);
  const btnRef = useRef<HTMLButtonElement>(null);
  const ready = quest.completed && !quest.claimed;
  const titleId = `quest-${quest.key}`;

  return (
    <li
      aria-labelledby={titleId}
      className={cn(
        'g-panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4',
        quest.claimed && 'opacity-80',
        ready && 'outline-3 outline-offset-2 outline-(--g-gold)',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] text-(--g-on-color)"
          style={{ background: `var(${meta.accent})`, borderColor: `var(${meta.edge})`, boxShadow: `0 3px 0 var(${meta.edge})` } as CSSProperties}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            {meta.glyph}
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="g-font text-lg leading-tight font-extrabold">
            {quest.title}
          </h3>
          <p className="text-sm text-(--g-ink-soft)">{quest.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <div
              className="g-progress h-4 flex-1"
              role="progressbar"
              aria-label={`${quest.title} ilerlemesi`}
              aria-valuemin={0}
              aria-valuemax={quest.target}
              aria-valuenow={quest.progress}
              aria-valuetext={`${quest.progress} / ${quest.target}`}
            >
              <div
                className="g-progress-fill"
                style={{ width: `${pct}%`, '--p-color': quest.completed ? 'var(--g-green)' : 'var(--g-blue)' } as CSSProperties}
              />
            </div>
            <span className="g-num w-12 shrink-0 text-right text-sm font-extrabold">
              {quest.progress}/{quest.target}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
        <div className="flex items-center gap-1.5" aria-label={`Ödül: ${quest.reward.coins} jeton, ${quest.reward.xp} XP`}>
          {quest.reward.coins > 0 && (
            <span className="g-chip h-8 px-2 text-sm">
              <CoinIcon size={20} />
              <span className="g-num">+{quest.reward.coins}</span>
            </span>
          )}
          {quest.reward.xp > 0 && (
            <span className="g-chip h-8 px-2 text-sm">
              <StarIcon size={18} />
              <span className="g-num">+{quest.reward.xp} XP</span>
            </span>
          )}
        </div>
        {quest.claimed ? (
          <span className="g-chip h-9 px-3 text-sm text-(--g-up)">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l5 5 9-10" />
            </svg>
            Alındı
          </span>
        ) : ready ? (
          <GameButton
            ref={btnRef}
            variant="gold"
            size="md"
            loading={claiming}
            sound="coin"
            onClick={() => onClaim(quest, btnRef.current)}
            className="g-anim-wiggle-loop"
            aria-describedby={titleId}
          >
            ÖDÜLÜ AL
          </GameButton>
        ) : (
          <GameLinkButton href={meta.href} variant="blue" size="sm" aria-describedby={titleId}>
            Oyna
          </GameLinkButton>
        )}
      </div>
    </li>
  );
}
