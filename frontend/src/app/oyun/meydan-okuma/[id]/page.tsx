'use client';

import { Suspense, use } from 'react';
import { GameLoader, GameScreen } from '@/components/game/ui';
import ChallengeLobby from '@/components/game/match/ChallengeLobby';

export default function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense
      fallback={
        <GameScreen>
          <GameLoader label="Meydan okuma yükleniyor…" />
        </GameScreen>
      }
    >
      <ChallengeGate params={params} />
    </Suspense>
  );
}

function ChallengeGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChallengeLobby key={id} id={id} />;
}
