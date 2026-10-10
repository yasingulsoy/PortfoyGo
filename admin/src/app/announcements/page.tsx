import { PageBreadcrumb } from '@/components/ui';
import Announcements from './_components/Announcements';

export default function Page() {
  return (
    <>
      <PageBreadcrumb title="Duyurular" description="Tüm kullanıcılara uygulama içi bildirim olarak duyuru gönder." />
      <Announcements />
    </>
  );
}
