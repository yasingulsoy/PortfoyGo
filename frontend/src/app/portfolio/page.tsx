'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, ChartBarIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { ArrowTrendingUpIcon, BanknotesIcon, BriefcaseIcon, ClockIcon, WalletIcon } from '@heroicons/react/24/outline';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio, type LiveHolding } from '@/context/PortfolioContext';
import { STARTING_BALANCE } from '@/lib/constants';
import { cn, formatPercent, formatQuantity, formatRelative, formatTRY, trend } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Breadcrumb from '@/components/common/Breadcrumb';
import MetricCard, { MetricGrid } from '@/components/common/MetricCard';
import { toolbarButtonClass } from '@/components/common/controls';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { assetHref } from '@/components/market/MarketTable';
import ProtectOrderModal from '@/components/trade/ProtectOrderModal';
import AllocationCard from '@/components/portfolio/AllocationCard';
import HoldingsCard from '@/components/portfolio/HoldingsCard';
import OrdersCard from '@/components/portfolio/OrdersCard';
import PerformanceChart from '@/components/portfolio/PerformanceChart';
import AdvisorTeaser from '@/components/advisor/AdvisorTeaser';
import { holdingKey, useOrders } from '@/components/portfolio/useOrders';
import type { Transaction } from '@/types';

export default function PortfolioPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <Portfolio />;
}

