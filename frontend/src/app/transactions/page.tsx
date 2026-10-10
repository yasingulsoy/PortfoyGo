'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowsUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { ArrowsRightLeftIcon, ArrowTrendingDownIcon, ArrowTrendingUpIcon, ClockIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePortfolio } from '@/context/PortfolioContext';
import { cn, formatNumber, formatQuantity, formatTRY } from '@portfoygo/shared/format';
import { ASSET_TYPE_LABELS, type AssetType, type Transaction } from '@/types';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Breadcrumb from '@/components/common/Breadcrumb';
import MetricCard, { MetricGrid } from '@/components/common/MetricCard';
import Pagination from '@/components/common/Pagination';
import { SearchInput, Select, ToolbarButton } from '@/components/common/controls';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { assetHref } from '@/components/market/MarketTable';

type TypeFilter = 'all' | 'buy' | 'sell';
type AssetFilter = 'all' | AssetType;
type SortKey = 'newest' | 'oldest' | 'amount';

const PAGE_SIZE = 20;

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'En yeni' },
  { value: 'oldest', label: 'En eski' },
  { value: 'amount', label: 'Tutar (yüksekten düşüğe)' },
];

export default function TransactionsPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <Transactions />;
}

function Transactions() {
  const { transactions, loaded, refresh } = usePortfolio();
  const [type, setType] = useState<TypeFilter>('all');
  const [asset, setAsset] = useState<AssetFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // Filtre değiştiğinde sayfalama başa döner (effect yerine olay işleyicilerinde)
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const stats = useMemo(() => {
    let buy = 0;
    let sell = 0;
    let commission = 0;
    let buyCount = 0;
    for (const t of transactions) {
      if (t.type === 'buy') {
        buy += t.totalAmount;
        buyCount += 1;
      } else sell += t.totalAmount;
      commission += t.commission;
    }
    return { buy, sell, commission, buyCount, sellCount: transactions.length - buyCount };
  }, [transactions]);

  const assetTypes = useMemo(() => {
    const set = new Set<AssetType>();
    for (const t of transactions) set.add(t.assetType);
    return (Object.keys(ASSET_TYPE_LABELS) as AssetType[]).filter((k) => set.has(k));
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    const list = transactions.filter(
      (t) =>
        (type === 'all' || t.type === type) &&
        (asset === 'all' || t.assetType === asset) &&
        (!q || t.symbol.toLocaleLowerCase('tr').includes(q) || t.name.toLocaleLowerCase('tr').includes(q)),
    );
    const time = (t: Transaction) => new Date(t.createdAt).getTime() || 0;
    if (sort === 'newest') list.sort((a, b) => time(b) - time(a));
    else if (sort === 'oldest') list.sort((a, b) => time(a) - time(b));
    else list.sort((a, b) => b.netAmount - a.netAmount);
    return list;
  }, [transactions, type, asset, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Veri azalırsa (yenileme) geçerli sayfayı sınırla — state'i effect ile düzeltmek yerine türet
  const current = Math.min(page, pageCount);
  const shown = useMemo(() => filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), [filtered, current]);
  const hasFilters = type !== 'all' || asset !== 'all' || query.trim() !== '';
  const from = filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const to = (current - 1) * PAGE_SIZE + shown.length;

  const resetFilters = () => {
    setType('all');
    setAsset('all');
    setQuery('');
    setPage(1);
  };

  const reload = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const assetOptions: { value: AssetFilter; label: string }[] = [
    { value: 'all', label: 'Tüm varlıklar' },
    ...assetTypes.map((k) => ({ value: k, label: ASSET_TYPE_LABELS[k] })),
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader title="İşlem geçmişi" description="Tüm alım ve satımların; komisyon ve net tutarlarıyla birlikte." actions={<Breadcrumb items="İşlemler" />} />

      <MetricGrid>
        <MetricCard
          icon={<ArrowsRightLeftIcon />}
          label="Toplam işlem"
          loading={!loaded}
          value={formatNumber(transactions.length, 0)}
          sub={`${formatNumber(stats.buyCount, 0)} alış · ${formatNumber(stats.sellCount, 0)} satış`}
        />
        <MetricCard icon={<ArrowTrendingUpIcon />} tone="up" label="Toplam alım hacmi" loading={!loaded} value={formatTRY(stats.buy)} sub="Komisyon hariç" />
        <MetricCard icon={<ArrowTrendingDownIcon />} tone="down" label="Toplam satım hacmi" loading={!loaded} value={formatTRY(stats.sell)} sub="Komisyon hariç" />
        <MetricCard icon={<ReceiptPercentIcon />} label="Ödenen komisyon" loading={!loaded} value={formatTRY(stats.commission)} sub="Tüm işlemlerde" />
      </MetricGrid>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-fg">Tüm işlemler</h2>
            <p className="mt-1 text-sm text-muted">
              {loaded ? (hasFilters ? `${formatNumber(filtered.length, 0)} / ${formatNumber(transactions.length, 0)} işlem eşleşti` : `${formatNumber(transactions.length, 0)} işlem`) : 'Yükleniyor'}
            </p>
          </div>
          <div className="flex gap-3">
            <ToolbarButton iconOnly onClick={() => void reload()} loading={refreshing} aria-label="İşlemleri yenile" title="Yenile" icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} />
            <ToolbarButton
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}
              aria-label={`${filtered.length} işlemi CSV olarak indir`}
              className="flex-1 sm:flex-none"
            >
              CSV indir
            </ToolbarButton>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
          <Tabs<TypeFilter>
            label="İşlem türü"
            value={type}
            onChange={withReset(setType)}
            items={[
              { value: 'all', label: 'Tümü', count: transactions.length },
              { value: 'buy', label: 'Alış', count: stats.buyCount },
              { value: 'sell', label: 'Satış', count: stats.sellCount },
            ]}
            className="max-w-full self-start"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem] xl:w-[38rem]">
            <SearchInput label="Sembol veya isim ara" placeholder="Sembol veya isim ara" value={query} onChange={withReset(setQuery)} className="col-span-2 sm:col-span-1" />
            <Select label="Varlık türü" value={asset} onChange={withReset(setAsset)} options={assetOptions} />
            <Select label="Sıralama" value={sort} onChange={withReset(setSort)} options={SORTS} icon={<ArrowsUpDownIcon />} />
          </div>
        </div>

        {!loaded ? (
          <div className="divide-y divide-line border-t border-line px-5 sm:px-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            className="border-t border-line"
            icon={<ClockIcon />}
            title="Henüz işlem yapmadın"
            description="İlk alımını yaptığında tüm işlemlerin burada tarih sırasıyla listelenir."
            action={
              <LinkButton href="/" icon={<MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />}>
                Piyasalara göz at
              </LinkButton>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            className="border-t border-line"
            icon={<MagnifyingGlassIcon />}
            title="Eşleşen işlem bulunamadı"
            description={query.trim() ? `“${query.trim()}” için seçili filtrelerde sonuç yok.` : 'Seçili filtrelerde işlem yok.'}
            action={
              hasFilters && (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Filtreleri temizle
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Küçük ekranlar: yığılmış satırlar */}
            <ul className="divide-y divide-line border-y border-line md:hidden">
              {shown.map((t) => (
                <TxListRow key={t.id} t={t} />
              ))}
            </ul>

            {/* md ve üzeri: tablo */}
            <DataTable label="İşlem geçmişi" className="hidden md:block">
              <THead>
                <Th>Tarih</Th>
                <Th>Varlık</Th>
                <Th>İşlem</Th>
                <Th align="right">Miktar</Th>
                <Th align="right" className="hidden lg:table-cell">
                  Birim fiyat
                </Th>
                <Th align="right" className="hidden xl:table-cell">
                  Komisyon
                </Th>
                <Th align="right">Net tutar</Th>
              </THead>
              <TBody className="border-b border-line">
                {shown.map((t) => (
                  <TxTableRow key={t.id} t={t} />
                ))}
              </TBody>
            </DataTable>

            <div className="space-y-3 px-5 py-4 sm:px-6">
              <Pagination page={current} pageCount={pageCount} onChange={setPage} label="İşlem sayfaları" />
              <p className="num text-center text-xs text-muted">
                <span className="font-medium text-fg">
                  {formatNumber(from, 0)}–{formatNumber(to, 0)}
                </span>{' '}
                / {formatNumber(filtered.length, 0)} işlem gösteriliyor
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function txTime(t: Transaction) {
  const d = new Date(t.createdAt);
  if (Number.isNaN(d.getTime())) return { date: 'Tarih yok', time: '—' };
  return {
    date: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function TypeBadge({ buy }: { buy: boolean }) {
  return <Badge tone={buy ? 'up' : 'down'}>{buy ? 'Alış' : 'Satış'}</Badge>;
}

function NetAmount({ t, className }: { t: Transaction; className?: string }) {
  const buy = t.type === 'buy';
  return (
    <span className={cn('num whitespace-nowrap font-semibold', buy ? 'text-fg' : 'text-up', className)}>
      <span className="sr-only">{buy ? 'Ödenen' : 'Hesaba geçen'}: </span>
      {buy ? '−' : '+'}
      {formatTRY(t.netAmount)}
    </span>
  );
}

function TxTableRow({ t }: { t: Transaction }) {
  const buy = t.type === 'buy';
  const { date, time } = txTime(t);
  return (
    <Tr className="hover:bg-surface-2">
      <Td className="whitespace-nowrap">
        <p className="num text-fg">{date}</p>
        <p className="num mt-0.5 text-xs text-muted">{time}</p>
      </Td>
      <Td>
        <Link href={assetHref({ type: t.assetType, symbol: t.symbol })} className="group flex min-w-0 items-center gap-3">
          <AssetAvatar symbol={t.symbol} type={t.assetType} size={36} />
          <span className="min-w-0">
            <span className="block font-medium text-fg group-hover:text-brand">{t.symbol}</span>
            <span className="mt-0.5 block max-w-[12rem] truncate text-xs text-muted xl:max-w-[16rem]">
              {t.name} · {ASSET_TYPE_LABELS[t.assetType]}
            </span>
          </span>
        </Link>
      </Td>
      <Td>
        <TypeBadge buy={buy} />
      </Td>
      <Td align="right" className="num whitespace-nowrap text-fg">
        {formatQuantity(t.quantity)}
        <p className="mt-0.5 text-xs text-muted lg:hidden">× {formatTRY(t.price, { precise: true })}</p>
      </Td>
      <Td align="right" className="num hidden whitespace-nowrap text-fg lg:table-cell">
        {formatTRY(t.price, { precise: true })}
      </Td>
      <Td align="right" className="num hidden whitespace-nowrap text-muted xl:table-cell">
        {formatTRY(t.commission)}
      </Td>
      <Td align="right">
        <NetAmount t={t} />
      </Td>
    </Tr>
  );
}

function TxListRow({ t }: { t: Transaction }) {
  const buy = t.type === 'buy';
  const { date, time } = txTime(t);
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <AssetAvatar symbol={t.symbol} type={t.assetType} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <Link href={assetHref({ type: t.assetType, symbol: t.symbol })} className="text-sm font-medium text-fg hover:text-brand">
            {t.symbol}
          </Link>
          <TypeBadge buy={buy} />
        </p>
        <p className="num mt-0.5 truncate text-xs text-muted">
          {formatQuantity(t.quantity)} × {formatTRY(t.price, { precise: true })}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <NetAmount t={t} className="text-sm" />
        <p className="num mt-0.5 text-xs text-muted">
          {date} {time}
        </p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function localDayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- CSV dışa aktarma ---------- */

/**
 * Her alanı tırnak içine alır, iç tırnakları ikiler ve formül enjeksiyonuna
 * (=, +, -, @, sekme, satır başı ile başlayan hücreler) karşı başına ' ekler.
 */
function csvCell(value: string | number): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function csvDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${localDayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function exportCsv(list: Transaction[]) {
  const header = ['Tarih', 'İşlem', 'Sembol', 'Varlık', 'Varlık türü', 'Miktar', 'Birim fiyat (TRY)', 'Tutar (TRY)', 'Komisyon (TRY)', 'Net tutar (TRY)'];
  const rows = list.map((t) => [
    csvDate(t.createdAt),
    t.type === 'buy' ? 'Alış' : 'Satış',
    t.symbol,
    t.name,
    ASSET_TYPE_LABELS[t.assetType] ?? t.assetType,
    t.quantity,
    t.price,
    t.totalAmount.toFixed(2),
    t.commission.toFixed(2),
    t.netAmount.toFixed(2),
  ]);
  const content = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfoygo-islemler-${localDayKey(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
