'use client';

import { Suspense, use } from 'react';
import { GameLoader, GameScreen } from '@/components/game/ui';
import WeekDetailScreen from '@/components/game/picks/WeekDetailScreen';

export default function WeeklyPicksWeekPage({ params }: { params: Promise<{ weekId: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense
      fallback={
        <GameScreen>
          <GameLoader label="Hafta yükleniyor…" />
        </GameScreen>
      }
    >
      <WeekGate params={params} />
    </Suspense>
  );
}

function WeekGate({ params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = use(params);
  return <WeekDetailScreen key={weekId} weekId={weekId} />;
}
