'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDownTrayIcon, ArrowsRightLeftIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { adminKeys } from '@/lib/api';
import { useDebouncedValue, usePaged } from '@/lib/hooks';
import { ASSET_TYPE_OPTIONS, assetTypeLabel, sideLabel } from '@/lib/labels';
import { downloadCsv, toCsv } from '@/lib/csv';
import type { AdminTransaction } from '@/lib/types';
import { num } from './model';
import { TableCardHeader, TableSkeleton } from './ui';
import { DateField, LoadError, Pagination, SearchInput, SelectField, StaleNotice } from './controls';
import { TransactionsTableView } from './RecordTables';

const PAGE_SIZE = 25;

type TypeFilter = 'all' | 'buy' | 'sell';
const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'buy', label: 'Alış' },
  { value: 'sell', label: 'Satış' },
];

/** İşlem listesi: arama, tür, varlık ve tarih aralığı filtreleri; sayfalı tablo ve CSV dışa aktarma. */
export default function TransactionsPage() {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get('search') ?? '');
  const [type, setType] = useState<TypeFilter>('all');
  const [assetType, setAssetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const search = useDebouncedValue(query.trim(), 350);

  const key = adminKeys.transactions({
    search,
    type: type === 'all' ? undefined : type,
    asset_type: assetType,
    from,
    to,
    limit: PAGE_SIZE,
    offset,
  });
  const { items, total, error, loading, isValidating, mutate } = usePaged<AdminTransaction>(key);
  const filtered = !!(search || type !== 'all' || assetType || from || to);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setOffset(0);
  };

  const clearFilters = () => {
    setQuery('');
    setType('all');
    setAssetType('');
    setFrom('');
    setTo('');
    setOffset(0);
  };

  const exportCsv = () => {
    const csv = toCsv(
      ['Tarih', 'Kullanıcı', 'Tür', 'Sembol', 'Ad', 'Varlık türü', 'Miktar', 'Fiyat', 'Tutar', 'Komisyon', 'Net', 'İşlem ID'],
      items.map((t) => [
        new Date(t.created_at).toISOString(),
        t.username,
        sideLabel(t.type),
        t.symbol,
        t.name ?? '',
        assetTypeLabel(t.asset_type),
        num(t.quantity),
        num(t.price),
        num(t.total_amount),
        num(t.commission),
        num(t.net_amount),
        t.id,
      ]),
    );
    const page = Math.floor(offset / PAGE_SIZE) + 1;
    downloadCsv(`islemler-${new Date().toISOString().slice(0, 10)}-s${page}.csv`, csv);
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Tüm işlemler"
        description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} ${filtered ? 'eşleşen işlem' : 'işlem'} · en yeni önce`}
        actions={
          <Button variant="secondary" icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />} onClick={exportCsv} disabled={items.length === 0}>
            Bu sayfayı CSV indir
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 border-t border-line px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted" aria-hidden="true">Ara</span>
          <SearchInput label="Kullanıcı veya sembol ara" placeholder="Kullanıcı adı veya sembol" value={query} onChange={reset(setQuery)} className="sm:w-full" />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted" aria-hidden="true">Tür</span>
          <Tabs label="İşlem türü" items={TYPE_TABS} value={type} onChange={reset(setType)} className="h-11 items-center" />
        </div>
        <SelectField label="Varlık türü" options={ASSET_TYPE_OPTIONS} value={assetType} onChange={(e) => reset(setAssetType)(e.target.value)} />
        <DateField label="Başlangıç" value={from} max={to || undefined} onChange={reset(setFrom)} />
        <DateField label="Bitiş" value={to} min={from || undefined} onChange={reset(setTo)} />
      </div>
      {filtered && (
        <div className="-mt-1 px-5 pb-3 sm:px-6">
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
            <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" /> Filtreleri temizle
          </button>
        </div>
      )}
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="İşlemler yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon /> : <ArrowsRightLeftIcon />}
          title={filtered ? 'Filtrelere uyan işlem yok' : 'Henüz işlem yok'}
          className="border-t border-line"
        />
      ) : (
        <div className={cn('transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <TransactionsTableView items={items} caption="İşlem listesi" />
        </div>
      )}

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="İşlem sayfaları" />
    </Card>
  );
}
