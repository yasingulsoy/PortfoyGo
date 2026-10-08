'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeftIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  ClockIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePortfolio } from '@/context/PortfolioContext';
import { cn, formatQuantity, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS, type AssetType, type Transaction } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import Button, { LinkButton } from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import Tabs from '@/components/ui/Tabs';
import { assetHref } from '@/components/market/MarketTable';

type TypeFilter = 'all' | 'buy' | 'sell';
type AssetFilter = 'all' | AssetType;
type SortKey = 'newest' | 'oldest' | 'amount';

const PAGE_SIZE = 25;

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'En yeni' },
  { value: 'oldest', label: 'En eski' },
  { value: 'amount', label: 'Tutar (yüksekten düşüğe)' },
];

const selectClass =
  'h-9 w-full appearance-none rounded-lg border border-line bg-surface-2 pl-3 pr-8 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--ring)]';

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
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  // Filtre değiştiğinde sayfalama başa döner (effect yerine olay işleyicilerinde)
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVisible(PAGE_SIZE);
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

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const groups = useMemo(() => (sort === 'amount' ? null : groupByDay(shown)), [shown, sort]);
  const hasFilters = type !== 'all' || asset !== 'all' || query.trim() !== '';

  const resetFilters = () => {
    setType('all');
    setAsset('all');
    setQuery('');
    setVisible(PAGE_SIZE);
  };

  const reload = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hesap"
        title="İşlem geçmişi"
        description="Tüm alım ve satımların; komisyon ve net tutarlarıyla birlikte."
        actions={
          <>
            <Button variant="ghost" onClick={reload} loading={refreshing} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}>
              Yenile
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}
              aria-label={`${filtered.length} işlemi CSV olarak indir`}
            >
              CSV indir
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <Metric label="Toplam işlem" loading={!loaded} value={transactions.length.toLocaleString('tr-TR')} sub={`${stats.buyCount} alış · ${stats.sellCount} satış`} />
          <Metric label="Toplam alım hacmi" loading={!loaded} value={formatTRY(stats.buy)} tone="up" />
          <Metric label="Toplam satım hacmi" loading={!loaded} value={formatTRY(stats.sell)} tone="down" />
          <Metric label="Ödenen komisyon" loading={!loaded} value={formatTRY(stats.commission)} />
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs<TypeFilter>
            label="İşlem türü"
            value={type}
            onChange={withReset(setType)}
            items={[
              { value: 'all', label: 'Tümü', count: transactions.length },
              { value: 'buy', label: 'Alış', count: stats.buyCount },
              { value: 'sell', label: 'Satış', count: stats.sellCount },
            ]}
            className="self-start"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] lg:w-[34rem]">
            <label className="relative col-span-2 block sm:col-span-1">
              <span className="sr-only">Sembol veya isim ara</span>
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => withReset(setQuery)(e.target.value)}
                placeholder="Sembol veya isim ara"
                className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-sm placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
            <label className="relative block">
              <span className="sr-only">Varlık türü</span>
              <select value={asset} onChange={(e) => withReset(setAsset)(e.target.value as AssetFilter)} className={selectClass}>
                <option value="all">Tüm varlıklar</option>
                {assetTypes.map((k) => (
                  <option key={k} value={k}>{ASSET_TYPE_LABELS[k]}</option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            </label>
            <label className="relative block">
              <span className="sr-only">Sıralama</span>
              <select value={sort} onChange={(e) => withReset(setSort)(e.target.value as SortKey)} className={selectClass}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            </label>
          </div>
        </div>

        {!loaded ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
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
            icon={<ClockIcon />}
            title="Henüz işlem yapmadın"
            description="İlk alımını yaptığında tüm işlemlerin burada tarih sırasıyla listelenir."
            action={<LinkButton href="/" icon={<MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />}>Piyasalara göz at</LinkButton>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MagnifyingGlassIcon />}
            title="Eşleşen işlem bulunamadı"
            description={query.trim() ? `“${query.trim()}” için seçili filtrelerde sonuç yok.` : 'Seçili filtrelerde işlem yok.'}
            action={hasFilters && <Button variant="secondary" size="sm" onClick={resetFilters}>Filtreleri temizle</Button>}
          />
        ) : (
          <>
            {groups ? (
              groups.map((g) => (
                <section key={g.key} aria-labelledby={`day-${g.key}`}>
                  <h3
                    id={`day-${g.key}`}
                    className="flex items-center justify-between border-b border-line bg-surface-2/60 px-5 py-2 text-xs font-medium text-muted"
                  >
                    <span>{g.label}</span>
                    <span className="num text-subtle">{g.items.length} işlem</span>
                  </h3>
                  <ul className="divide-y divide-line border-b border-line">
                    {g.items.map((t) => <TxRow key={t.id} t={t} />)}
                  </ul>
                </section>
              ))
            ) : (
              <ul className="divide-y divide-line border-b border-line">
                {shown.map((t) => <TxRow key={t.id} t={t} showDate />)}
              </ul>
            )}

            <div className="flex flex-col items-center gap-3 px-5 py-4 text-xs text-muted sm:flex-row sm:justify-between">
              <span className="num">
                {filtered.length} işlemden {shown.length} tanesi gösteriliyor
              </span>
              {shown.length < filtered.length && (
                <Button variant="secondary" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Daha fazla göster
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Metric({ label, value, sub, tone, loading }: { label: string; value: string; sub?: string; tone?: 'up' | 'down'; loading?: boolean }) {
  return (
    <div className="min-w-0 bg-surface p-4 sm:p-5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {tone && <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'up' ? 'bg-up' : 'bg-down')} aria-hidden="true" />}
        {label}
      </dt>
      {loading ? (
        <dd>
          <Skeleton className="mt-2 h-6 w-28" />
        </dd>
      ) : (
        <>
          <dd className="num mt-1.5 truncate text-lg font-semibold tracking-tight sm:text-xl">{value}</dd>
          {sub && <dd className="num mt-0.5 text-xs text-subtle">{sub}</dd>}
        </>
      )}
    </div>
  );
}

function TxRow({ t, showDate }: { t: Transaction; showDate?: boolean }) {
  const buy = t.type === 'buy';
  const Icon = buy ? ArrowDownLeftIcon : ArrowUpRightIcon;
  const d = new Date(t.createdAt);
  const valid = !Number.isNaN(d.getTime());
  const time = valid ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const date = valid ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <li className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60">
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', buy ? 'bg-up-soft text-up' : 'bg-down-soft text-down')}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 sm:w-56 sm:shrink-0">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Link href={assetHref({ type: t.assetType, symbol: t.symbol })} className="font-mono text-[13px] font-semibold text-fg hover:text-brand">
              {t.symbol}
            </Link>
            <Badge tone={buy ? 'up' : 'down'}>{buy ? 'Alış' : 'Satış'}</Badge>
            <Badge className="max-sm:hidden">{ASSET_TYPE_LABELS[t.assetType]}</Badge>
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">{t.name}</p>
        </div>
        <p className="num mt-0.5 truncate text-xs text-muted sm:mt-0 sm:flex-1 sm:text-sm sm:text-fg">
          {formatQuantity(t.quantity)} <span className="text-subtle">×</span> {formatTRY(t.price, { precise: true })}
        </p>
        <p className="num hidden w-28 shrink-0 text-right text-xs text-subtle md:block">
          <span className="sr-only">Komisyon: </span>
          {formatTRY(t.commission)} kom.
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn('num text-sm font-semibold', buy ? 'text-fg' : 'text-up')}>
          <span className="sr-only">{buy ? 'Ödenen' : 'Hesaba geçen'}: </span>
          {buy ? '−' : '+'}
          {formatTRY(t.netAmount)}
        </p>
        <p className="num mt-0.5 text-xs text-subtle">{showDate ? `${date} ${time}` : time}</p>
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

/** İşlemleri yerel takvim gününe göre gruplar; sıra korunur. */
function groupByDay(list: Transaction[]) {
  const now = new Date();
  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: { key: string; label: string; items: Transaction[] }[] = [];
  const index = new Map<string, number>();

  for (const t of list) {
    const d = new Date(t.createdAt);
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? localDayKey(d) : 'unknown';
    let i = index.get(key);
    if (i === undefined) {
      const label = !valid
        ? 'Tarihi bilinmeyen'
        : key === today
          ? 'Bugün'
          : key === yesterday
            ? 'Dün'
            : d.toLocaleDateString('tr-TR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
              });
      i = groups.push({ key, label, items: [] }) - 1;
      index.set(key, i);
    }
    groups[i].items.push(t);
  }
  return groups;
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
