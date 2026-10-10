import { Suspense } from 'react';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import TransactionsPage from '@/components/TransactionsPage';
import { PageBreadcrumb } from '@/components/ui';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="İşlemler" description="Tüm kullanıcıların alım satım işlemleri." />
      {/* useSearchParams (?search=) istemci tarafında okunur */}
      <Suspense fallback={<PageLoader />}>
        <TransactionsPage />
      </Suspense>
    </>
  );
}
