'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRightIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ArrowsUpDownIcon,
  ArrowUpRightIcon,
  BriefcaseIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/20/solid';
import type { LiveHolding } from '@/context/PortfolioContext';
import { useTrade } from '@/components/trade/TradeProvider';
import { assetHref } from '@/components/market/MarketTable';
import { cn, formatQuantity, formatTRY, trend } from '@portfoygo/shared/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { ASSET_TYPE_LABELS, type AssetType } from '@/types';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Select, ToolbarButton } from '@/components/common/controls';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import RowMenu from '@/components/common/RowMenu';
import { holdingKey, orderLabel, type OrderRow } from './useOrders';
import { CLOSE_FRACTIONS, fractionLabel } from '@/components/trade/orderInput';

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
  { value: 'pl', label: 'K/Z tutarı (yüksekten düşüğe)' },
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
  /** "Emir" eylemi: zarar durdur / kâr al penceresini açar */
  onOrders: (h: LiveHolding) => void;
  /** Başlıktaki "Yenile" düğmesi (verilmezse gösterilmez) */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function HoldingsCard({ holdings, loaded, ordersByHolding, onOrders, onRefresh, refreshing }: Props) {
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
      <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Pozisyonlar</h2>
          <p className="mt-1 text-sm text-muted">{loaded ? `${holdings.length} açık pozisyon · canlı fiyatlarla` : 'Yükleniyor'}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs
            label="Varlık türü filtresi"
            value={filter}
            onChange={setFilter}
            items={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
            className="max-w-full min-w-0 self-start sm:self-auto"
          />
          <div className="flex gap-3">
            <Select label="Sıralama" value={sort} onChange={setSort} options={SORTS} icon={<ArrowsUpDownIcon />} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
            {onRefresh && (
              <ToolbarButton
                iconOnly
                onClick={onRefresh}
                loading={refreshing}
                aria-label="Portföyü yenile"
                title="Yenile"
                icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}
              />
            )}
          </div>
        </div>
      </div>

      {!loaded ? (
        <div className="divide-y divide-line border-t border-line px-5 sm:px-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-4">
              <Skeleton className="h-10 w-10 rounded-full" />
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
          className="border-t border-line"
          icon={<BriefcaseIcon />}
          title={filter === 'all' ? 'Pozisyon bulunamadı' : `${ASSET_TYPE_LABELS[filter]} türünde pozisyonun yok`}
          description="Bu türde açık pozisyon bulunmuyor. Diğer sekmelere göz atabilirsin."
          action={
            <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
              Tümünü göster
            </Button>
          }
        />
      ) : (
        <>
          {/* Küçük ekranlar: yığılmış satırlar */}
          <ul className="divide-y divide-line border-t border-line md:hidden">
            {rows.map((h) => (
              <MobileRow key={h.id} h={h} orders={ordersByHolding.get(holdingKey(h.assetType, h.symbol))} onOrders={onOrders} />
            ))}
          </ul>

          {/* md ve üzeri: tablo */}
          <DataTable label="Açık pozisyonlar" className="hidden pb-2 md:block">
            <THead>
              <Th>Varlık</Th>
              <Th align="right" className="hidden lg:table-cell">
                Miktar
              </Th>
              <Th align="right" className="hidden xl:table-cell">
                Ort. maliyet
              </Th>
              <Th align="right">Fiyat</Th>
              <Th align="right" aria-sort={ariaSort('value')}>
                Değer
              </Th>
              <Th align="right" aria-sort={ariaSort('pl') ?? ariaSort('plPercent')}>
                K/Z
              </Th>
              <Th align="right" aria-sort={ariaSort('day')} className="hidden lg:table-cell">
                Günlük
              </Th>
              <Th align="right" className="hidden xl:table-cell">
                Hızlı kapat
              </Th>
              <Th align="right" className="w-12">
                <span className="sr-only">İşlemler</span>
              </Th>
            </THead>
            <TBody>
              {rows.map((h) => (
                <TableRow key={h.id} h={h} orders={ordersByHolding.get(holdingKey(h.assetType, h.symbol))} onOrders={onOrders} />
              ))}
            </TBody>
          </DataTable>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Rozetler için: en yakın zarar durdur / takip eden stop (en yüksek tetikleme) ve en yakın kâr al / limit satış
 * (en düşük tetikleme). Açılışta emirlerinin fiyat tetiklemesi yoktur (referans fiyat) → rozet gösterilmez.
 */
function nearestOrders(orders: OrderRow[] | undefined) {
  if (!orders?.length) return { stop: undefined, upper: undefined };
  const stops = orders.filter((o) => o.type === 'stop_loss' || o.type === 'trailing_stop');
  const uppers = orders.filter((o) => o.type === 'limit' || o.type === 'take_profit');
  return {
    stop: stops.reduce<OrderRow | undefined>((best, o) => (!best || o.triggerPrice > best.triggerPrice ? o : best), undefined),
    upper: uppers.reduce<OrderRow | undefined>((best, o) => (!best || o.triggerPrice < best.triggerPrice ? o : best), undefined),
  };
}

// Emir tetik seviyeleri TL bazlıdır (TL girilir, TL fiyatla tetiklenir): görüntüleme biriminden bağımsız TL gösterilir
function AssetCell({ h, orders }: { h: LiveHolding; orders?: OrderRow[] }) {
  const { stop, upper } = nearestOrders(orders);
  return (
    <Link href={assetHref({ type: h.assetType, symbol: h.symbol })} className="group flex min-w-0 items-center gap-3">
      <AssetAvatar symbol={h.symbol} type={h.assetType} image={h.image} size={40} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="font-medium text-fg group-hover:text-brand">{h.symbol}</span>
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

function useHoldingActions(h: LiveHolding, orders: OrderRow[] | undefined, onOrders: (h: LiveHolding) => void) {
  const { openTrade } = useTrade();
  const target = { type: h.assetType, symbol: h.symbol, name: h.name, image: h.image };
  const count = orders?.length ?? 0;
  return {
    count,
    buy: () => openTrade(target, 'buy'),
    sell: () => openTrade(target, 'sell'),
    /** Kısmi kapatma: satış penceresi pozisyonun bu oranıyla (miktar) dolu açılır; %100 = eldeki miktarın tamamı */
    close: (fraction: number) => openTrade(target, 'sell', { sellFraction: fraction }),
    orders: () => onOrders(h),
  };
}

const closeLabel = (symbol: string, f: number) =>
  f >= 1 ? `${symbol} pozisyonunun tamamını sat` : `${symbol} pozisyonunun ${fractionLabel(f)} kadarını sat`;

/** "%25 · %50 · %100" kısmi kapatma çipleri */
function CloseChips({ h, onClose, className }: { h: LiveHolding; onClose: (f: number) => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label={`${h.symbol} pozisyonunu kapat`}>
      {CLOSE_FRACTIONS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onClose(f)}
          aria-label={closeLabel(h.symbol, f)}
          title={closeLabel(h.symbol, f)}
          className="num h-7 min-w-11 rounded-md border border-line px-2 text-[11px] font-medium text-muted transition-colors hover:border-down/40 hover:bg-down-soft hover:text-down"
        >
          {fractionLabel(f)}
        </button>
      ))}
    </div>
  );
}

function plTone(v: number) {
  const t = trend(v);
  return t === 'up' ? 'text-up' : t === 'down' ? 'text-down' : 'text-muted';
}

function TableRow({ h, orders, onOrders }: { h: LiveHolding; orders?: OrderRow[]; onOrders: (h: LiveHolding) => void }) {
  const dc = useDisplayCurrency();
  const act = useHoldingActions(h, orders, onOrders);
  return (
    <Tr className="hover:bg-surface-2">
      <Td>
        <AssetCell h={h} orders={orders} />
      </Td>
      <Td align="right" className="num hidden text-fg lg:table-cell">
        {formatQuantity(h.quantity)}
      </Td>
      <Td align="right" className="num hidden text-muted xl:table-cell">
        {dc.money(h.averagePrice, { precise: true })}
      </Td>
      <Td align="right" className="num whitespace-nowrap text-fg">
        {dc.money(h.livePrice, { precise: true, nativeUSD: h.livePriceUSD })}
        <div className="mt-0.5 text-xs text-muted lg:hidden">{formatQuantity(h.quantity)} adet</div>
      </Td>
      <Td align="right" className="num whitespace-nowrap font-semibold text-fg">
        {dc.money(h.liveValue)}
      </Td>
      <Td align="right" className="whitespace-nowrap">
        <Money value={dc.convert(h.livePL)} currency={dc.currency} signed className="block font-medium" />
        <Delta value={h.livePLPercent} variant="text" className="text-xs" />
      </Td>
      <Td align="right" className="hidden lg:table-cell">
        {h.dayChangePercent != null ? <Delta value={h.dayChangePercent} /> : <span className="text-subtle">—</span>}
      </Td>
      <Td align="right" className="hidden xl:table-cell">
        <CloseChips h={h} onClose={act.close} className="justify-end" />
      </Td>
      <Td align="right">
        <RowMenu
          label={`${h.symbol} işlemleri`}
          className="ml-auto"
          items={[
            { label: 'Al', icon: <ArrowUpRightIcon />, tone: 'up', onSelect: act.buy },
            { label: 'Sat', icon: <ArrowDownRightIcon />, tone: 'down', onSelect: act.sell },
            { label: 'Yarısını sat', icon: <ArrowDownRightIcon />, tone: 'down', onSelect: () => act.close(0.5) },
            { label: 'Pozisyonu kapat', icon: <ArrowDownRightIcon />, tone: 'down', onSelect: () => act.close(1) },
            {
              label: act.count ? `Emir (${act.count} aktif)` : 'Zarar durdur / kâr al',
              icon: <ShieldExclamationIcon />,
              onSelect: act.orders,
            },
          ]}
        />
      </Td>
    </Tr>
  );
}

function MobileRow({ h, orders, onOrders }: { h: LiveHolding; orders?: OrderRow[]; onOrders: (h: LiveHolding) => void }) {
  const dc = useDisplayCurrency();
  const act = useHoldingActions(h, orders, onOrders);
  return (
    <li className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <AssetCell h={h} orders={orders} />
        <div className="shrink-0 text-right">
          <p className="num text-sm font-semibold">{dc.money(h.liveValue)}</p>
          <p className={cn('num mt-0.5 text-xs font-medium', plTone(h.livePL))}>{dc.money(h.livePL, { sign: true })}</p>
          <Delta value={h.livePLPercent} variant="text" className="text-xs" />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
        <MiniStat label="Miktar" value={formatQuantity(h.quantity)} />
        <MiniStat label="Ort. maliyet" value={dc.money(h.averagePrice, { precise: true })} />
        <MiniStat label="Güncel fiyat" value={dc.money(h.livePrice, { precise: true, nativeUSD: h.livePriceUSD })} />
        <MiniStat label="Günlük" value={h.dayChangePercent != null ? <Delta value={h.dayChangePercent} variant="text" /> : '—'} />
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Pozisyonu kapat</span>
        <CloseChips h={h} onClose={act.close} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" variant="up" onClick={act.buy} aria-label={`${h.symbol} al`}>
          Al
        </Button>
        <Button size="sm" variant="down" onClick={act.sell} aria-label={`${h.symbol} sat`}>
          Sat
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={act.orders}
          aria-label={act.count ? `${h.symbol} için zarar durdur / kâr al emri oluştur (${act.count} aktif emir)` : `${h.symbol} için zarar durdur / kâr al emri oluştur`}
          icon={<ShieldExclamationIcon className={cn('h-3.5 w-3.5', act.count ? 'text-brand' : 'text-subtle')} aria-hidden="true" />}
        >
          Emir
        </Button>
      </div>
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
