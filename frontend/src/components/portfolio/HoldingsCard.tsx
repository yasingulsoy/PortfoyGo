'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowTrendingUpIcon, BriefcaseIcon, ChevronDownIcon, FunnelIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import type { LiveHolding } from '@/context/PortfolioContext';
import { useTrade } from '@/components/trade/TradeProvider';
import { assetHref } from '@/components/market/MarketTable';
import { cn, formatQuantity, formatTRY, trend } from '@/lib/format';
import { ASSET_TYPE_LABELS, type AssetType } from '@/types';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import AssetAvatar from '@/components/ui/AssetAvatar';
import Tabs from '@/components/ui/Tabs';
import { Delta, Money } from '@/components/ui/Delta';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { holdingKey, orderLabel, type OrderRow } from './useOrders';

type Filter = 'all' | AssetType;
type SortKey = 'value' | 'pl' | 'plPercent' | 'day' | 'symbol';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'stock', label: 'Hisse' },
  { value: 'crypto', label: 'Kripto' },
  { value: 'currency', label: 'Döviz' },
  { value: 'commodity', label: 'Emtia' },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'value', label: 'Değer (yüksekten düşüğe)' },
  { value: 'pl', label: 'K/Z ₺ (yüksekten düşüğe)' },
  { value: 'plPercent', label: 'K/Z % (yüksekten düşüğe)' },
  { value: 'day', label: 'Günlük değişim' },
  { value: 'symbol', label: 'Sembol (A–Z)' },
];

const TYPE_TONE: Record<AssetType, 'brand' | 'gold' | 'up' | 'neutral'> = {
  stock: 'brand',
  crypto: 'gold',
  currency: 'up',
  commodity: 'neutral',
};

function sortHoldings(list: LiveHolding[], key: SortKey) {
  const sorted = [...list];
  switch (key) {
    case 'value':
      return sorted.sort((a, b) => b.liveValue - a.liveValue);
    case 'pl':
      return sorted.sort((a, b) => b.livePL - a.livePL);
    case 'plPercent':
      return sorted.sort((a, b) => b.livePLPercent - a.livePLPercent);
    case 'day':
      return sorted.sort((a, b) => (b.dayChangePercent ?? -Infinity) - (a.dayChangePercent ?? -Infinity));
    case 'symbol':
      return sorted.sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'));
  }
}

interface Props {
  holdings: LiveHolding[];
  loaded: boolean;
  /** holdingKey(assetType, symbol) → pozisyondaki aktif satış emirleri */
  ordersByHolding: Map<string, OrderRow[]>;
  /** "Emir" düğmesi: zarar durdur / kâr al penceresini açar */
  onOrders: (h: LiveHolding) => void;
}

