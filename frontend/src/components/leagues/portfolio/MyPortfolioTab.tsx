'use client';

import { useMemo, useState } from 'react';
import { ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/20/solid';
import { BriefcaseIcon } from '@heroicons/react/24/outline';
import { cn, formatDateTime, formatQuantity, formatUSD } from '@portfoygo/shared/format';
import AnimatedNumber from '@portfoygo/shared/ui/AnimatedNumber';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { sandboxApi } from '@/lib/api';
import AllocationDonut from '@/components/sandbox/AllocationDonut';
import HoldingsTable from '@/components/sandbox/HoldingsTable';
import MetricsGrid from '@/components/sandbox/MetricsGrid';
import SandboxDisclaimer from '@/components/sandbox/SandboxDisclaimer';
import TradeForm, { type TradeAsset } from '@/components/sandbox/TradeForm';
import { assetSlices, classSlices, fmtPct } from '@/components/sandbox/model';
import type { SandboxHolding } from '@/components/sandbox/types';
import { DataTable, TBody, THead, Td, Th } from '@/components/common/Table';
import { formatCapital, formatCommission, portfolioLeagueApi } from '@/lib/portfolioLeagues';
import type { PortfolioLeagueDetail, PortfolioLeaguePortfolio } from '@/types/portfolioLeague';
import LeagueRebalanceModal from './RebalanceModal';

interface Props {
  leagueId: string;
  detail: PortfolioLeagueDetail;
  data: PortfolioLeaguePortfolio | undefined;
  loading: boolean;
  onChanged: () => void;
}

/** "Portföyüm" / "Takım portföyü": özet, dağılım, pozisyonlar, al-sat, hedef ağırlıkla dengeleme, işlem geçmişi (yapan kişiyle). */
export default function MyPortfolioTab({ leagueId, detail, data, loading, onChanged }: Props) {
  const toast = useToast();
  const [preset, setPreset] = useState<{ asset: TradeAsset; side?: 'buy' | 'sell'; nonce: number } | null>(null);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const { rules, me, status } = detail;
  const team = me.kind === 'team';
  const p = data?.portfolio ?? null;
  const v = p?.valuation;
  const canTrade = me.can_trade && p?.status === 'active';
  const tradeHoldings = useMemo(
    () => (v ? v.holdings.map((h) => ({ asset_type: h.asset_type, symbol: h.symbol, name: h.name, price_usd: h.price_usd, quantity: h.quantity })) : []),
    [v],
  );

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!p || !v) {
    return (
      <Card>
        <EmptyState
          icon={<BriefcaseIcon />}
          title={status === 'upcoming' ? `Portföyün başlangıçta açılacak: ${formatCapital(rules.starting_capital_usd)}` : 'Bu ligde portföyün yok'}
          description={
            me.trade_block_reason ??
            (status === 'upcoming'
              ? 'Herkesin portföyü aynı anda, aynı sermaye ve işlem maliyetiyle açılır. Bu arada strateji beyanını yazabilirsin.'
              : undefined)
          }
        />
      </Card>
    );
  }

  const selectHolding = (h: SandboxHolding) => {
    setPreset({ asset: { asset_type: h.asset_type, symbol: h.symbol, name: h.name, price_usd: h.price_usd }, side: 'sell', nonce: Date.now() });
    document.getElementById('pl-islem')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <Card featured>
        <CardBody className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{team ? `Takım portföyü · ${data?.label ?? ''}` : 'Portföyüm'}</Badge>
              {data?.late_join && <Badge>Geç katıldı</Badge>}
              {p.status !== 'active' && (
                <Badge tone="gold">
                  <LockClosedIcon className="h-3 w-3" aria-hidden="true" /> Donduruldu
                </Badge>
              )}
              <span className="text-xs text-subtle">
                {p.measured_from ? `${formatDateTime(p.measured_from)} itibarıyla ölçülüyor` : ''} · başlangıç {formatCapital(rules.starting_capital_usd)}
              </span>
            </div>
            <p className="mt-2 text-xs font-medium text-muted">Portföy değeri</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <AnimatedNumber value={v.equity_usd} format={(n) => formatUSD(n)} className="num text-3xl font-semibold tracking-tight text-fg sm:text-4xl" />
              <Delta value={v.return_pct} />
              <span className={cn('num text-sm font-medium', v.pnl_usd >= 0 ? 'text-up' : 'text-down')}>
                {v.pnl_usd >= 0 ? '+' : ''}
                {formatUSD(v.pnl_usd)}
              </span>
            </div>
            {v.stale && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gold">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" /> Bazı fiyatlar güncel değil; değer son bilinen fiyatlarla hesaplandı.
              </p>
            )}
          </div>
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Nakit</dt>
              <dd className="font-semibold text-fg">{formatUSD(v.cash_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Ödenen maliyet</dt>
              <dd className="font-semibold text-fg">{formatUSD(v.commission_paid_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">İşlem maliyeti</dt>
              <dd className="font-semibold text-fg">{formatCommission(rules.commission_bps)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-12">
        <AllocationDonut
          className="xl:col-span-5"
          byAsset={assetSlices(v.holdings, v.cash_weight)}
          byClass={classSlices(v.by_class)}
          centerValue={fmtPct(v.return_pct, { sign: true, digits: 2 })}
          centerLabel="lig getirisi"
        />
        <Card className="min-w-0 overflow-hidden xl:col-span-7">
          <CardHeader
            title="Pozisyonlar"
            description={p.target_weights ? 'Hedef ve güncel ağırlık · sapma (puan)' : 'Güncel ağırlıklar'}
            action={
              canTrade ? (
                <Button size="sm" variant="secondary" onClick={() => setRebalanceOpen(true)}>
                  Dengele
                </Button>
              ) : undefined
            }
          />
          <HoldingsTable
            className="pb-4"
            holdings={v.holdings}
            cashUsd={v.cash_usd}
            cashWeight={v.cash_weight}
            targetCashWeight={v.target_cash_weight}
            showTargets={!!p.target_weights}
            onSelect={canTrade ? selectHolding : undefined}
          />
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-12">
        <Card className="min-w-0 xl:col-span-5" id="pl-islem">
          <CardHeader title="Al / sat" description={team ? 'Takımın her üyesi işlem yapabilir; işlemi yapan kaydedilir' : 'Tutar (USD) ya da miktarla, güncel fiyattan'} />
          <CardBody className="pt-0">
            {canTrade ? (
              <TradeForm
                cashUsd={v.cash_usd}
                commissionBps={rules.commission_bps}
                holdings={tradeHoldings}
                search={sandboxApi.assets}
                preset={preset}
                onSubmit={async (req) => {
                  await portfolioLeagueApi.trade(leagueId, req);
                  toast.success(`${req.symbol} ${req.side === 'buy' ? 'alındı' : 'satıldı'}`);
                  onChanged();
                }}
              />
            ) : (
              <p className="text-sm text-muted">{me.trade_block_reason ?? 'Bu portföyde artık işlem yapılamaz.'}</p>
            )}
          </CardBody>
        </Card>
        <Card className="min-w-0 overflow-hidden xl:col-span-7">
          <CardHeader title="İşlem geçmişi" description={team ? 'Son işlemler · işlemi yapan takım üyesiyle' : 'Son işlemler'} />
          {p.trades.length === 0 ? (
            <EmptyState className="border-t border-line" icon={<BriefcaseIcon />} title="Henüz işlem yok" description="İlk alımını yaptığında burada görünür." />
          ) : (
            <DataTable label="İşlem geçmişi" className="pb-3" tableClassName="min-w-[20rem]">
              <THead>
                <Th>İşlem</Th>
                <Th align="right">Tutar</Th>
                <Th className="hidden sm:table-cell">Yapan</Th>
                <Th align="right" className="hidden md:table-cell">
                  Zaman
                </Th>
              </THead>
              <TBody>
                {p.trades.map((t) => (
                  <tr key={t.id}>
                    <Td className="min-w-[9rem]">
                      <p className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className={cn('text-xs font-semibold', t.side === 'buy' ? 'text-up' : 'text-down')}>{t.side === 'buy' ? 'AL' : 'SAT'}</span>
                        <span className="font-medium text-fg">{t.symbol}</span>
                        <span className="num text-xs text-subtle">× {formatQuantity(t.quantity)}</span>
                        {t.reason === 'rebalance' && <span className="text-[11px] text-muted">(dengeleme)</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted sm:hidden">
                        {t.is_me ? 'Sen' : (t.actor_username ?? '—')} · {formatDateTime(t.created_at)}
                      </p>
                    </Td>
                    <Td align="right" className="num whitespace-nowrap">
                      <span className="text-fg">{formatUSD(t.gross_usd)}</span>
                      <span className="block text-[11px] text-subtle">maliyet {formatUSD(t.commission_usd)}</span>
                    </Td>
                    <Td className="hidden whitespace-nowrap sm:table-cell">
                      {t.is_me ? <Badge tone="brand">Sen</Badge> : <span className="text-fg">{t.actor_username ?? '—'}</span>}
                    </Td>
                    <Td align="right" className="hidden whitespace-nowrap text-muted md:table-cell">
                      {formatDateTime(t.created_at)}
                    </Td>
                  </tr>
                ))}
              </TBody>
            </DataTable>
          )}
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader title="Risk ve çeşitlendirme" description="Sade dille metrikler (sıralamadaki risk ölçüleri lig dönemindeki gerçekleşen değerden hesaplanır)" />
        <CardBody className="pt-0">
          <MetricsGrid metrics={p.metrics} />
        </CardBody>
      </Card>

      <SandboxDisclaimer className="justify-center text-center" text="Sanal USD portföy · lig yarışması · yatırım tavsiyesi değildir" />

      {rebalanceOpen && (
        <LeagueRebalanceModal
          leagueId={leagueId}
          valuation={v}
          target={p.target_weights}
          commissionLabel={formatCommission(rules.commission_bps)}
          onClose={() => setRebalanceOpen(false)}
          onDone={() => {
            toast.success('Portföy dengelendi');
            onChanged();
          }}
        />
      )}
    </div>
  );
}