function Portfolio() {
  const { refreshUser } = useAuth();
  const { holdings, totals, balance, reservedCash, transactions, loaded, error, refresh, market } = useLivePortfolio();
  const orders = useOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [slHolding, setSlHolding] = useState<LiveHolding | null>(null);

  const allTimeChange = totals.netWorth - STARTING_BALANCE;
  const allTimePct = (allTimeChange / STARTING_BALANCE) * 100;
  const missingPrices = !market.isLoading && holdings.some((h) => h.dayChangePercent === null);
  const plTrend = trend(totals.pl);

  const reload = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshUser(), orders.refresh()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Portföyüm"
        description="Pozisyonların canlı piyasa fiyatlarıyla değerlenir."
        actions={<Breadcrumb items="Portföy" />}
      />

      {error && (
        <Alert tone="error">
          Portföy yüklenemedi: {error}{' '}
          <button type="button" onClick={() => void refresh()} className="font-semibold underline underline-offset-2">
            Tekrar dene
          </button>
        </Alert>
      )}

      {missingPrices && holdings.length > 0 && (
        <Alert tone="info">Bazı varlıklar için canlı fiyat alınamadı; bu pozisyonlarda sunucunun son değerlemesi gösteriliyor.</Alert>
      )}

      <MetricGrid>
        <MetricCard
          icon={<WalletIcon />}
          label="Toplam varlık"
          loading={!loaded}
          value={formatTRY(totals.netWorth)}
          sub={
            <>
              <Money value={allTimeChange} signed /> başlangıçtan beri
            </>
          }
          aside={<Delta value={allTimePct} />}
        />
        <MetricCard
          icon={<BanknotesIcon />}
          label="Nakit"
          loading={!loaded}
          value={formatTRY(balance)}
          sub={
            reservedCash > 0
              ? `${formatTRY(reservedCash)} emirlerde ayrıldı`
              : totals.netWorth > 0
                ? `Varlığın ${formatPercent((balance / totals.netWorth) * 100, { sign: false })}`
                : undefined
          }
        />
        <MetricCard
          icon={<BriefcaseIcon />}
          label="Yatırım değeri"
          loading={!loaded}
          value={formatTRY(totals.value)}
          sub={`Maliyet ${formatTRY(totals.invested)}`}
          aside={holdings.length > 0 ? <Badge>{holdings.length} pozisyon</Badge> : undefined}
        />
        <MetricCard
          icon={<ArrowTrendingUpIcon />}
          label="Açık pozisyon K/Z"
          loading={!loaded}
          value={<span className={cn(plTrend === 'up' && 'text-up', plTrend === 'down' && 'text-down')}>{formatTRY(totals.pl, { sign: true })}</span>}
          sub={holdings.length ? 'Maliyete göre gerçekleşmemiş' : 'Açık pozisyon yok'}
          aside={holdings.length ? <Delta value={totals.plPercent} /> : undefined}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <PerformanceChart className="xl:col-span-8" />
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:col-span-4 xl:grid-cols-1 xl:content-start">
          <AllocationCard holdings={holdings} balance={balance + reservedCash} loaded={loaded} />
          <Highlights holdings={holdings} loaded={loaded} />
          <AdvisorTeaser />
        </div>
      </div>

      {loaded && holdings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartBarIcon />}
            title="Henüz pozisyonun yok"
            description={`${formatTRY(balance)} sanal bakiyenle hisse, kripto, döviz ve emtia alarak portföyünü oluşturmaya başla.`}
            action={
              <LinkButton href="/" icon={<MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />}>
                Piyasalara göz at
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <HoldingsCard
          holdings={holdings}
          loaded={loaded}
          ordersByHolding={orders.activeSellByHolding}
          onOrders={setSlHolding}
          onRefresh={() => void reload()}
          refreshing={refreshing}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
        <OrdersCard
          id="bekleyen-emirler"
          active={orders.active}
          history={orders.history}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => void orders.refresh()}
          onChanged={() => Promise.all([orders.refresh(), refresh(), refreshUser()])}
        />
        <RecentTransactions transactions={transactions} loaded={loaded} />
      </div>

      <ProtectOrderModal
        holding={slHolding}
        activeOrders={slHolding ? orders.activeSellByHolding.get(holdingKey(slHolding.assetType, slHolding.symbol)) : undefined}
        onClose={() => setSlHolding(null)}
        onCreated={() => void orders.refresh()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** En iyi ve en zayıf performanslı pozisyon. */
function Highlights({ holdings, loaded }: { holdings: LiveHolding[]; loaded: boolean }) {
  const { best, worst } = useMemo(() => {
    if (holdings.length === 0) return { best: null, worst: null };
    const sorted = [...holdings].sort((a, b) => b.livePLPercent - a.livePLPercent);
    return { best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null };
  }, [holdings]);

  if (!loaded || !best) return null;

  return (
    <Card>
      <CardHeader title="Öne çıkanlar" description="Maliyete göre en iyi ve en zayıf pozisyon" />
      <ul className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
        <Highlight label="En iyi performans" h={best} />
        {worst && <Highlight label="En zayıf performans" h={worst} />}
      </ul>
    </Card>
  );
}

function Highlight({ label, h }: { label: string; h: LiveHolding }) {
  return (
    <li>
      <Link
        href={assetHref({ type: h.assetType, symbol: h.symbol })}
        className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-surface-2"
      >
        <AssetAvatar symbol={h.symbol} type={h.assetType} image={h.image} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{label}</p>
          <p className="truncate text-sm font-semibold text-fg">{h.symbol}</p>
        </div>
        <div className="text-right">
          <Money value={h.livePL} signed className="block text-sm font-medium" />
          <Delta value={h.livePLPercent} className="mt-0.5" />
        </div>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function RecentTransactions({ transactions, loaded }: { transactions: Transaction[]; loaded: boolean }) {
  const recent = transactions.slice(0, 6);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Son işlemler"
        description="En son alım ve satımların"
        action={
          transactions.length > 0 && (
            <Link href="/transactions" className={toolbarButtonClass}>
              Tümü <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
          )
        }
      />
      {!loaded ? (
        <div className="space-y-3 px-5 pb-6 sm:px-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="Henüz işlem yok" description="Yaptığın alım ve satımlar burada listelenir." />
      ) : (
        <DataTable label="Son işlemler" className="pb-2">
          <THead>
            <Th>Varlık</Th>
            <Th className="hidden sm:table-cell">Miktar × fiyat</Th>
            <Th align="right">Net tutar</Th>
          </THead>
          <TBody>
            {recent.map((t) => {
              const buy = t.type === 'buy';
              return (
                <Tr key={t.id}>
                  <Td>
                    <div className="flex min-w-0 items-center gap-3">
                      <AssetAvatar symbol={t.symbol} type={t.assetType} size={36} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5">
                          <Link href={assetHref({ type: t.assetType, symbol: t.symbol })} className="truncate font-medium text-fg hover:text-brand">
                            {t.symbol}
                          </Link>
                          <Badge tone={buy ? 'up' : 'down'}>{buy ? 'Alış' : 'Satış'}</Badge>
                        </p>
                        <p className="num mt-0.5 truncate text-xs text-muted">
                          <span className="sm:hidden">{formatQuantity(t.quantity)} adet · </span>
                          {formatRelative(t.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="num hidden whitespace-nowrap text-muted sm:table-cell">
                    {formatQuantity(t.quantity)} × {formatTRY(t.price, { precise: true })}
                  </Td>
                  <Td align="right" className={cn('num whitespace-nowrap font-medium', buy ? 'text-fg' : 'text-up')}>
                    <span className="sr-only">{buy ? 'Ödenen' : 'Hesaba geçen'}: </span>
                    {buy ? '−' : '+'}
                    {formatTRY(t.netAmount)}
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
