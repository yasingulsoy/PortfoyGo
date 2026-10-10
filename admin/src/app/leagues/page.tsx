import LeaguesPage from '@/components/LeaguesPage';
import { PageBreadcrumb } from '@/components/ui';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="Ligler" description="Kullanıcıların kurduğu özel ligler; uygunsuz ligleri sil." />
      <LeaguesPage />
    </>
  );
}
