'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function NotificationsPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Bildirimler"
        description="Emirlerin, rekabet gelişmeleri, hesap bildirimlerin ve duyurular tek yerde."
        actions={<Breadcrumb items="Bildirimler" />}
      />
      <NotificationCenter />
    </div>
  );
}
