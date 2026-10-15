import { PageBreadcrumb } from '@/components/ui';
import ScenariosAdmin from './_components/ScenariosAdmin';

export default function Page() {
  return (
    <>
      <PageBreadcrumb
        title="Senaryolar"
        description="Lisanslı tarihsel serileri yükle, olayları arena turu olarak yeniden oynatılacak senaryolara dönüştür."
        crumbs={[{ href: '/arena', label: 'Arena' }]}
      />
      <ScenariosAdmin />
    </>
  );
}
