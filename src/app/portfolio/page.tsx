'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, ArrowRightIcon, ChartBarIcon, ClockIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio, type LiveHolding } from '@/context/PortfolioContext';
import { STARTING_BALANCE } from '@/lib/constants';
import { cn, formatPercent, formatQuantity, formatRelative, formatTRY, trend } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { Delta, Money } from '@/components/ui/Delta';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import Button, { LinkButton } from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import AssetAvatar from '@/components/ui/AssetAvatar';
import ProtectOrderModal from '@/components/trade/ProtectOrderModal';
import AllocationCard from '@/components/portfolio/AllocationCard';
import HoldingsCard from '@/components/portfolio/HoldingsCard';
import OrdersCard from '@/components/portfolio/OrdersCard';
import PerformanceChart from '@/components/portfolio/PerformanceChart';
import { holdingKey, useOrders } from '@/components/portfolio/useOrders';
import type { Transaction } from '@/types';

export default function PortfolioPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <Portfolio />;
}

function Portfolio() {
  const { refreshUser } = useAuth();
  const { holdings, totals, balance, transactions, loaded, error, refresh, market } = useLivePortfolio();
  const orders = useOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [slHolding, setSlHolding] = useState<LiveHolding | null>(null);

  const allTimeChange = totals.netWorth - STARTING_BALANCE;
  const allTimePct = (allTimeChange / STARTING_BALANCE) * 100;
  const missingPrices = !market.isLoading && holdings.some((h) => h.dayChangePercent === null);

  const reload = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshUser(), orders.refresh()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portföy"
        title="Portföyüm"
        description={
          loaded ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              Net varlığın <span className="num font-semibold text-fg">{formatTRY(totals.netWorth)}</span>
              <Delta value={allTimePct} />
              <span className="text-subtle">başlangıçtan bu yana</span>
            </span>
          ) : (
            'Pozisyonların canlı piyasa fiyatlarıyla değerlenir.'
          )
        }
        actions={
          <>
            <Button variant="secondary" onClick={reload} loading={refreshing} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}>
              Yenile
            </Button>
            <LinkButton href="/transactions" variant="ghost" icon={<ClockIcon className="h-4 w-4" aria-hidden="true" />}>
              İşlem geçmişi
            </LinkButton>
          </>
        }
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

      <PerformanceChart />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col overflow-hidden lg:col-span-2">
          <dl className="grid flex-1 grid-cols-2 gap-px bg-line sm:grid-cols-4 lg:grid-cols-2">
            <Metric
              label="Toplam varlık"
              loading={!loaded}
              value={formatTRY(totals.netWorth)}
              sub={<Money value={allTimeChange} signed />}
            />
            <Metric
              label="Nakit"
              loading={!loaded}
              value={formatTRY(balance)}
              sub={totals.netWorth > 0 ? `Varlığın ${formatPercent((balance / totals.netWorth) * 100, { sign: false })}` : undefined}
            />
            <Metric
              label="Yatırım değeri"
              loading={!loaded}
              value={formatTRY(totals.value)}
              sub={`Maliyet ${formatTRY(totals.invested)}`}
            />
            <Metric
              label="Açık pozisyon K/Z"
              loading={!loaded}
              value={<span className={cn(trend(totals.pl) === 'up' && 'text-up', trend(totals.pl) === 'down' && 'text-down')}>{formatTRY(totals.pl, { sign: true })}</span>}
              sub={holdings.length ? <Delta value={totals.plPercent} variant="text" /> : 'Açık pozisyon yok'}
            />
          </dl>
          <BestWorst holdings={holdings} loaded={loaded} />
        </Card>
        <AllocationCard holdings={holdings} balance={balance} loaded={loaded} />
      </div>

      {loaded && holdings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartBarIcon />}
            title="Henüz pozisyonun yok"
            description={`${formatTRY(balance)} sanal bakiyenle hisse, kripto, döviz ve emtia alarak portföyünü oluşturmaya başla.`}
            action={<LinkButton href="/" icon={<MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />}>Piyasalara göz at</LinkButton>}
          />
        </Card>
      ) : (
        <HoldingsCard holdings={holdings} loaded={loaded} ordersByHolding={orders.activeSellByHolding} onOrders={setSlHolding} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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

function Metric({ label, value, sub, loading }: { label: string; value: React.ReactNode; sub?: React.ReactNode; loading?: boolean }) {
  return (
    <div className="min-w-0 bg-surface p-4 sm:p-5">
      <dt className="text-xs text-muted">{label}</dt>
      {loading ? (
        <dd>
          <Skeleton className="mt-2 h-6 w-28" />
          <Skeleton className="mt-2 h-3.5 w-20" />
        </dd>
      ) : (
        <>
          <dd className="num mt-1.5 truncate text-lg font-semibold tracking-tight sm:text-xl">{value}</dd>
          {sub && <dd className="num mt-0.5 truncate text-xs text-subtle">{sub}</dd>}
        </>
      )}
    </div>
  );
}

function BestWorst({ holdings, loaded }: { holdings: LiveHolding[]; loaded: boolean }) {
  const { best, worst } = useMemo(() => {
    if (holdings.length === 0) return { best: null, worst: null };
    const sorted = [...holdings].sort((a, b) => b.livePLPercent - a.livePLPercent);
    return { best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null };
  }, [holdings]);

  if (!loaded || !best) return null;

  return (
    <div className="grid border-t border-line sm:grid-cols-2">
      <Highlight label="En iyi performans" h={best} />
      {worst && <Highlight label="En zayıf performans" h={worst} className="border-t border-line sm:border-l sm:border-t-0" />}
    </div>
  );
}

function Highlight({ label, h, className }: { label: string; h: LiveHolding; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3.5 sm:px-5', className)}>
      <AssetAvatar symbol={h.symbol} type={h.assetType} image={h.image} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-[13px] font-semibold">{h.symbol}</p>
      </div>
      <div className="text-right">
        <Money value={h.livePL} signed className="block text-sm font-medium" />
        <Delta value={h.livePLPercent} variant="text" className="text-xs" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RecentTransactions({ transactions, loaded }: { transactions: Transaction[]; loaded: boolean }) {
  const recent = transactions.slice(0, 5);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon />}
        title="Son işlemler"
        description="En son alım ve satımların"
        action={transactions.length > 0 && <LinkButton href="/transactions" variant="ghost" size="sm">Tümü <ArrowRightIcon className="h-3.5 w-3.5" /></LinkButton>}
      />
      {!loaded ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : recent.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="Henüz işlem yok" description="Yaptığın alım ve satımlar burada listelenir." />
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((t) => (
            <li key={t.id}>
              <Link href="/transactions" className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    t.type === 'buy' ? 'bg-up-soft text-up' : 'bg-down-soft text-down',
                  )}
                  aria-hidden="true"
                >
                  {t.type === 'buy' ? 'AL' : 'SAT'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-mono text-[13px] font-semibold">{t.symbol}</span>{' '}
                    <span className={t.type === 'buy' ? 'text-up' : 'text-down'}>{t.type === 'buy' ? 'Alış' : 'Satış'}</span>
                  </p>
                  <p className="num truncate text-xs text-muted">
                    {formatQuantity(t.quantity)} × {formatTRY(t.price, { precise: true })} · {formatRelative(t.createdAt)}
                  </p>
                </div>
                <span className="num text-sm font-medium">{formatTRY(t.netAmount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
