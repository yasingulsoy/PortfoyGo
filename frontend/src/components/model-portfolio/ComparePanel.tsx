'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { InfoTip } from '@/components/advisor/bits';
import { useModelCompare } from '@/hooks/useModelPortfolios';
import EquityChart, { SERIES_COLOR_VARS } from '@/components/sandbox/EquityChart';
import { CLASS_META, CLASS_ORDER, METRIC_EDU, fmtPct, normalizeTo100, seriesChangePct } from '@/components/sandbox/model';
import type { CompareItem } from '@/components/sandbox/types';

type Basis = 'sim' | 'actual';

/** Seçili satırdaki en iyi değeri vurgula: yüksek iyi (getiri, Sharpe, etkin N) / düşük iyi (oynaklık, düşüş) */
function bestIndex(values: (number | null)[], higherIsBetter: boolean): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    if (best === null || (higherIsBetter ? v > (values[best] as number) : v < (values[best] as number))) best = i;
  });
  return values.filter((v) => v !== null).length > 1 ? best : null;
}

/**
 * Alternatif dağılımların karşılaştırılması (≤ 3): yan yana kartlar, 100'e normalleştirilmiş değer eğrileri
 * (90 günlük simülasyon ya da gerçekleşen), getiri / oynaklık / en büyük düşüş / Sharpe / nakit / etkin N ve sınıf karışımı.
 */
