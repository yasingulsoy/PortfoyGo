'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import Advisor from '@/components/advisor/Advisor';

export default function AdvisorPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Portföy Sihirbazı"
        description="Risk profilini belirle; sana uygun bir varlık dağılımını, beklenen getirisini ve olası düşüşlerini gör."
        actions={<Breadcrumb items="Portföy Sihirbazı" />}
      />
      <Advisor />
    </div>
  );
}
