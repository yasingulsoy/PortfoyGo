'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { useEntitlements } from '@/hooks/useEntitlements';
import { FEATURES } from '@/lib/subscriptions';
import { LabDisclaimer } from './bits';
import ResearchTab from './ResearchTab';
import ClassifyTab from './ClassifyTab';
import ScenarioTab from './ScenarioTab';

const TAB_IDS = ['arastir', 'siniflandir', 'senaryo'] as const;
type TabId = (typeof TAB_IDS)[number];

/** /global-lab: Araştır (ücretsiz) · Sınıflandır (ücretsiz, sınırlı) · Senaryo (Premium). Sekme ?tab= ile paylaşılabilir. */
export default function GlobalLab() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { has, loading } = useEntitlements();
  const raw = params.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(raw ?? '') ? (raw as TabId) : 'arastir';

  const go = (next: TabId) => {
    const qs = new URLSearchParams(params.toString());
    if (next === 'arastir') qs.delete('tab');
    else qs.set('tab', next);
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const premium = !loading && has(FEATURES.GLOBAL_LAB_PRO);

  return (
    <div className="space-y-4 md:space-y-6">
      <Tabs<TabId>
        variant="underline"
        label="Global Portföy Lab bölümleri"
        value={tab}
        onChange={go}
        items={[
          { value: 'arastir', label: 'Araştır' },
          { value: 'siniflandir', label: 'Sınıflandır' },
          {
            value: 'senaryo',
            label: (
              <span className="inline-flex items-center gap-1.5">
                Senaryo
                {!premium && <Badge tone="brand">Premium</Badge>}
              </span>
            ),
          },
        ]}
      />
      <div role="tabpanel" aria-label={tab === 'arastir' ? 'Araştır' : tab === 'siniflandir' ? 'Sınıflandır' : 'Senaryo'}>
        {tab === 'arastir' && <ResearchTab onCompare={() => go('siniflandir')} />}
        {tab === 'siniflandir' && <ClassifyTab />}
        {tab === 'senaryo' && <ScenarioTab />}
      </div>
      <LabDisclaimer />
    </div>
  );
}
