'use client';

import { Suspense, use } from 'react';
import { GameLoader, GameScreen } from '@/components/game/ui';
import GameRoundScreen from '@/components/game/round/GameRoundScreen';

export default function GameRoundPage({ params }: { params: Promise<{ id: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense
      fallback={
        <GameScreen>
          <GameLoader label="Tur hazırlanıyor…" />
        </GameScreen>
      }
    >
      <RoundGate params={params} />
    </Suspense>
  );
}

function RoundGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Kimlik değişince (ör. "Tekrar oyna") canlı tur durumu sıfırdan kurulur
  return <GameRoundScreen key={id} id={id} />;
}
