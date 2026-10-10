import AuditPage from '@/components/AuditPage';
import { PageBreadcrumb } from '@/components/ui';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="Denetim kaydı" description="Yöneticilerin yaptığı tüm değişikliklerin kaydı." />
      <AuditPage />
    </>
  );
}
