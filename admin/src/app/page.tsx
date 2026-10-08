'use client';

import { useRequireAdmin } from '@/lib/auth';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import AdminStats, { RetryStatsButton, TopUsers } from '@/components/AdminStats';
import UsersTable from '@/components/UsersTable';
import CacheActions from '@/components/CacheActions';

export default function AdminPage() {
  // Yetki kapısı AdminShell'dedir; burada yalnızca kullanıcı bilgisi okunur
  const { user, ready } = useRequireAdmin();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Genel bakış"
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
