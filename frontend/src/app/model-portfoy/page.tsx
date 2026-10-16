'use client';

import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import ModelPortfolioList from '@/components/model-portfolio/ModelPortfolioList';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function ModelPortfoliosPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Model Portföy"
        description="100.000 USD'lik varsayımsal portföyler: getiri beklentisi, risk ve çeşitlendirme arasındaki ilişkiyi uygulamalı keşfet."
        actions={<Breadcrumb items="Model Portföy" />}
      />
      <ModelPortfolioList />
    </div>
  );
}
