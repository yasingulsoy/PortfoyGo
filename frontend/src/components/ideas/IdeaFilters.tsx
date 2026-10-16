'use client';

import { FunnelIcon } from '@heroicons/react/20/solid';
import { ASSET_TYPE_LABELS, type AssetType } from '@portfoygo/shared/types';
import { SearchInput, Select } from '@/components/common/controls';
import { HORIZON_LABELS, HORIZONS, STANCE_META, STANCES } from '@/lib/ideas';
import type { IdeaHorizon, IdeaScopeFilter, IdeaStance, IdeaStatus, IdeaView } from '@/types/ideas';

export interface FilterState {
  q: string;
  asset_type: AssetType | '';
  stance: IdeaStance | '';
  horizon: IdeaHorizon | '';
  status: IdeaStatus | '';
  /** 'all' | 'public' | 'leagues' ya da 'league:<id>' */
  scope: IdeaScopeFilter | `league:${string}`;
}

export const EMPTY_FILTERS: FilterState = { q: '', asset_type: '', stance: '', horizon: '', status: '', scope: 'all' };

export const filtersActive = (f: FilterState) => !!(f.q.trim() || f.asset_type || f.stance || f.horizon || f.status || f.scope !== 'all');

/** Varlık türü, duruş, vade, durum, kapsam (herkese açık / liglerim / tek lig) ve sembol araması. */
export default function IdeaFilters({
  value,
  onChange,
  view,
  leagues,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  view: IdeaView;
  leagues: { id: string; name: string }[];
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });
  const statusLocked = view === 'review_due' || view === 'closed';
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Filtreler">
      <SearchInput
        value={value.q}
        onChange={(v) => set('q', v.slice(0, 40))}
        placeholder="Sembol ara (ör. BTC)"
        label="Sembole göre ara"
        className="col-span-2 sm:col-span-3 lg:col-span-2"
      />
      <Select
        label="Varlık türü"
        value={value.asset_type}
        onChange={(v) => set('asset_type', v)}
        icon={<FunnelIcon />}
        options={[{ value: '' as const, label: 'Tüm varlıklar' }, ...(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((k) => ({ value: k, label: ASSET_TYPE_LABELS[k] }))]}
      />
      <Select
        label="Duruş"
        value={value.stance}
        onChange={(v) => set('stance', v)}
        options={[{ value: '' as const, label: 'Tüm duruşlar' }, ...STANCES.map((s) => ({ value: s, label: `${STANCE_META[s].label} · ${STANCE_META[s].hint}` }))]}
      />
      <Select
        label="Vade"
        value={value.horizon}
        onChange={(v) => set('horizon', v)}
        options={[{ value: '' as const, label: 'Tüm vadeler' }, ...HORIZONS.map((h) => ({ value: h, label: HORIZON_LABELS[h] }))]}
      />
      {statusLocked ? (
        <Select
          label="Kapsam"
          value={value.scope}
          onChange={(v) => set('scope', v)}
          options={scopeOptions(leagues)}
        />
      ) : (
        <Select
          label="Durum"
          value={value.status}
          onChange={(v) => set('status', v)}
          options={[
            { value: '' as const, label: 'Tüm durumlar' },
            { value: 'acik' as const, label: 'Açık' },
            { value: 'kapandi' as const, label: 'Kapandı' },
          ]}
        />
      )}
      {!statusLocked && (
        <Select label="Kapsam" value={value.scope} onChange={(v) => set('scope', v)} options={scopeOptions(leagues)} className="col-span-2 sm:col-span-1" />
      )}
    </div>
  );
}

function scopeOptions(leagues: { id: string; name: string }[]): { value: FilterState['scope']; label: string }[] {
  return [
    { value: 'all', label: 'Herkese açık + liglerim' },
    { value: 'public', label: 'Herkese açık' },
    { value: 'leagues', label: 'Liglerim' },
    ...leagues.map((l) => ({ value: `league:${l.id}` as const, label: `Lig: ${l.name}` })),
  ];
}
