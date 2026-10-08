'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import PageHeader from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import AdminStats, { RetryStatsButton, TopUsers } from '@/components/admin/AdminStats';
import UsersTable from '@/components/admin/UsersTable';
import CacheActions from '@/components/admin/CacheActions';

export default function AdminPage() {
  const { user, ready } = useRequireAuth({ adminOnly: true });
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Yönetim"
        title="Yönetici paneli"
        description="Kullanıcıları yönet, genel istatistikleri izle ve piyasa önbelleğini yenile."
        actions={<RetryStatsButton />}
      />

      <AdminStats />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0">
          <UsersTable currentUserId={String(user.id)} />
        </div>
        <div className="space-y-6">
          <CacheActions />
          <TopUsers />
        </div>
      </div>
    </div>
  );
}
