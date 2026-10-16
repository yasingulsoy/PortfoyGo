'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlusIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { ArrowsRightLeftIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useCompareSelection, useLabInstruments } from '@/hooks/useGlobalLab';
import type { LabInstrument } from '@/lib/globalLab';
import { ClassBadge, RiskMeter } from './bits';
import { ASSET_CLASSES, CLASS_LABELS, REGIONS, buildMatrix, cellKey, classColor, compareRows, emptyCells } from './model';

const MAX = 4;

/** Sınıflandır: en fazla 4 aracı yan yana karşılaştır + bölge × varlık sınıfı matrisi. */
export default function ClassifyTab() {
  const all = useLabInstruments();
  const compare = useCompareSelection(MAX);
  const toast = useToast();
  const items = all.data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const selected = compare.ids.map((id) => byId.get(id)).filter((x): x is LabInstrument => !!x);

  const toggle = (id: string) => {
    if (compare.toggle(id) === 'full') toast.info(`En fazla ${MAX} araç karşılaştırılabilir`);
  };

  if (all.isLoading && !all.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (all.error && !all.data) return <Alert tone="error">Katalog yüklenemedi. Sayfayı yenileyip tekrar dene.</Alert>;

  return (
    <div className="space-y-4 md:space-y-6">
      <ComparePanel items={items} selected={selected} onToggle={toggle} onClear={compare.clear} />
      <MatrixPanel items={items} selectedIds={compare.ids} onToggle={toggle} />
    </div>
  );
}

function ComparePanel({ items, selected, onToggle, onClear }: { items: LabInstrument[]; selected: LabInstrument[]; onToggle: (id: string) => void; onClear: () => void }) {
  const [pick, setPick] = useState('');
  const rows = compareRows(selected);
  const grouped = useMemo(() => ASSET_CLASSES.map((c) => ({ c, list: items.filter((i) => i.asset_class === c) })).filter((g) => g.list.length > 0), [items]);
  const full = selected.length >= MAX;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Alternatifleri karşılaştır"
        description={`En fazla ${MAX} aracı yan yana incele`}
        icon={<ArrowsRightLeftIcon />}
        action={
          selected.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Temizle
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-end sm:px-6">
        <label className="block min-w-0 flex-1">
          <span className="mb-1.5 block text-xs font-medium text-muted">Araç ekle</span>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={full}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10 disabled:opacity-60"
          >
            <option value="">{full ? `En fazla ${MAX} araç seçildi` : 'Katalogdan seç…'}</option>
            {grouped.map((g) => (
              <optgroup key={g.c} label={CLASS_LABELS[g.c]}>
                {g.list.map((i) => (
                  <option key={i.id} value={i.id} disabled={selected.some((s) => s.id === i.id)}>
                    {i.symbol} — {i.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={!pick || full}
          onClick={() => {
            if (pick) onToggle(pick);
            setPick('');
          }}
          icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
          className="h-10"
        >
          Ekle
        </Button>
      </div>

      {selected.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={<ArrowsRightLeftIcon />}
          title="Karşılaştırma için araç seç"
          description="Yukarıdan, katalogdaki ⇄ düğmesinden ya da aşağıdaki matristen araç ekle."
        />
      ) : (
        <div className="relative max-w-full overflow-x-auto border-t border-line">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Seçili araçların karşılaştırması</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sticky left-0 z-10 w-40 bg-surface px-5 py-3 text-left text-xs font-medium text-muted sm:px-6">
                  Özellik
                </th>
                {selected.map((s) => (
                  <th key={s.id} scope="col" className="px-3 py-3 text-left align-top">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/global-lab/${encodeURIComponent(s.symbol)}`} className="min-w-0 group">
                        <span className="num block font-semibold text-fg group-hover:text-brand">{s.symbol}</span>
                        <span className="block max-w-[12rem] truncate text-xs font-normal text-muted">{s.name}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => onToggle(s.id)}
                        aria-label={`${s.symbol}: karşılaştırmadan çıkar`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg"
                      >
                        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-2.5 text-left text-xs font-medium text-muted sm:px-6">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={selected[i].id} className={cn('px-3 py-2.5', r.same ? 'text-muted' : 'font-medium text-fg')}>
                      {r.label === 'Risk seviyesi' ? <RiskMeter level={selected[i].risk_level} /> : r.label === 'Varlık sınıfı' ? <ClassBadge assetClass={selected[i].asset_class} /> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-subtle sm:px-6">Farklı olan değerler koyu yazılır. Getiri ve oynaklık varsayımları için Senaryo sekmesine bak.</p>
        </div>
      )}
    </Card>
  );
}

function MatrixPanel({ items, selectedIds, onToggle }: { items: LabInstrument[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  const matrix = useMemo(() => buildMatrix(items), [items]);
  const gaps = emptyCells(matrix);
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title="Sınıflandırma matrisi" description="Bölge × varlık sınıfı: hangi hücreyi hangi araçlar dolduruyor?" icon={<Squares2X2Icon />} />
      <p className="px-5 pb-3 text-sm text-muted sm:px-6">
        {items.length} araç {REGIONS.length * ASSET_CLASSES.length - gaps} hücreye dağılıyor; {gaps} hücrede katalogda henüz alternatif yok. Bir sembole dokunarak
        karşılaştırmaya ekleyebilirsin.
      </p>
      <div className="relative max-w-full overflow-x-auto border-t border-line">
        <table className="w-full min-w-[48rem] table-fixed text-sm">
          <caption className="sr-only">Bölge ve varlık sınıfına göre araç matrisi</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 w-36 bg-surface px-5 py-3 text-left text-xs font-medium text-muted sm:px-6">
                Bölge
              </th>
              {ASSET_CLASSES.map((c) => (
                <th key={c} scope="col" className="px-2 py-3 text-left text-xs font-medium text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: classColor(c) }} aria-hidden="true" />
                    {CLASS_LABELS[c]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {REGIONS.map((r) => (
              <tr key={r}>
                <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-3 text-left align-top text-xs font-medium text-fg sm:px-6">
                  {r}
                </th>
                {ASSET_CLASSES.map((c) => {
                  const list = matrix.get(cellKey(c, r)) ?? [];
                  return (
                    <td key={c} className={cn('px-2 py-2.5 align-top', list.length === 0 && 'bg-surface-2')}>
                      {list.length === 0 ? (
                        <span className="text-xs text-subtle" aria-label="Alternatif yok">
                          —
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {list.map((i) => {
                            const on = selectedIds.includes(i.id);
                            return (
                              <button
                                key={i.id}
                                type="button"
                                onClick={() => onToggle(i.id)}
                                aria-pressed={on}
                                title={`${i.name} (${on ? 'karşılaştırmadan çıkar' : 'karşılaştırmaya ekle'})`}
                                className={cn(
                                  'num rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                                  on ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg',
                                )}
                              >
                                {i.symbol}
                              </button>
                            );
                          })}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
