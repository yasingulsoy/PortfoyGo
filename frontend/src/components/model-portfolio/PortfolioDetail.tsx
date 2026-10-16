'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowPathIcon, ExclamationTriangleIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/20/solid';
import { cn, formatDate, formatUSD } from '@portfoygo/shared/format';
import AnimatedNumber from '@portfoygo/shared/ui/AnimatedNumber';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Modal from '@portfoygo/shared/ui/Modal';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { useToast } from '@portfoygo/shared/ui/Toast';
import RowMenu from '@/components/common/RowMenu';
import ConfirmModal from '@/components/leagues/ConfirmModal';
import { modelPortfolioApi, sandboxApi, swrFetcher } from '@/lib/api';
import { useModelHistory, useModelMetrics, useRefreshModel } from '@/hooks/useModelPortfolios';
import useSWR from 'swr';
import AllocationDonut from '@/components/sandbox/AllocationDonut';
import ContributionBars, { type ContributionItem } from '@/components/sandbox/ContributionBars';
import EquityChart from '@/components/sandbox/EquityChart';
import HoldingsTable from '@/components/sandbox/HoldingsTable';
import MetricsGrid from '@/components/sandbox/MetricsGrid';
import SandboxDisclaimer from '@/components/sandbox/SandboxDisclaimer';
import TradeForm, { type TradeAsset } from '@/components/sandbox/TradeForm';
import WhatIfSimulator from '@/components/sandbox/WhatIfSimulator';
import { assetKey, assetSlices, classSlices, fmtPct } from '@/components/sandbox/model';
import type { SandboxBacktest, SandboxHistoryRange, SandboxHolding, SandboxPortfolio, SandboxValuation } from '@/components/sandbox/types';
import ClassPlacementPanel from './ClassPlacementPanel';
import RebalanceModal from './RebalanceModal';
import TradeHistory from './TradeHistory';

const RANGES: { value: SandboxHistoryRange; label: string }[] = [
  { value: '1W', label: '1H' },
  { value: '1M', label: '1A' },
  { value: '3M', label: '3A' },
  { value: 'ALL', label: 'Tümü' },
];

type ChartMode = 'actual' | 'sim';

