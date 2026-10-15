'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameLoader, GameScreen } from '@/components/game/ui';
import QuickMatch, { parseMatchDuration } from '@/components/game/match/QuickMatch';

export default function QuickMatchPage() {
  // useSearchParams askıya alınabilir; sınır burada.
  return (
    <Suspense
      fallback={
        <GameScreen>
          <GameLoader label="Eşleşme hazırlanıyor…" />
        </GameScreen>
      }
    >
      <QuickMatchGate />
    </Suspense>
  );
}

function QuickMatchGate() {
  const params = useSearchParams();
  const duration = parseMatchDuration(params.get('d'));
  // Süre değişirse arama baştan kurulur
  return <QuickMatch key={duration} duration={duration} />;
}