export default function ComparePanel({ ids }: { ids: string[] }) {
  const { data, error, isLoading } = useModelCompare(ids);
  const [basis, setBasis] = useState<Basis>('sim');
  const items = useMemo(() => data?.items ?? [], [data]);

  const series = useMemo(
    () =>
      items.map((it, i) => ({
        id: it.portfolio.id,
        label: it.portfolio.name,
        colorVar: SERIES_COLOR_VARS[i % SERIES_COLOR_VARS.length],
        points: normalizeTo100(basis === 'sim' ? it.backtest.points : it.history),
      })),
    [items, basis],
  );

  if (error) return <Alert tone="error">Karşılaştırma yüklenemedi: {error instanceof Error ? error.message : ''}</Alert>;
  if (isLoading && !data) return <Skeleton className="h-96 w-full" />;
  if (items.length === 0) return null;

  const risk = (it: CompareItem) => (basis === 'sim' ? it.metrics.simulated : it.metrics.realized);
  const rows: { label: string; help?: string; values: (number | null)[]; fmt: (v: number | null) => string; higher: boolean | null }[] = [
    {
      label: basis === 'sim' ? '90 gün getirisi (sim.)' : 'Getiri (gerçekleşen)',
      values: items.map((it, i) => (basis === 'sim' ? seriesChangePct(series[i].points) : it.valuation.return_pct)),
      fmt: (v) => fmtPct(v, { sign: true, digits: 2 }),
      higher: true,
    },
    { label: 'Yıllık oynaklık', help: METRIC_EDU.volatility, values: items.map((it) => risk(it)?.volatility_ann ?? null), fmt: (v) => fmtPct(v), higher: false },
    {
      label: 'En büyük düşüş',
      help: METRIC_EDU.max_drawdown,
      values: items.map((it) => risk(it)?.max_drawdown_pct ?? null),
      fmt: (v) => (v === null ? '—' : v === 0 ? '%0,0' : `-${fmtPct(v)}`),
      higher: false,
    },
    {
      label: 'Sharpe',
      help: METRIC_EDU.sharpe,
      values: items.map((it) => risk(it)?.sharpe ?? null),
      fmt: (v) => (v === null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
      higher: true,
    },
    { label: 'Nakit payı', values: items.map((it) => it.valuation.cash_weight), fmt: (v) => fmtPct(v), higher: null },
    {
      label: 'Etkin varlık sayısı',
      help: METRIC_EDU.effective_n,
      values: items.map((it) => it.metrics.effective_n),
      fmt: (v) => (v === null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })),
      higher: true,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="min-w-0">
        <CardHeader
          title="Değer eğrileri (başlangıç = 100)"
          description={basis === 'sim' ? 'Bugünkü dağılımlar son 90 günde tutulsaydı' : 'Oluşturulduklarından bu yana gerçekleşen'}
        />
        <CardBody className="pt-0">
          <Tabs
            className="mb-3 w-fit"
            label="Karşılaştırma tabanı"
            value={basis}
            onChange={setBasis}
            items={[
              { value: 'sim', label: '90 gün sim.' },
              { value: 'actual', label: 'Gerçekleşen' },
            ]}
          />
          <EquityChart
            series={series}
            format="index"
            baseline={100}
            emptyDescription={basis === 'actual' ? 'Gerçekleşen geçmiş birkaç saat içinde oluşur; şimdilik simülasyona bakabilirsin.' : 'Fiyat geçmişi bulunamadı.'}
          />
        </CardBody>
      </Card>

      <div className={cn('grid gap-4 md:gap-6', items.length === 1 ? 'md:grid-cols-1' : items.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
        {items.map((it, i) => (
          <Card key={it.portfolio.id} className="min-w-0">
            <CardBody className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-base font-semibold text-fg">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(${SERIES_COLOR_VARS[i % SERIES_COLOR_VARS.length]})` }} aria-hidden="true" />
                    <Link href={`/model-portfoy/${it.portfolio.id}`} className="truncate hover:text-brand">
                      {it.portfolio.name}
                    </Link>
                  </p>
                  <p className="num mt-1 text-xl font-semibold text-fg">{formatUSD(it.valuation.equity_usd)}</p>
                </div>
                <span className={cn('num text-sm font-semibold', it.valuation.return_pct >= 0 ? 'text-up' : 'text-down')}>
                  {fmtPct(it.valuation.return_pct, { sign: true, digits: 2 })}
                </span>
              </div>
              {/* Sınıf karışımı */}
              <div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                  {CLASS_ORDER.map((c) => {
                    const w = it.valuation.by_class.find((x) => x.asset_class === c)?.weight ?? 0;
                    return w > 0 ? <span key={c} style={{ width: `${w}%`, background: CLASS_META[c].color }} /> : null;
                  })}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-label={`${it.portfolio.name} sınıf karışımı`}>
                  {CLASS_ORDER.map((c) => {
                    const w = it.valuation.by_class.find((x) => x.asset_class === c)?.weight ?? 0;
                    return w > 0 ? (
                      <li key={c} className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[c].color }} aria-hidden="true" />
                        {CLASS_META[c].label} <span className="num font-medium text-fg">{fmtPct(w, { digits: 0 })}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
              <dl className="space-y-1.5 text-sm">
                {rows.map((r) => {
                  const best = r.higher === null ? null : bestIndex(r.values, r.higher);
                  return (
                    <div key={r.label} className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1 text-muted">
                        {r.label}
                        {r.help && (
                          <InfoTip label={r.label} align="start">
                            {r.help}
                          </InfoTip>
                        )}
                      </dt>
                      <dd className={cn('num font-medium', best === i ? 'text-brand' : 'text-fg')}>{r.fmt(r.values[i])}</dd>
                    </div>
                  );
                })}
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-2 text-sm leading-relaxed text-muted">
          <p className="font-medium text-fg">Neye bakmalı?</p>
          <p>
            Getiri tek başına yeterli değildir: aynı getiriyi <span className="text-fg">daha düşük oynaklık ve daha küçük düşüşle</span> sağlayan dağılım
            daha verimlidir (Sharpe bunu ölçer). Nakit ve farklı sınıflar düşüşleri yumuşatır ama beklenen getiriyi de azaltır; etkin varlık sayısı
            yükseldikçe tek bir varlığın portföye etkisi küçülür. Mavi değerler her satırdaki en iyi sonucu gösterir.
          </p>
          {basis === 'sim' && <p className="text-xs">Simülasyon, bugünkü pozisyonların son 90 günlük fiyat geçmişine dayanır; geçmiş performans geleceğin göstergesi değildir.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
