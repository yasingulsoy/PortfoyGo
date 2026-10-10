'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { ClockIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { adminKeys } from '@/lib/api';
import { useDebouncedValue, usePaged } from '@/lib/hooks';
import type { AdminOrder } from '@/lib/types';
import { num } from './model';
import { useMetrics } from './Overview';
import { TableCardHeader, TableSkeleton } from './ui';
import { LoadError, Pagination, SearchInput, SelectField, StaleNotice } from './controls';
import { OrdersTableView, useCancelOrder } from './RecordTables';

const PAGE_SIZE = 25;

type StatusFilter = 'active' | 'filled' | 'cancelled' | 'expired' | 'failed' | 'all';

const TYPE_OPTIONS = [
  { value: '', label: 'Tüm emir türleri' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop_loss', label: 'Zarar durdur' },
  { value: 'take_profit', label: 'Kâr al' },
];

const EMPTY_TITLE: Record<StatusFilter, string> = {
  active: 'Bekleyen emir yok',
  filled: 'Gerçekleşen emir yok',
  cancelled: 'İptal edilen emir yok',
  expired: 'Süresi dolan emir yok',
  failed: 'Başarısız emir yok',
  all: 'Henüz emir yok',
};

export default function OrdersPage() {
  const [status, setStatus] = useState<StatusFilter>('active');
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const search = useDebouncedValue(query.trim(), 350);
  const metrics = useMetrics();
  const { mutate: mutateKey } = useSWRConfig();

  const key = adminKeys.orders({ status, type, search, limit: PAGE_SIZE, offset });
  const { items, total, error, loading, isValidating, mutate } = usePaged<AdminOrder>(key);
  const cancel = useCancelOrder(() => {
    void mutate();
    void metrics.mutate();
    // Kullanıcı detay önbelleklerini de tazele
    void mutateKey((k) => typeof k === 'string' && k.startsWith('/admin/users/'));
  });

  const activeCount = metrics.data ? num(metrics.data.totals.active_orders) : undefined;
  const tabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: 'active', label: 'Bekleyen', count: activeCount },
    { value: 'filled', label: 'Gerçekleşen' },
    { value: 'cancelled', label: 'İptal' },
    { value: 'expired', label: 'Süresi dolan' },
    { value: 'failed', label: 'Başarısız' },
    { value: 'all', label: 'Tümü' },
  ];
  const filtered = !!(search || type);

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Limit ve stop emirleri"
        description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} emir · en yeni önce`}
        actions={
          <>
            <SelectField
              label="Emir türü"
              hideLabel
              options={TYPE_OPTIONS}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setOffset(0);
              }}
              className="w-full sm:w-48"
            />
            <SearchInput
              label="Kullanıcı veya sembol ara"
              placeholder="Kullanıcı adı veya sembol"
              value={query}
              onChange={(v) => {
                setQuery(v);
                setOffset(0);
              }}
              className="sm:w-64"
            />
          </>
        }
      />
      <div className="px-5 pb-4 sm:px-6">
        <Tabs
          label="Emir durumu"
          items={tabs}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
          className="w-fit max-w-full"
        />
      </div>
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Emirler yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={filtered ? <MagnifyingGlassIcon /> : <ClockIcon />}
          title={filtered ? 'Filtrelere uyan emir yok' : EMPTY_TITLE[status]}
          className="border-t border-line"
        />
      ) : (
        <div className={cn('transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <OrdersTableView items={items} caption="Emir listesi" onCancel={cancel.open} />
        </div>
      )}

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="Emir sayfaları" />
      {cancel.modal}
    </Card>
  );
}
