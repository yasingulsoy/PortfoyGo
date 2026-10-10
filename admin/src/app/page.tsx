import type { Metadata } from 'next';
import { RecentSignups, TopUsers } from '@/components/AdminStats';
import { ActivityChartCard, OverviewMetrics, RefreshOverviewButton, SystemSummaryCard } from '@/components/Overview';
import { PageBreadcrumb } from '@/components/ui';

export const metadata: Metadata = {
  // Kök segmentte şablon uygulanmaz; başlık tam yazılır
  title: { absolute: 'Genel bakış · PortfoyGo Yönetim' },
};

export default function OverviewPage() {
  return (
    <>
      <PageBreadcrumb title="Genel bakış" description="Kullanıcı, işlem ve sistem özetleri." actions={<RefreshOverviewButton />} />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12">
          <OverviewMetrics />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-8">
          <ActivityChartCard />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-4">
          <SystemSummaryCard />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-8">
          <TopUsers />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-4">
          <RecentSignups />
        </div>
      </div>
    </>
  );
}
