'use client';

import { Suspense, use } from 'react';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader } from '@/components/game/ui/bits';
import ScenarioRoundScreen from '@/components/game/scenarios/ScenarioRoundScreen';

/** Bitmiş senaryo turunun "Ne oldu?" sayfası (geçmişten bağlantı). */
export default function ScenarioRoundPage({ params }: { params: Promise<{ roundId: string }> }) {
  return (
    <Suspense
      fallback={
        <GameScreen>
          <GameLoader label="Tur yükleniyor…" />
        </GameScreen>
      }
    >
      <Gate params={params} />
    </Suspense>
  );
}

function Gate({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = use(params);
  return <ScenarioRoundScreen key={roundId} roundId={roundId} />;
}
