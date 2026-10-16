'use client';

import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import SubscriptionPage from '@/components/subscription/SubscriptionPage';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function AbonelikPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Abonelik"
        description="Planını gör, Premium özellikleri karşılaştır ve ücretsiz denemeyi başlat."
        actions={<Breadcrumb items="Abonelik" />}
      />
      <SubscriptionPage />
    </div>
  );
}
