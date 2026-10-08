'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useTheme } from 'next-themes';
import { ChartBarIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { historyApi, swrFetcher, type HistoryRange } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn, formatDate, formatDateTime, formatTRY } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Delta, Money } from '@/components/ui/Delta';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import Tabs from '@/components/ui/Tabs';

export interface HistoryPoint {
  /** Unix zaman damgası (saniye, UTC) */
  t: number;
  value: number;
  cash: number;
  holdings: number;
}

export interface PortfolioHistory {
  range: HistoryRange;
  points: HistoryPoint[];
  change: number;
  changePercent: number;
  startValue: number;
  endValue: number;
}

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '1W', label: '1H' },
  { value: '1M', label: '1A' },
  { value: '3M', label: '3A' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'Tümü' },
];

const RANGE_CAPTION: Record<HistoryRange, string> = {
  '1W': 'son 1 hafta',
  '1M': 'son 1 ay',
  '3M': 'son 3 ay',
  '1Y': 'son 1 yıl',
  ALL: 'başlangıçtan bu yana',
};

const EMPTY_POINTS: HistoryPoint[] = [];

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** lightweight-charts zamanları UTC gösterir; tarayıcının yerel saatine kaydır. */
const toChartTime = (t: number) => t - new Date(t * 1000).getTimezoneOffset() * 60;

type ChartHandle = { chart: IChartApi; series: ISeriesApi<'Area'> };

function paint(handle: ChartHandle, points: HistoryPoint[], up: boolean) {
  const color = cssVar(up ? '--up' : '--down');
  handle.series.applyOptions({ lineColor: color, topColor: color + '33', bottomColor: color + '00' });
  handle.series.setData(points.map((p) => ({ time: toChartTime(p.t) as never, value: p.value })));
  handle.chart.timeScale().fitContent();
}

interface Props {
  /** Dashboard özet kartı için sade sürüm (kart çerçevesi, fiyat ve zaman ekseni yok) */
  compact?: boolean;
  className?: string;
}

/** Portföyün toplam değerinin zaman içindeki seyri (GET /portfolio/history). */
export default function PerformanceChart({ compact = false, className }: Props) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [range, setRange] = useState<HistoryRange>('1M');
  const [hover, setHover] = useState<HistoryPoint | null>(null);

  const key = user ? ([historyApi.key(range), user.id] as const) : null;
  const { data, error, isLoading } = useSWR<PortfolioHistory>(key, ([url]: readonly [string, string]) => swrFetcher<PortfolioHistory>(url), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    refreshInterval: 5 * 60_000,
  });

  const points = data?.points ?? EMPTY_POINTS;
  const hasData = points.length >= 2;
  const up = (data?.change ?? 0) >= 0;
  const height = compact ? 132 : 280;

  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ChartHandle | null>(null);
  const latest = useRef({ points, up });

  // Grafik örneği: veri varken bir kez oluşturulur; tema / yoğunluk değişince yeniden kurulur
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasData) return;
    let disposed = false;
    let chart: IChartApi | null = null;

    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      chart = lc.createChart(el, {
        height,
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: cssVar('--subtle'), fontFamily: 'var(--font-geist-sans)', attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: !compact, color: cssVar('--line') } },
        rightPriceScale: { visible: !compact, borderVisible: false },
        timeScale: { visible: !compact, borderVisible: false, timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: lc.CrosshairMode.Magnet,
          vertLine: { labelVisible: !compact },
          horzLine: { visible: !compact, labelVisible: !compact },
        },
        handleScroll: false,
        handleScale: false,
        localization: { locale: 'tr-TR', priceFormatter: (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) },
      });
      const series = chart.addSeries(lc.AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: !compact });
      const handle = { chart, series };
      handleRef.current = handle;
      paint(handle, latest.current.points, latest.current.up);

      chart.subscribeCrosshairMove((param) => {
        if (param.time === undefined || !param.point) {
          setHover(null);
          return;
        }
        const match = latest.current.points.find((p) => toChartTime(p.t) === param.time);
        setHover(match ?? null);
      });
    });

    return () => {
      disposed = true;
      handleRef.current = null;
      chart?.remove();
    };
  }, [hasData, compact, height, resolvedTheme]);

  // Yeni veri (aralık değişimi / periyodik yenileme): grafiği yeniden kurmadan güncelle
  useEffect(() => {
    latest.current = { points, up };
    if (handleRef.current && points.length >= 2) paint(handleRef.current, points, up);
  }, [points, up]);

  const caption = hover ? (range === '1W' ? formatDateTime(hover.t * 1000) : formatDate(hover.t * 1000)) : RANGE_CAPTION[range];
  const shownValue = hover?.value ?? data?.endValue ?? 0;
  const startValue = data?.startValue ?? 0;
  const shownChange = hover ? hover.value - startValue : (data?.change ?? 0);
  const shownPct = hover ? (startValue > 0 ? ((hover.value - startValue) / startValue) * 100 : 0) : (data?.changePercent ?? 0);

  const tabs = <Tabs label="Performans aralığı" items={RANGES} value={range} onChange={setRange} className="self-start" />;

  let body: React.ReactNode;
  if (!data && (isLoading || !user)) {
    body = <Skeleton className="h-full w-full rounded-xl" />;
  } else if (error && !data) {
    body = (
      <EmptyState
        className="h-full py-6"
        icon={compact ? undefined : <ChartBarIcon />}
        title="Performans verisi yüklenemedi"
        description={compact ? undefined : 'Birazdan otomatik olarak yeniden denenecek.'}
      />
    );
  } else if (!hasData) {
    body = (
      <EmptyState
        className="h-full py-6"
        icon={compact ? undefined : <ClockIcon />}
        title="Geçmiş veri birikiyor — ilk anlık görüntü bir saat içinde alınır"
        description={compact ? undefined : 'Portföy değerin her saat kaydedilir; grafik noktalar biriktikçe dolar.'}
      />
    );
  } else {
    body = <div ref={containerRef} className="h-full w-full" />;
  }

  const summary = data && hasData && (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Delta value={shownPct} />
      <Money value={shownChange} signed className="font-medium" />
      <span className="text-subtle">{caption}</span>
    </div>
  );

  if (compact) {
    return (
      <section className={cn('min-w-0', className)} aria-label="Portföy performansı">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">Performans</h3>
            {hover && <span className="num text-sm font-semibold">{formatTRY(hover.value)}</span>}
            {summary}
          </div>
          {tabs}
        </div>
        <div className="mt-3" style={{ height }}>
          {body}
        </div>
      </section>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">Portföy performansı</p>
          {data ? (
            <>
              <p className="num mt-2 truncate text-3xl font-semibold tracking-tight">{formatTRY(shownValue)}</p>
              <div className="mt-2">{summary}</div>
            </>
          ) : (
            <>
              <Skeleton className="mt-3 h-9 w-48" />
              <Skeleton className="mt-2 h-5 w-40" />
            </>
          )}
        </div>
        {tabs}
      </div>
      <div className="px-2 pb-4 sm:px-4" style={{ height: height + 16 }}>
        {body}
      </div>
    </Card>
  );
}
