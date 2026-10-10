'use client';

import { Suspense, use } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import RoundScreen from '@/components/arena/RoundScreen';

export default function ArenaRoundPage({ params }: { params: Promise<{ id: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <RoundGate params={params} />
    </Suspense>
  );
}

function RoundGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  // Kimlik değişince (ör. "Tekrar oyna") canlı tur durumu sıfırdan kurulur
  return <RoundScreen key={id} id={id} />;
}
