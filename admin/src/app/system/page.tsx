import SystemStatus from '@/components/system/SystemStatus';
import { PageBreadcrumb } from '@/components/ui';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="Sistem durumu" description="Sunucu, veritabanı, veri kaynakları ve zamanlanmış işler." />
      <SystemStatus />
    </>
  );
}
