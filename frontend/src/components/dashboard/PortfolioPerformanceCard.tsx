'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { IChartApi, ISeriesApi, MouseEventParams, Time, UTCTimestamp } from 'lightweight-charts';
import { ChartBarIcon, ClockIcon } from '@heroicons/react/24/outline';
import { historyApi, swrFetcher, type HistoryRange } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLivePortfolio } from '@/context/PortfolioContext';
import type { PortfolioHistory } from '@/components/portfolio/PerformanceChart';
import { chartFont, cssVar, useDocumentTheme, withAlpha } from '@/components/asset/chartTheme';
import { STARTING_BALANCE } from '@/lib/constants';
import { cn } from '@portfoygo/shared/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import AnimatedNumber from '@portfoygo/shared/ui/AnimatedNumber';

type Range = Extract<HistoryRange, '1M' | '3M' | '1Y' | 'ALL'>;

const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1A' },
  { value: '3M', label: '3A' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'Tümü' },
];

const CAPTION: Record<Range, string> = {
  '1M': 'son 1 ay',
  '3M': 'son 3 ay',
  '1Y': 'son 1 yıl',
  ALL: 'başlangıçtan bu yana',
};

const TZ = 'Europe/Istanbul';
const fmt = {
  tip: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }),
  year: new Intl.DateTimeFormat('tr-TR', { year: 'numeric', timeZone: TZ }),
  month: new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit', timeZone: TZ }),
  day: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ }),
  time: new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
};
const toMs = (t: Time) => (typeof t === 'number' ? t * 1000 : typeof t === 'string' ? Date.parse(t) : Date.UTC(t.year, t.month - 1, t.day));

/**
 * Panel: "Portföy performansı" kartı (TailAdmin "Portfolio Performance").
 * Toplam varlık + seçilen aralıktaki değişim ve portföy değerinin alan grafiği (GET /portfolio/history).
 */