export default function HoldingsCard({ holdings, loaded, ordersByHolding, onOrders }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('value');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: holdings.length, stock: 0, crypto: 0, currency: 0, commodity: 0 };
    for (const h of holdings) c[h.assetType] += 1;
    return c;
  }, [holdings]);

  const rows = useMemo(
    () => sortHoldings(filter === 'all' ? holdings : holdings.filter((h) => h.assetType === filter), sort),
    [holdings, filter, sort],
  );

  const ariaSort = (key: SortKey) => (sort === key ? 'descending' : undefined);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <BriefcaseIcon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Pozisyonlar</h2>
            <p className="mt-0.5 text-xs text-muted">{loaded ? `${holdings.length} açık pozisyon · canlı fiyatlarla` : 'Yükleniyor'}</p>
          </div>
        </div>
        <label className="relative block sm:w-60">
          <span className="sr-only">Sıralama</span>
          <FunnelIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 w-full appearance-none rounded-lg border border-line bg-surface-2 pl-9 pr-8 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        </label>
      </div>

      <div className="px-5 pt-3">
        <Tabs
          variant="underline"
          label="Varlık türü filtresi"
          value={filter}
          onChange={setFilter}
          items={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
        />
      </div>

      {!loaded ? (
        <div className="divide-y divide-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon />}
          title={filter === 'all' ? 'Pozisyon bulunamadı' : `${ASSET_TYPE_LABELS[filter]} türünde pozisyonun yok`}
          description="Bu türde açık pozisyon bulunmuyor. Diğer sekmelere göz atabilirsin."
          action={<Button variant="secondary" size="sm" onClick={() => setFilter('all')}>Tümünü göster</Button>}
        />
      ) : (
        <>
          {/* Küçük ekranlar: yığılmış satırlar */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((h) => (
              <MobileRow key={h.id} h={h} orders={ordersByHolding.get(holdingKey(h.assetType, h.symbol))} onOrders={onOrders} />
            ))}
          </ul>

          {/* md ve üzeri: tablo */}
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Açık pozisyonlar</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-subtle">
                <th scope="col" className="py-2.5 pl-5 font-medium">Varlık</th>
                <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium lg:table-cell">Miktar</th>
                <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium xl:table-cell">Ort. maliyet</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Fiyat</th>
                <th scope="col" aria-sort={ariaSort('value')} className="py-2.5 pr-4 text-right font-medium">Değer</th>
                <th scope="col" aria-sort={ariaSort('pl') ?? ariaSort('plPercent')} className="py-2.5 pr-4 text-right font-medium">K/Z</th>
                <th scope="col" aria-sort={ariaSort('day')} className="hidden py-2.5 pr-4 text-right font-medium lg:table-cell">Günlük</th>
                <th scope="col" className="py-2.5 pr-5 text-right font-medium">
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((h) => (
                <TableRow key={h.id} h={h} orders={ordersByHolding.get(holdingKey(h.assetType, h.symbol))} onOrders={onOrders} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** Rozetler için: en yakın zarar durdur (en yüksek tetikleme) ve en yakın kâr al / limit satış (en düşük tetikleme) */
function nearestOrders(orders: OrderRow[] | undefined) {
  if (!orders?.length) return { stop: undefined, upper: undefined };
  const stops = orders.filter((o) => o.type === 'stop_loss');
  const uppers = orders.filter((o) => o.type !== 'stop_loss');
  return {
    stop: stops.reduce<OrderRow | undefined>((best, o) => (!best || o.triggerPrice > best.triggerPrice ? o : best), undefined),
    upper: uppers.reduce<OrderRow | undefined>((best, o) => (!best || o.triggerPrice < best.triggerPrice ? o : best), undefined),
  };
}

function AssetCell({ h, orders }: { h: LiveHolding; orders?: OrderRow[] }) {
  const { stop, upper } = nearestOrders(orders);
  return (
    <Link href={assetHref({ type: h.assetType, symbol: h.symbol })} className="group flex min-w-0 items-center gap-3">
      <AssetAvatar symbol={h.symbol} type={h.assetType} image={h.image} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="font-mono text-[13px] font-semibold text-fg group-hover:text-brand">{h.symbol}</span>
          <Badge tone={TYPE_TONE[h.assetType]}>{ASSET_TYPE_LABELS[h.assetType]}</Badge>
          {stop && (
            <Badge tone="down" className="num">
              <ShieldExclamationIcon className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Aktif {orderLabel(stop).toLocaleLowerCase('tr-TR')} emri:</span> {formatTRY(stop.triggerPrice, { precise: true })}
            </Badge>
          )}
          {upper && (
            <Badge tone={upper.type === 'take_profit' ? 'gold' : 'brand'} className="num">
              <ArrowTrendingUpIcon className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Aktif {orderLabel(upper).toLocaleLowerCase('tr-TR')} emri:</span> {formatTRY(upper.triggerPrice, { precise: true })}
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block max-w-[11rem] truncate text-xs text-muted lg:max-w-[14rem]">{h.name}</span>
      </span>
    </Link>
  );
}

function Actions({ h, orders, onOrders, className }: { h: LiveHolding; orders?: OrderRow[]; onOrders: (h: LiveHolding) => void; className?: string }) {
  const count = orders?.length ?? 0;
  const { openTrade } = useTrade();
  const target = { type: h.assetType, symbol: h.symbol, name: h.name, image: h.image };
  return (
    <div className={cn('flex justify-end gap-1.5', className)}>
      <Button size="sm" variant="up" onClick={() => openTrade(target, 'buy')} aria-label={`${h.symbol} al`}>
        Al
      </Button>
      <Button size="sm" variant="down" onClick={() => openTrade(target, 'sell')} aria-label={`${h.symbol} sat`}>
        Sat
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onOrders(h)}
        aria-label={count ? `${h.symbol} için zarar durdur / kâr al emri oluştur (${count} aktif emir)` : `${h.symbol} için zarar durdur / kâr al emri oluştur`}
        icon={<ShieldExclamationIcon className={cn('h-3.5 w-3.5', count ? 'text-brand' : 'text-subtle')} aria-hidden="true" />}
      >
        Emir
      </Button>
    </div>
  );
}

function plTone(v: number) {
  const t = trend(v);
  return t === 'up' ? 'text-up' : t === 'down' ? 'text-down' : 'text-muted';
}

function TableRow({ h, orders, onOrders }: { h: LiveHolding; orders?: OrderRow[]; onOrders: (h: LiveHolding) => void }) {
  return (
    <tr className="transition-colors hover:bg-surface-2/60">
      <td className="py-3 pl-5 pr-3">
        <AssetCell h={h} orders={orders} />
      </td>
      <td className="num hidden py-3 pr-4 text-right lg:table-cell">{formatQuantity(h.quantity)}</td>
      <td className="num hidden py-3 pr-4 text-right text-muted xl:table-cell">{formatTRY(h.averagePrice, { precise: true })}</td>
      <td className="num py-3 pr-4 text-right">
        {formatTRY(h.livePrice, { precise: true })}
        <div className="mt-0.5 text-xs text-subtle lg:hidden">{formatQuantity(h.quantity)} adet</div>
      </td>
      <td className="num py-3 pr-4 text-right font-semibold">{formatTRY(h.liveValue)}</td>
      <td className="py-3 pr-4 text-right">
        <Money value={h.livePL} signed className="block font-medium" />
        <Delta value={h.livePLPercent} variant="text" className="text-xs" />
      </td>
      <td className="hidden py-3 pr-4 text-right lg:table-cell">
        {h.dayChangePercent != null ? <Delta value={h.dayChangePercent} /> : <span className="text-subtle">—</span>}
      </td>
      <td className="py-3 pr-5">
        <Actions h={h} orders={orders} onOrders={onOrders} />
      </td>
    </tr>
  );
}

function MobileRow({ h, orders, onOrders }: { h: LiveHolding; orders?: OrderRow[]; onOrders: (h: LiveHolding) => void }) {
  return (
    <li className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <AssetCell h={h} orders={orders} />
        <div className="shrink-0 text-right">
          <p className="num text-sm font-semibold">{formatTRY(h.liveValue)}</p>
          <p className={cn('num mt-0.5 text-xs font-medium', plTone(h.livePL))}>{formatTRY(h.livePL, { sign: true })}</p>
          <Delta value={h.livePLPercent} variant="text" className="text-xs" />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
        <MiniStat label="Miktar" value={formatQuantity(h.quantity)} />
        <MiniStat label="Ort. maliyet" value={formatTRY(h.averagePrice, { precise: true })} />
        <MiniStat label="Güncel fiyat" value={formatTRY(h.livePrice, { precise: true })} />
        <MiniStat label="Günlük" value={h.dayChangePercent != null ? <Delta value={h.dayChangePercent} variant="text" /> : '—'} />
      </dl>
      <Actions h={h} orders={orders} onOrders={onOrders} className="mt-3 [&>button]:flex-1" />
    </li>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num mt-0.5 truncate text-[13px] font-medium text-fg">{value}</dd>
    </div>
  );
}
