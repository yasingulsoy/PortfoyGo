import OrdersPage from '@/components/OrdersPage';
import { PageBreadcrumb } from '@/components/ui';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="Emirler" description="Bekleyen ve geçmiş limit / stop emirleri; gerektiğinde iptal et." />
      <OrdersPage />
    </>
  );
}
