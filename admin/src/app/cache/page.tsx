import CacheActions, { CacheStatusCards } from '@/components/CacheActions';
import { PageBreadcrumb } from '@/components/ui';

export default function CachePage() {
  return (
    <>
      <PageBreadcrumb
        title="Piyasa önbelleği"
        description="Fiyat önbelleğinin durumu ve elle yenileme işlemleri."
        crumbs={[{ href: '/system', label: 'Sistem durumu' }]}
      />
      <div className="space-y-4 md:space-y-6">
        <CacheStatusCards />
        <CacheActions />
      </div>
    </>
  );
}
