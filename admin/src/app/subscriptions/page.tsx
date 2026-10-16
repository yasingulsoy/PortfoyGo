import { Suspense } from 'react';
import { PageBreadcrumb } from '@/components/ui';
import SubscriptionsAdmin from './_components/SubscriptionsAdmin';

export default function Page() {
  return (
    <>
      <PageBreadcrumb
        title="Abonelikler"
        description="Premium denemeleri ve yönetici tanımları: ara, filtrele, tanımla, uzat veya sonlandır (ödeme altyapısı yok)."
      />
      <Suspense>
        <SubscriptionsAdmin />
      </Suspense>
    </>
  );
}
