'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameLoader, GameScreen } from '@/components/game/ui';
import DuelRoom from '@/components/game/match/DuelRoom';

export default function DuelInvitePage({ params }: { params: Promise<{ code: string }> }) {
  // use(params) ve useSearchParams askıya alınabilir; sınır burada.
  return (
    <Suspense
      fallback={
        <GameScreen>
          <GameLoader label="Davet yükleniyor…" />
        </GameScreen>
      }
    >
      <DuelGate params={params} />
    </Suspense>
  );
}

function DuelGate({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const search = useSearchParams();
  return <DuelRoom key={code} code={decodeURIComponent(code)} fresh={search.get('yeni') === '1'} />;
}
