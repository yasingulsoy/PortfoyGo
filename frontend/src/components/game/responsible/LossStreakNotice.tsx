'use client';

import { useState } from 'react';
import { cn } from '@portfoygo/shared/format';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import { LOSS_STREAK_THRESHOLD } from './model';
import { useResponsibleState } from './useResponsibleState';

const DISMISS_KEY = 'pg:loss-streak-dismissed';

function readDismissed(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(window.sessionStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Arka arkaya zararla biten turlarda (≥ 3) nazik bir mola önerisi. Kapatılınca seri değişene
 * kadar (bu sekmede) tekrar gösterilmez.
 */
export function LossStreakNotice({ streak: streakProp, className }: { /** Verilmezse profilden okunur */ streak?: number; className?: string }) {
  const { state } = useResponsibleState();
  const streak = streakProp ?? state?.loss_streak ?? 0;
  const [dismissed, setDismissed] = useState<number>(readDismissed);

  if (streak < LOSS_STREAK_THRESHOLD || dismissed === streak) return null;

  const dismiss = () => {
    setDismissed(streak);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, String(streak));
    } catch {}
  };

  return (
    <aside role="status" aria-live="polite" className={cn('g-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center', className)}>
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-(--g-teal-edge) bg-(--g-teal) text-(--g-on-color)"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 8c.8 1.2 1 2.4 1 4a6 6 0 1 1-12 0c0-1.6.2-2.8 1-4" />
          <path d="M12 2v6" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="g-font text-lg font-extrabold leading-tight">Son {streak} turu zararla bitirdin.</p>
        <p className="text-sm font-semibold text-(--g-ink-soft)">Kısa bir mola iyi gelebilir. Piyasalar kaçmıyor, sen de dinlenmeyi hak ediyorsun.</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <GameLinkButton href="/oyun/sorumlu-oyun" variant="teal" size="sm">
          Mola ver
        </GameLinkButton>
        <GameButton variant="plain" size="sm" onClick={dismiss}>
          Tamam
        </GameButton>
      </div>
    </aside>
  );
}