export default function PortfolioPerformanceCard({ className }: { className?: string }) {
  const { user } = useAuth();
  const { totals, loaded } = useLivePortfolio();
  const dc = useDisplayCurrency();
  // Grafik bir kez kurulur; ipucu biçimlendiricisi güncel görüntüleme birimini ref'ten okur
  const moneyRef = useRef(dc.money);
  useEffect(() => {
    moneyRef.current = dc.money;
  });
  const docTheme = useDocumentTheme();
  const [range, setRange] = useState<Range>('1M');

  const key = user ? ([historyApi.key(range), user.id] as const) : null;
  const { data, error, isLoading, isValidating } = useSWR<PortfolioHistory>(key, ([url]: readonly [string, string]) => swrFetcher<PortfolioHistory>(url), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    refreshInterval: 5 * 60_000,
  });

  const series = useMemo(() => {
    const seen = new Map<number, number>();
    for (const p of data?.points ?? []) if (Number.isFinite(p.t) && Number.isFinite(p.value)) seen.set(Math.floor(p.t), p.value);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([t, value]) => ({ time: t as UTCTimestamp, value }));
  }, [data]);
  const hasData = series.length >= 2;

  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipValueRef = useRef<HTMLSpanElement>(null);
  const tipDateRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<{ chart: IChartApi; series: ISeriesApi<'Area'> } | null>(null);
  const [ready, setReady] = useState(false);

  // Grafik bir kez kurulur (veri ilk geldiğinde); veri ve tema değişince yalnızca güncellenir
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasData) return;
    let disposed = false;
    let chart: IChartApi | null = null;

    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.opacity = '0';
    };
    const onMove = (param: MouseEventParams<Time>) => {
      const tip = tipRef.current;
      const s = chartRef.current?.series;
      if (!tip || !s || !param.point || param.time === undefined) return hideTip();
      const point = param.seriesData.get(s) as { value?: number } | undefined;
      if (!point || typeof point.value !== 'number') return hideTip();
      if (tipValueRef.current) tipValueRef.current.textContent = moneyRef.current(point.value);
      if (tipDateRef.current) tipDateRef.current.textContent = fmt.tip.format(toMs(param.time));
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let x = param.point.x + 14;
      if (x > el.clientWidth - w - 4) x = param.point.x - w - 14;
      const y = Math.min(Math.max(param.point.y - h - 12, 4), el.clientHeight - h - 4);
      tip.style.transform = `translate(${Math.max(4, x)}px, ${y}px)`;
      tip.style.opacity = '1';
    };

    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      chart = lc.createChart(el, {
        autoSize: true,
        layout: { background: { color: 'transparent' }, fontFamily: chartFont(), fontSize: 11, attributionLogo: false },
        grid: { vertLines: { visible: false } },
        leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.06 } },
        rightPriceScale: { visible: false },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          tickMarkFormatter: (time: Time, kind: number) => {
            const ms = toMs(time);
            if (kind === lc.TickMarkType.Year) return fmt.year.format(ms);
            if (kind === lc.TickMarkType.Month) return fmt.month.format(ms);
            if (kind === lc.TickMarkType.DayOfMonth) return fmt.day.format(ms);
            return fmt.time.format(ms);
          },
        },
        crosshair: {
          mode: lc.CrosshairMode.Magnet,
          vertLine: { labelVisible: false, style: lc.LineStyle.Dashed },
          horzLine: { visible: false, labelVisible: false },
        },
        handleScroll: false,
        handleScale: false,
        localization: { locale: 'tr-TR', priceFormatter: (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(p) >= 1000 ? 0 : 2 }) },
      });
      const s = chart.addSeries(lc.AreaSeries, {
        lineWidth: 2,
        priceScaleId: 'left',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderWidth: 2,
      });
      chart.subscribeCrosshairMove(onMove);
      chartRef.current = { chart, series: s };
      setReady(true);
    });

    return () => {
      disposed = true;
      if (chart) {
        chart.unsubscribeCrosshairMove(onMove);
        chart.remove();
      }
      chartRef.current = null;
      setReady(false);
    };
  }, [hasData]);

  // Tema → renkler
  useEffect(() => {
    const h = chartRef.current;
    if (!ready || !h) return;
    const brand = cssVar('--brand');
    h.chart.applyOptions({
      layout: { textColor: cssVar('--muted') },
      grid: { horzLines: { color: cssVar('--line') } },
      crosshair: { vertLine: { color: cssVar('--line-strong') } },
    });
    h.series.applyOptions({
      lineColor: brand,
      topColor: withAlpha(brand, 0.22),
      bottomColor: withAlpha(brand, 0),
      crosshairMarkerBackgroundColor: brand,
      crosshairMarkerBorderColor: cssVar('--surface'),
    });
  }, [ready, docTheme]);

  // Veri → seri
  useEffect(() => {
    const h = chartRef.current;
    if (!ready || !h || series.length < 2) return;
    h.series.setData(series);
    h.chart.timeScale().fitContent();
  }, [ready, series]);

  const allTimeChange = totals.netWorth - STARTING_BALANCE;
  const change = range === 'ALL' || !data ? allTimeChange : data.change;
  const changePct = range === 'ALL' || !data ? (allTimeChange / STARTING_BALANCE) * 100 : data.changePercent;

  let overlay: React.ReactNode = null;
  if (!data && (isLoading || !user)) {
    overlay = <Skeleton className="h-full w-full rounded-xl" />;
  } else if (error && !data) {
    overlay = <EmptyState className="h-full" icon={<ChartBarIcon />} title="Performans verisi yüklenemedi" description="Birazdan otomatik olarak yeniden denenecek." />;
  } else if (!hasData) {
    overlay = (
      <EmptyState
        className="h-full"
        icon={<ClockIcon />}
        title="Geçmiş veri birikiyor"
        description="Portföy değerin her saat kaydedilir; grafik noktalar biriktikçe dolar."
      />
    );
  }

  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title="Portföy performansı"
        description="Toplam varlığının zaman içindeki seyri"
        action={<Tabs label="Performans aralığı" items={RANGES} value={range} onChange={setRange} className="max-sm:hidden" />}
      />
      <div className="px-5 sm:px-6">
        <Tabs label="Performans aralığı" items={RANGES} value={range} onChange={setRange} className="mb-4 w-fit sm:hidden" />
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          {loaded ? (
            <>
              <p className="text-3xl font-semibold tracking-tight text-fg">
                <AnimatedNumber value={totals.netWorth} format={(n) => dc.money(n)} />
              </p>
              <div className="flex flex-wrap items-center gap-2 pb-1 text-sm">
                <Delta value={changePct} />
                <Money value={dc.convert(change)} currency={dc.currency} signed className="font-medium" />
                <span className="text-subtle">{CAPTION[range]}</span>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-5 w-40" />
            </>
          )}
        </div>
      </div>

      <div className="relative mx-2 mb-3 mt-4 min-h-[240px] flex-1 sm:mx-3 sm:min-h-[300px]">
        <div
          ref={containerRef}
          role="img"
          aria-label={hasData ? `Portföy değeri grafiği, ${CAPTION[range]}` : 'Portföy değeri grafiği'}
          className={cn('absolute inset-0 transition-opacity', !hasData && 'invisible', isValidating && 'opacity-70')}
        />
        <div
          ref={tipRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs opacity-0 shadow-pop transition-opacity duration-100"
        >
          <span ref={tipValueRef} className="num block font-semibold text-fg" />
          <span ref={tipDateRef} className="block text-muted" />
        </div>
        {overlay && <div className="absolute inset-0 px-3">{overlay}</div>}
      </div>
    </Card>
  );
}
