'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { ArrowsRightLeftIcon, BookmarkIcon as BookmarkSolid, XMarkIcon } from '@heroicons/react/20/solid';
import { BookmarkIcon, GlobeAltIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { assetRefWithLogo } from '@portfoygo/shared/assetLogos';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { SearchInput, Select } from '@/components/common/controls';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { useCompareSelection, useLabInstruments, useLabMeta, useResearchList } from '@/hooks/useGlobalLab';
import { globalLabApi, globalLabKeys, type CatalogFilters, type LabInstrument } from '@/lib/globalLab';
import { ClassBadge, Chip, QuoteText, RiskMeter } from './bits';
import { ASSET_CLASSES, CLASS_LABELS, REGIONS, RISK_RANGES, VEHICLE_LABELS, vehicleLabel } from './model';

const ALL = '';

/** Araştır: katalog + filtreler, araştırma listesi, karşılaştırmaya ekleme. */
export default function ResearchTab({ onCompare }: { onCompare: () => void }) {
  const meta = useLabMeta();
  const [q, setQ] = useState('');
  const [region, setRegion] = useState(ALL);
  const [assetClass, setAssetClass] = useState(ALL);
  const [vehicle, setVehicle] = useState(ALL);
  const [currency, setCurrency] = useState(ALL);
  const [risk, setRisk] = useState(ALL);

  const range = RISK_RANGES.find((r) => r.value === risk) ?? RISK_RANGES[0];
  const filters: CatalogFilters = {
    q: q.trim() || undefined,
    region: region || undefined,
    asset_class: assetClass || undefined,
    vehicle: vehicle || undefined,
    currency: currency || undefined,
    risk_min: range.min,
    risk_max: range.max,
  };
  const list = useLabInstruments(filters);
  const all = useLabInstruments();
  const currencies = useMemo(() => [...new Set((all.data?.items ?? []).map((i) => i.currency))].sort(), [all.data]);
  const active = [q.trim(), region, assetClass, vehicle, currency, risk].filter(Boolean).length;
  const reset = () => {
    setQ('');
    setRegion(ALL);
    setAssetClass(ALL);
    setVehicle(ALL);
    setCurrency(ALL);
    setRisk(ALL);
  };

  const items = list.data?.items ?? [];
  const loading = list.isLoading && !list.data;

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 2xl:grid-cols-3">
      <div className="min-w-0 space-y-4 md:space-y-6 2xl:col-span-2">
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SearchInput value={q} onChange={setQ} placeholder="Sembol, ad, ülke veya alt sınıf ara" label="Katalogda ara" className="sm:col-span-2 lg:col-span-3" />
            <Select
              label="Bölge"
              value={region}
              onChange={setRegion}
              options={[{ value: ALL, label: 'Tüm bölgeler' }, ...(meta.data?.regions ?? REGIONS).map((r) => ({ value: r, label: r }))]}
            />
            <Select
              label="Varlık sınıfı"
              value={assetClass}
              onChange={setAssetClass}
              options={[{ value: ALL, label: 'Tüm varlık sınıfları' }, ...ASSET_CLASSES.map((c) => ({ value: c, label: CLASS_LABELS[c] }))]}
            />
            <Select
              label="Araç türü"
              value={vehicle}
              onChange={setVehicle}
              options={[{ value: ALL, label: 'Tüm araç türleri' }, ...Object.entries(VEHICLE_LABELS).map(([value, label]) => ({ value, label }))]}
            />
            <Select label="Para birimi" value={currency} onChange={setCurrency} options={[{ value: ALL, label: 'Tüm para birimleri' }, ...currencies.map((c) => ({ value: c, label: c }))]} />
            <Select label="Risk seviyesi" value={risk} onChange={setRisk} options={RISK_RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="num text-sm text-muted" aria-live="polite">
                {loading ? 'Yükleniyor…' : `${items.length} araç`}
              </p>
              <Button variant="ghost" size="sm" onClick={reset} disabled={active === 0}>
                Filtreleri temizle
              </Button>
            </div>
          </div>
        </Card>

        <CatalogTable items={items} loading={loading} error={list.error} onRetry={() => void list.mutate()} onCompare={onCompare} />
      </div>

      <ResearchListCard />
    </div>
  );
}

function useListToggle() {
  const research = useResearchList();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const ids = useMemo(() => new Set((research.data?.items ?? []).map((i) => i.id)), [research.data]);
  const toggle = async (item: LabInstrument) => {
    setBusy(item.id);
    try {
      if (ids.has(item.id)) {
        await globalLabApi.removeFromList(item.id);
        toast.info(`${item.symbol} araştırma listesinden çıkarıldı`);
      } else {
        await globalLabApi.addToList(item.id);
        toast.success(`${item.symbol} araştırma listesine eklendi`);
      }
      await Promise.all([research.mutate(), mutate(globalLabKeys.instrument(item.symbol))]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(null);
    }
  };
  return { ids, toggle, busy, research };
}

function CatalogTable({
  items,
  loading,
  error,
  onRetry,
  onCompare,
}: {
  items: LabInstrument[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onCompare: () => void;
}) {
  const { ids: listed, toggle, busy } = useListToggle();
  const compare = useCompareSelection();
  const toast = useToast();

  const toggleCompare = (item: LabInstrument) => {
    const r = compare.toggle(item.id);
    if (r === 'full') toast.info('En fazla 4 araç karşılaştırılabilir', { description: 'Sınıflandır sekmesinden bir aracı çıkarıp yenisini ekleyebilirsin.' });
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Küresel araç kataloğu"
        description="Ülke, bölge ve sınıf alternatifleri"
        icon={<GlobeAltIcon />}
        action={
          compare.ids.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={onCompare} icon={<ArrowsRightLeftIcon className="h-4 w-4" aria-hidden="true" />}>
              Karşılaştır ({compare.ids.length})
            </Button>
          ) : undefined
        }
      />
      {error && !items.length ? (
        <div className="px-5 pb-5 sm:px-6">
          <Alert tone="error">
            Katalog yüklenemedi.{' '}
            <button type="button" onClick={onRetry} className="font-medium underline">
              Tekrar dene
            </button>
          </Alert>
        </div>
      ) : loading ? (
        <div className="space-y-2 px-5 pb-5 sm:px-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<MagnifyingGlassIcon />} title="Bu filtrelere uyan araç yok" description="Filtreleri gevşetmeyi ya da farklı bir arama yapmayı dene." />
      ) : (
        <DataTable label="Küresel araç kataloğu" className="relative pb-3">
          <THead>
            <Th>Araç</Th>
            <Th className="hidden md:table-cell">Sınıf · bölge</Th>
            <Th className="hidden lg:table-cell">Risk</Th>
            <Th align="right" className="hidden sm:table-cell">
              Gider
            </Th>
            <Th align="right">Fiyat</Th>
            <Th align="right">
              <span className="sr-only">İşlemler</span>
            </Th>
          </THead>
          <TBody>
            {items.map((i) => {
              const inList = listed.has(i.id);
              const inCompare = compare.ids.includes(i.id);
              // Uygulamadaki bir varlığa bağlı araçlar (ör. commodity:GOLD) o varlığın logosunu gösterir
              const logo = assetRefWithLogo(i.provider_symbol);
              return (
                <Tr key={i.id}>
                  <Td className="max-w-[16rem] sm:max-w-none">
                    <Link href={`/global-lab/${encodeURIComponent(i.symbol)}`} className="group block min-w-0">
                      <span className="flex items-center gap-2">
                        {logo && <AssetAvatar symbol={logo.symbol} type={logo.type} size={20} />}
                        <span className="num font-semibold text-fg group-hover:text-brand">{i.symbol}</span>
                        <Chip>{vehicleLabel(i.vehicle)}</Chip>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{i.name}</span>
                    </Link>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1 md:hidden">
                      <ClassBadge assetClass={i.asset_class} />
                      <Chip>{i.region}</Chip>
                      <Chip>{i.currency}</Chip>
                      <RiskMeter level={i.risk_level} className="ml-1 lg:hidden" />
                    </span>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="flex flex-wrap items-center gap-1">
                      <ClassBadge assetClass={i.asset_class} />
                      <Chip>{i.region}</Chip>
                      <Chip>{i.currency}</Chip>
                    </span>
                    {i.sub_class && <span className="mt-1 block truncate text-xs text-subtle">{i.sub_class}</span>}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <RiskMeter level={i.risk_level} />
                  </Td>
                  <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
                    {i.expense_ratio_pct === null ? '—' : `%${i.expense_ratio_pct.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}`}
                  </Td>
                  <Td align="right">
                    <QuoteText quote={i.quote} />
                  </Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void toggle(i)}
                        disabled={busy === i.id}
                        aria-pressed={inList}
                        aria-label={inList ? `${i.symbol}: araştırma listesinden çıkar` : `${i.symbol}: araştırma listesine ekle`}
                        title={inList ? 'Araştırma listesinden çıkar' : 'Araştırma listesine ekle'}
                        className={cn(
                          'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-3 disabled:opacity-50',
                          inList ? 'text-brand' : 'text-subtle hover:text-fg',
                        )}
                      >
                        {inList ? <BookmarkSolid className="h-4 w-4" aria-hidden="true" /> : <BookmarkIcon className="h-4 w-4" aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCompare(i)}
                        aria-pressed={inCompare}
                        aria-label={inCompare ? `${i.symbol}: karşılaştırmadan çıkar` : `${i.symbol}: karşılaştırmaya ekle`}
                        title={inCompare ? 'Karşılaştırmadan çıkar' : 'Karşılaştırmaya ekle'}
                        className={cn(
                          'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-3',
                          inCompare ? 'bg-brand-soft text-brand' : 'text-subtle hover:text-fg',
                        )}
                      >
                        <ArrowsRightLeftIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </Card>
  );
}

function ResearchListCard() {
  const { toggle, busy, research } = useListToggle();
  const items = research.data?.items ?? [];
  return (
    <Card className="order-first h-fit min-w-0 overflow-hidden 2xl:order-last">
      <CardHeader title="Araştırma listem" description={`${items.length} / ${research.data?.limit ?? 50} araç`} icon={<BookmarkIcon />} />
      {research.isLoading && !research.data ? (
        <div className="space-y-2 px-5 pb-5 sm:px-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-muted sm:px-6">
          Listen boş. Katalogdaki yer imi düğmesiyle izlemek istediğin araçları buraya ekle.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <Link href={`/global-lab/${encodeURIComponent(i.symbol)}`} className="min-w-0 flex-1 group">
                <span className="num block font-semibold text-fg group-hover:text-brand">{i.symbol}</span>
                <span className="block truncate text-xs text-muted">{i.name}</span>
              </Link>
              <QuoteText quote={i.quote} />
              <button
                type="button"
                onClick={() => void toggle(i)}
                disabled={busy === i.id}
                aria-label={`${i.symbol}: listeden çıkar`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-50"
              >
                <XMarkIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
