'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import Breadcrumb from '@/components/common/Breadcrumb';
import GlobalLab from '@/components/globalLab/GlobalLab';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { statusSummary } from '@/lib/subscriptions';

export default function GlobalLabPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Global Portföy Lab"
        description="Farklı ülke ve piyasalardaki yatırım araçlarını araştır, alternatifleri sınıflandır ve küresel portföy senaryolarını değerlendir."
        actions={
          <>
            <PlanChip />
            <Breadcrumb items="Global Portföy Lab" />
          </>
        }
      />
      {/* useSearchParams askıya alınabilir; sınır burada. */}
      <Suspense fallback={<PageLoader />}>
        <GlobalLab />
      </Suspense>
    </div>
  );
}

function PlanChip() {
  const { state, loading } = useEntitlements();
  if (loading || !state) return null;
  return (
    <Link href="/abonelik" className="rounded-full transition-opacity hover:opacity-80" aria-label={`Abonelik: ${statusSummary(state)}`}>
      <Badge tone={state.status === 'free' ? 'neutral' : 'brand'}>{statusSummary(state)}</Badge>
    </Link>
  );
}
