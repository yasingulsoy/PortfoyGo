import Seasons from '@/components/Seasons';
import { PageBreadcrumb } from '@/components/ui';

export default function SeasonsPage() {
  return (
    <>
      <PageBreadcrumb title="Sezonlar" description="Aylık sezonlar, katılım ve kazananlar (salt okunur)." />
      <Seasons />
    </>
  );
}
