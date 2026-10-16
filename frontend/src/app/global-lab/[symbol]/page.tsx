'use client';

import { Suspense, use } from 'react';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import InstrumentDetail from '@/components/globalLab/InstrumentDetail';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function GlobalLabInstrumentPage({ params }: { params: Promise<{ symbol: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <Gate params={params} />
    </Suspense>
  );
}

function Gate({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <InstrumentDetail symbol={decodeURIComponent(symbol)} />;
}
