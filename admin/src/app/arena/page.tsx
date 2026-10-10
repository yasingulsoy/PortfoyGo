import { PageBreadcrumb } from '@/components/ui';
import ArenaPage from '@/components/arena/ArenaPage';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="Arena" description="Kısa süreli canlı meydan okumaları planla, takip et ve sonuçlarını incele." />
      <ArenaPage />
    </>
  );
}