/** Model Portföy detay ekranı (veri üstten gelir; alt bileşenler sandbox/ ortak bileşenleri). */
export default function PortfolioDetail({ portfolio, valuation }: { portfolio: SandboxPortfolio; valuation: SandboxValuation }) {
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefreshModel();
  const [range, setRange] = useState<SandboxHistoryRange>('1M');
  const [chartMode, setChartMode] = useState<ChartMode>('actual');
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [preset, setPreset] = useState<{ asset: TradeAsset; side?: 'buy' | 'sell'; nonce: number } | null>(null);
  const history = useModelHistory(portfolio.id, range);
  const metrics = useModelMetrics(portfolio.id);
  const backtest = useSWR<SandboxBacktest>(chartMode === 'sim' ? modelPortfolioApi.backtestKey(portfolio.id, 90) : null, swrFetcher, { revalidateOnFocus: false });
  const active = portfolio.status === 'active';
  const v = valuation;

  const contributions: ContributionItem[] = useMemo(
    () => [
      ...v.holdings.map((h) => ({ key: assetKey(h.asset_type, h.symbol), label: h.symbol, sub: h.name, contribution_pct: h.contribution_pct, contribution_usd: h.contribution_usd })),
      ...v.closed.map((c) => ({ key: `closed:${assetKey(c.asset_type, c.symbol)}`, label: c.symbol, sub: c.name, contribution_pct: c.contribution_pct, contribution_usd: c.contribution_usd, closed: true })),
    ],
    [v],
  );
  const whatIf = useMemo(() => v.holdings.map((h) => ({ key: assetKey(h.asset_type, h.symbol), label: `${h.symbol} · ${h.name}`, asset_class: h.asset_class, value_usd: h.value_usd })), [v]);
  const tradeHoldings = useMemo(() => v.holdings.map((h) => ({ asset_type: h.asset_type, symbol: h.symbol, name: h.name, price_usd: h.price_usd, quantity: h.quantity })), [v]);

  const afterChange = async () => {
    await refresh(portfolio.id);
  };

  const selectHolding = (h: SandboxHolding) => {
    setPreset({ asset: { asset_type: h.asset_type, symbol: h.symbol, name: h.name, price_usd: h.price_usd }, side: 'sell', nonce: Date.now() });
    document.getElementById('islem')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Özet */}
      <Card featured>
        <CardBody className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">Model Portföy</Badge>
              {!active && <Badge tone="gold">Donduruldu</Badge>}
              <span className="text-xs text-subtle">{formatDate(portfolio.created_at)} · başlangıç {formatUSD(portfolio.starting_cash)}</span>
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
          <div className="flex flex-wrap items-center gap-2">
            <dl className="num mr-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Nakit</dt>
                <dd className="font-semibold text-fg">{formatUSD(v.cash_usd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Nakit payı</dt>
                <dd className="font-semibold text-fg">{fmtPct(v.cash_weight)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Komisyon</dt>
                <dd className="font-semibold text-fg">{formatUSD(v.commission_paid_usd)}</dd>
              </div>
            </dl>
            {active && (
              <Button variant="secondary" size="md" icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setRebalanceOpen(true)}>
                Yeniden dengele
              </Button>
            )}
            <RowMenu
              label="Portföy işlemleri"
              items={[
                { label: 'Yeniden adlandır', icon: <PencilSquareIcon className="h-4 w-4" />, onSelect: () => setRenameOpen(true) },
                { label: 'Sil', icon: <TrashIcon className="h-4 w-4" />, tone: 'down', onSelect: () => setDeleteOpen(true) },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      {/* Dağılım + ağırlıklar */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-12">
        <AllocationDonut
          className="xl:col-span-5"
          byAsset={assetSlices(v.holdings, v.cash_weight)}
          byClass={classSlices(v.by_class)}
          centerValue={fmtPct(v.return_pct, { sign: true, digits: 2 })}
          centerLabel="toplam getiri"
        />
        <Card className="min-w-0 overflow-hidden xl:col-span-7">
          <CardHeader
            title="Ağırlıklar"
            description={portfolio.target_weights ? 'Hedef ve güncel ağırlık · sapma (puan)' : 'Güncel ağırlıklar (hedef kaydedilmemiş)'}
            action={
              active ? (
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
            showTargets={!!portfolio.target_weights}
            onSelect={active ? selectHolding : undefined}
          />
          {portfolio.target_weights && (
            <p className="px-5 pb-5 text-xs leading-relaxed text-muted sm:px-6">
              Fiyatlar değiştikçe ağırlıklar hedeften kayar (sapma). Yeniden dengeleme kazananlardan satıp geride kalanlardan alarak dağılımı hedefe
              geri getirir; her işlem komisyon doğurur.
            </p>
          )}
        </Card>
      </div>

      {/* Sınıflar + katkı */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Nakit ve varlık sınıflarının yeri" description="Her sınıfın payı ve portföydeki rolü" />
          <CardBody className="pt-0">
            <ClassPlacementPanel byClass={v.by_class} />
          </CardBody>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Toplam portföye etkisi" description="Her varlığın toplam getiriye katkısı (yüzde puan)" />
          <CardBody className="pt-0">
            <ContributionBars items={contributions} totalPct={v.return_pct} />
          </CardBody>
        </Card>
      </div>

      {/* Ne olursa + risk */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Ne olursa?" description="Bir varlık ya da sınıf değişirse portföy ne olur" />
          <CardBody className="pt-0">
            <WhatIfSimulator positions={whatIf} cashUsd={v.cash_usd} />
          </CardBody>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Risk ve çeşitlendirme" description="Sade dille metrikler" />
          <CardBody className="pt-0">
            {metrics.data ? (
              <MetricsGrid metrics={metrics.data} />
            ) : metrics.error ? (
              <Alert tone="error">Metrikler yüklenemedi.</Alert>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Değer grafiği */}
      <Card className="min-w-0">
        <CardHeader
          title="Portföy değeri"
          description={chartMode === 'actual' ? 'Gerçekleşen değer (saatlik / günlük kayıt)' : 'Bugünkü pozisyonlar 90 gün önce alınsaydı (simülasyon)'}
          action={
            <Tabs
              label="Grafik türü"
              value={chartMode}
              onChange={setChartMode}
              items={[
                { value: 'actual', label: 'Gerçekleşen' },
                { value: 'sim', label: '90 gün sim.' },
              ]}
            />
          }
        />
        <CardBody className="pt-0">
          {chartMode === 'actual' && (
            <Tabs label="Aralık" value={range} onChange={setRange} items={RANGES} className="mb-3 w-fit" />
          )}
          {chartMode === 'actual' ? (
            history.data ? (
              <EquityChart
                series={[{ id: 'p', label: portfolio.name, colorVar: (history.data.change_pct ?? 0) >= 0 ? '--up' : '--down', points: history.data.points }]}
                baseline={portfolio.starting_cash}
                intraday={range === '1W'}
              />
            ) : (
              <Skeleton className="h-[300px] w-full" />
            )
          ) : backtest.data ? (
            <>
              <EquityChart series={[{ id: 'sim', label: 'Simülasyon', colorVar: '--brand', points: backtest.data.points }]} baseline={null} emptyDescription="Bu varlıklar için yeterli fiyat geçmişi yok." />
              {backtest.data.missing.length > 0 && (
                <p className="mt-2 text-xs text-muted">Geçmişi olmayan varlıklar sabit değerde varsayıldı: {backtest.data.missing.join(', ')}.</p>
              )}
            </>
          ) : (
            <Skeleton className="h-[300px] w-full" />
          )}
        </CardBody>
      </Card>

      {/* İşlem + geçmiş */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-12">
        <Card className="min-w-0 xl:col-span-5" id="islem">
          <CardHeader title="Al / sat" description="Tutar (USD) ya da miktarla, güncel fiyattan" />
          <CardBody className="pt-0">
            {active ? (
              <TradeForm
                cashUsd={v.cash_usd}
                commissionBps={portfolio.commission_bps}
                holdings={tradeHoldings}
                search={sandboxApi.assets}
                preset={preset}
                onSubmit={async (req) => {
                  await modelPortfolioApi.trade(portfolio.id, req);
                  await afterChange();
                }}
              />
            ) : (
              <p className="text-sm text-muted">Bu portföy donduruldu; işlem yapılamaz.</p>
            )}
          </CardBody>
        </Card>
        <Card className="min-w-0 overflow-hidden xl:col-span-7">
          <CardHeader title="İşlem geçmişi" description="Kurulum, dengeleme ve manuel işlemler" />
          <TradeHistory portfolioId={portfolio.id} />
        </Card>
      </div>

      <SandboxDisclaimer className="justify-center text-center" />

      {rebalanceOpen && (
        <RebalanceModal
          open
          onClose={() => setRebalanceOpen(false)}
          portfolio={portfolio}
          valuation={v}
          onDone={() => {
            toast.success('Portföy yeniden dengelendi');
            void afterChange();
          }}
        />
      )}
      {renameOpen && <RenameModal portfolio={portfolio} onClose={() => setRenameOpen(false)} onDone={afterChange} />}
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Model portföy silinsin mi?"
        confirmLabel="Sil"
        onConfirm={async () => {
          await modelPortfolioApi.remove(portfolio.id);
          await refresh();
          toast.success('Model portföy silindi');
          router.replace('/model-portfoy');
        }}
      >
        <p className="text-sm text-muted">
          <span className="font-medium text-fg">{portfolio.name}</span> ve tüm işlem geçmişi kalıcı olarak silinir. Bu işlem geri alınamaz.
        </p>
      </ConfirmModal>
    </div>
  );
}

function RenameModal({ portfolio, onClose, onDone }: { portfolio: SandboxPortfolio; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState(portfolio.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await modelPortfolioApi.rename(portfolio.id, trimmed);
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Yeniden adlandır"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy} disabled={!trimmed || trimmed === portfolio.name}>
            Kaydet
          </Button>
        </div>
      }
    >
      <Field label="Portföy adı" value={name} maxLength={60} data-autofocus onChange={(e) => setName(e.target.value)} />
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
