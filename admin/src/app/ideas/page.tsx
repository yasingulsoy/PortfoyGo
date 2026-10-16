import { PageBreadcrumb } from '@/components/ui';
import IdeasAdmin from './_components/IdeasAdmin';

export default function Page() {
  return (
    <>
      <PageBreadcrumb
        title="Ortak Akıl"
        description="Öneri Havuzu moderasyonu: şikâyet kuyruğu, önerileri / yanıtları / izleme notlarını gizleme ve yorum kaldırma. Tüm işlemler denetim kaydına yazılır."
      />
      <IdeasAdmin />
    </>
  );
}
