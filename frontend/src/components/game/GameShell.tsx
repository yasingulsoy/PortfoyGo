'use client';

import type { ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { AdultGate, SessionReminder } from '@/components/game/responsible';
import { GameLoader, GameScreen } from '@/components/game/ui';

/**
 * Oyun alanının kabuğu: oyun derisi ([data-skin="game"]) + yazı tipi değişkeni, oturum kontrolü,
 * yaş / mola kapısı ve oturum hatırlatıcısı. Uygulamanın kenar menüsü burada gösterilmez.
 */
export default function GameShell({ fontClass, children }: { fontClass: string; children: ReactNode }) {
  const { user, ready } = useRequireAuth();
  return (
    <div data-skin="game" className={cn(fontClass, 'g-root')}>
      {ready && user ? (
        <AdultGate>
          {children}
          <SessionReminder />
        </AdultGate>
      ) : (
        <GameScreen>
          <GameLoader label="Oyun yükleniyor…" />
        </GameScreen>
      )}
    </div>
  );
}
