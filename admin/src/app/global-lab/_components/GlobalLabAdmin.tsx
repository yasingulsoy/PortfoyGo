'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Tabs from '@portfoygo/shared/ui/Tabs';
import CatalogAdmin from './CatalogAdmin';
import NotesAdmin from './NotesAdmin';
import AssumptionsAdmin from './AssumptionsAdmin';
import StressAdmin from './StressAdmin';

const TABS = ['katalog', 'notlar', 'varsayimlar', 'stres'] as const;
type Tab = (typeof TABS)[number];

/** Global Portföy Lab yönetimi: katalog, araştırma notları, varsayımlar (örnek) ve stres senaryoları. Sekme ?tab= ile paylaşılabilir. */
export default function GlobalLabAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'katalog';
  const go = (t: Tab) => router.replace(t === 'katalog' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <div className="space-y-6">
      <Tabs<Tab>
        variant="underline"
        label="Global Portföy Lab yönetimi"
        value={tab}
        onChange={go}
        items={[
          { value: 'katalog', label: 'Katalog' },
          { value: 'notlar', label: 'Araştırma notları' },
          { value: 'varsayimlar', label: 'Varsayımlar' },
          { value: 'stres', label: 'Stres senaryoları' },
        ]}
      />
      {tab === 'katalog' && <CatalogAdmin />}
      {tab === 'notlar' && <NotesAdmin />}
      {tab === 'varsayimlar' && <AssumptionsAdmin />}
      {tab === 'stres' && <StressAdmin />}
    </div>
  );
}
