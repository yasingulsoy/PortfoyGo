'use client';

import { GameButton, GameDialog, GameLinkButton, ShieldIcon } from '@/components/game/ui';
import type { GameProblem } from './useGameActions';

/** Oyun dilinde hata / sınır penceresi; sorumlu oyun durumlarında ayarlar sayfasına bağlantı. */
export default function ProblemDialog({ problem, onClose }: { problem: GameProblem | null; onClose: () => void }) {
  return (
    <GameDialog open={!!problem} onClose={onClose} title={problem?.title ?? ''} accent={problem?.responsible ? 'teal' : 'orange'}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="g-anim-float inline-flex">
          <ShieldIcon size={64} />
        </span>
        <p className="text-sm font-semibold text-(--g-ink-soft)">{problem?.text}</p>
        <div className="mt-2 flex w-full flex-col gap-3">
          {problem?.responsible && (
            <GameLinkButton href="/oyun/sorumlu-oyun" variant="teal" size="md" block>
              Sorumlu oyun ayarları
            </GameLinkButton>
          )}
          <GameButton variant={problem?.responsible ? 'plain' : 'blue'} size="md" block onClick={onClose} data-autofocus>
            Tamam
          </GameButton>
        </div>
      </div>
    </GameDialog>
  );
}
