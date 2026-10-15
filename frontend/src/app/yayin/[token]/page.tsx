'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import BroadcastOverlay from '@/components/game/broadcast/BroadcastOverlay';

/** OBS yayın katmanı (herkese açık). `?bg=transparent` ile saydam arka plan. */
export default function BroadcastPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={null}>
      <BroadcastGate params={params} />
    </Suspense>
  );
}

function BroadcastGate({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const search = useSearchParams();
  return <BroadcastOverlay key={token} token={token} transparent={search.get('bg') === 'transparent'} />;
}
