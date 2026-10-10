'use client';

import { Suspense, use } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import ChallengeView from '@/components/arena/ChallengeView';

export default function ArenaChallengePage({ params }: { params: Promise<{ id: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <ChallengeGate params={params} />
    </Suspense>
  );
}

function ChallengeGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <ChallengeView key={id} id={id} />;
}
