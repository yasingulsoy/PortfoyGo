import { PageBreadcrumb } from '@/components/ui';
import PicksAdmin from './_components/PicksAdmin';

export default function Page() {
  return (
    <>
      <PageBreadcrumb
        title="Haftalık Seçim"
        description="Kitlelerin Bilgeliği: haftalar, kazananlar ve kitle getirisi; tartışma yorumlarını ve seçim notlarını denetle."
      />
      <PicksAdmin />
    </>
  );
}
