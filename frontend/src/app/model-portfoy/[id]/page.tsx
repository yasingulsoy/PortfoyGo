'use client';

import { Suspense, use } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import PortfolioDetail from '@/components/model-portfolio/PortfolioDetail';
import { useModelDetail } from '@/hooks/useModelPortfolios';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function ModelPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Gate params={params} />
    </Suspense>
  );
}

function Gate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useRequireAuth();
  const { data, error } = useModelDetail(ready ? id : null);
  if (!ready || !user) return <PageLoader />;
  if (error) {
    return (
      <Card>
        <EmptyState
          title="Model portföy bulunamadı"
          description="Silinmiş olabilir ya da sana ait değil."
          action={
            <LinkButton href="/model-portfoy" variant="secondary" icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />}>
              Model portföylere dön
            </LinkButton>
          }
        />
      </Card>
    );
  }
  if (!data) return <PageLoader />;
  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title={data.portfolio.name}
        description="Varsayımsal 100.000 USD model portföy · dağılım, katkı, risk ve işlemler"
        actions={
          <Breadcrumb
            items={[
              { label: 'Panel', href: '/' },
              { label: 'Model Portföy', href: '/model-portfoy' },
              { label: data.portfolio.name },
            ]}
          />
        }
      />
      <PortfolioDetail portfolio={data.portfolio} valuation={data.valuation} />
    </div>
  );
}
