import { Suspense } from 'react';
import { PageBreadcrumb } from '@/components/ui';
import GlobalLabAdmin from './_components/GlobalLabAdmin';

export default function Page() {
  return (
    <>
      <PageBreadcrumb
        title="Global Portföy Lab"
        description="Araştırma kataloğu, notlar, örnek sermaye piyasası varsayımları ve stres senaryoları (eğitim amaçlı; kaynak ve tarih belirtin)."
      />
      <Suspense>
        <GlobalLabAdmin />
      </Suspense>
    </>
  );
}
