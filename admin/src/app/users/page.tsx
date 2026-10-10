'use client';

import { useAdminAuth } from '@/lib/auth';
import UsersTable from '@/components/UsersTable';
import { PageBreadcrumb } from '@/components/ui';

export default function UsersPage() {
  // Yetki kapısı AdminShell'dedir; bu sayfa yalnızca yönetici oturumunda çizilir
  const { user } = useAdminAuth();
  return (
    <>
      <PageBreadcrumb title="Kullanıcılar" description="Hesapları ara, filtrele ve ayrıntılarını incele." />
      <UsersTable currentUserId={String(user?.id ?? '')} />
    </>
  );
}
