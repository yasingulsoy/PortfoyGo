'use client';

import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import CreatePortfolio from '@/components/model-portfolio/CreatePortfolio';
import { useModelList } from '@/hooks/useModelPortfolios';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function NewModelPortfolioPage() {
  const { user, ready } = useRequireAuth();
  const list = useModelList();
  if (!ready || !user || (!list.data && !list.error)) return <PageLoader />;
  const count = list.data?.items.length ?? 0;
  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Yeni model portföy"
        description="100.000 USD'yi varlıklar ve nakit arasında paylaştır. Ağırlıkların toplamı %100 olmalı."
        actions={
          <Breadcrumb
            items={[
              { label: 'Panel', href: '/' },
              { label: 'Model Portföy', href: '/model-portfoy' },
              { label: 'Yeni' },
            ]}
          />
        }
      />
      <CreatePortfolio defaultName={`Model Portföy ${count + 1}`} atLimit={!!list.data && count >= list.data.limit} />
    </div>
  );
}
