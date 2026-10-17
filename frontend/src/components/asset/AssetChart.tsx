'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { IChartApi, ISeriesApi, MouseEventParams, Time, UTCTimestamp } from 'lightweight-charts';
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/react/20/solid';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { useMarketHistory } from '@/hooks/useMarketHistory';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { MarketRange } from '@/lib/api';
import { cn, formatMoney } from '@portfoygo/shared/format';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import type { AssetType } from '@/types';
import { axisPrice, chartFont, cssVar, useDocumentTheme, withAlpha } from './chartTheme';

export const CHART_RANGES: { value: MarketRange; label: string; title: string }[] = [
  { value: '1D', label: '1G', title: '1 gün' },
  { value: '1W', label: '5G', title: '5 gün' },
  { value: '1M', label: '1A', title: '1 ay' },
  { value: '3M', label: '3A', title: '3 ay' },
  { value: '6M', label: '6A', title: '6 ay' },
  { value: 'YTD', label: 'YB', title: 'Yılbaşından bu yana' },
  { value: '1Y', label: '1Y', title: '1 yıl' },
  { value: 'ALL', label: 'Tümü', title: 'Tüm geçmiş' },
];

type ChartStyle = 'area' | 'line';

const RANGE_KEY = 'pg:chart-range';
const STYLE_KEY = 'pg:chart-style';
const DEFAULT_RANGE: MarketRange = '1M';

const isRange = (v: string | null): v is MarketRange => CHART_RANGES.some((r) => r.value === v);
const isIntraday = (r: MarketRange) => r === '1D' || r === '1W';

/* ---------- Biçimlendirme (Türkiye saati) ---------- */

const TZ = 'Europe/Istanbul';
const fmtDay = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const fmtDayTime = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtTick = {
  year: new Intl.DateTimeFormat('tr-TR', { year: 'numeric', timeZone: TZ }),
  month: new Intl.DateTimeFormat('tr-TR', { month: 'short', timeZone: TZ }),
  day: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ }),
  time: new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
};

const toMs = (t: Time) => (typeof t === 'number' ? t * 1000 : typeof t === 'string' ? Date.parse(t) : Date.UTC(t.year, t.month - 1, t.day));

/* ---------- Tam ekran durumu (dış kaynak: document) ---------- */

function subscribeFullscreen(cb: () => void) {
  document.addEventListener('fullscreenchange', cb);
  return () => document.removeEventListener('fullscreenchange', cb);
}
const noopSubscribe = () => () => {};

interface Props {
  type: AssetType;
  symbol: string;
  coinId?: string;
  usdTry: number | null;
  /** Görüntüleme birimi (TL / USD tercihi); seri gerekirse güncel USD/TRY ile çevrilir. Varsayılan TL. */
  displayCurrency?: 'TRY' | 'USD';
  /** Tam ekranda başlıkta gösterilecek metin (ör. "AAPL · Apple Inc.") */
  title?: string;
  className?: string;
}

const segBtn = (active: boolean) =>
  cn(
    'num h-8 shrink-0 rounded-md px-2.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm',
    active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
  );

/**
 * TradingView tarzı fiyat grafiği (TailAdmin kartı içinde): aralık düğmeleri, alan/çizgi stili,
 * tam ekran ve artı imleç ipucu. Grafik bir kez oluşturulur; aralık/tema/stil değişince yalnızca
 * seri verisi ve seçenekleri güncellenir.
 */
export default function AssetChart({ type, symbol, coinId, usdTry, displayCurrency = 'TRY', title, className }: Props) {
  const cardId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPriceRef = useRef<HTMLSpanElement>(null);
  const tipDateRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  /** İpucu ve eksen biçimlendiricilerinin okuduğu güncel ayarlar (effect içinde güncellenir) */
  const fmtRef = useRef<{ currency: 'TRY' | 'USD'; intraday: boolean }>({ currency: 'TRY', intraday: false });
  const [chartReady, setChartReady] = useState(false);

  const [storedRange, setStoredRange] = useLocalStorage(RANGE_KEY);
  const [storedStyle, setStoredStyle] = useLocalStorage(STYLE_KEY);
  const range: MarketRange = isRange(storedRange) ? storedRange : DEFAULT_RANGE;
  const style: ChartStyle = storedStyle === 'line' ? 'line' : 'area';

  const docTheme = useDocumentTheme();
  const history = useMarketHistory(type, symbol, range, coinId);

  // Seri, görüntüleme birimine güncel kurla çevrilir (USD kotasyonlu → TL ya da TL kotasyonlu → USD);
  // kur yoksa kaynağın kendi biriminde gösterilir
  const rate = usdTry && usdTry > 0 ? usdTry : null;
  const convert = history.currency !== displayCurrency && !!rate;
  const currency: 'TRY' | 'USD' = convert ? displayCurrency : history.currency;
  const factor = !convert || !rate ? 1 : displayCurrency === 'TRY' ? rate : 1 / rate;
  const data = useMemo(() => history.points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v * factor })), [history.points, factor]);

  const hasData = data.length > 1;
  const first = hasData ? data[0].value : null;
  const last = hasData ? data[data.length - 1].value : null;
  const rangeChange = first && last != null ? ((last - first) / first) * 100 : null;
  const rising = rangeChange == null || rangeChange >= 0;
  const money = (v: number | null) => formatMoney(v, currency, { precise: true });

  const fullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement?.id === cardId,
    () => false,
  );
  const canFullscreen = useSyncExternalStore(
    noopSubscribe,
    () => document.fullscreenEnabled === true,
    () => false,
  );

  // 1) Grafiği bir kez oluştur, bileşen ayrılırken yok et
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let chart: IChartApi | null = null;

    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.opacity = '0';
    };

    const onMove = (param: MouseEventParams<Time>) => {
      const tip = tipRef.current;
      const series = seriesRef.current;
      if (!tip || !series || !param.point || param.time === undefined) return hideTip();
      const point = param.seriesData.get(series) as { value?: number } | undefined;
      if (!point || typeof point.value !== 'number') return hideTip();

      const { currency: cur, intraday } = fmtRef.current;
      if (tipPriceRef.current) tipPriceRef.current.textContent = formatMoney(point.value, cur, { precise: true });
      if (tipDateRef.current) tipDateRef.current.textContent = (intraday ? fmtDayTime : fmtDay).format(toMs(param.time));

      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const maxX = el.clientWidth - w - 4;
      let x = param.point.x + 14;
      if (x > maxX) x = param.point.x - w - 14;
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
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.08 } },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          tickMarkFormatter: (time: Time, kind: number) => {
            const ms = toMs(time);
            if (kind === lc.TickMarkType.Year) return fmtTick.year.format(ms);
            if (kind === lc.TickMarkType.Month) return fmtTick.month.format(ms);
            if (kind === lc.TickMarkType.DayOfMonth) return fmtTick.day.format(ms);
            return fmtTick.time.format(ms);
          },
        },
        crosshair: { mode: lc.CrosshairMode.Magnet, vertLine: { labelVisible: false, style: lc.LineStyle.Dashed }, horzLine: { style: lc.LineStyle.Dashed } },
        localization: {
          locale: 'tr-TR',
          priceFormatter: axisPrice,
          timeFormatter: (time: Time) => (fmtRef.current.intraday ? fmtDayTime : fmtDay).format(toMs(time)),
        },
      });
      seriesRef.current = chart.addSeries(lc.AreaSeries, {
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderWidth: 2,
        priceFormat: { type: 'custom', formatter: axisPrice, minMove: 0.000001 },
      });
      chart.subscribeCrosshairMove(onMove);
      chartRef.current = chart;
      setChartReady(true);
    });

    return () => {
      disposed = true;
      if (chart) {
        chart.unsubscribeCrosshairMove(onMove);
        chart.remove();
      }
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 2) Tema / yön / stil → renkler (grafik yeniden kurulmaz)
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chartReady || !chart || !series) return;
    const color = cssVar(rising ? '--up' : '--down');
    const lineStrong = cssVar('--line-strong');
    chart.applyOptions({
      layout: { textColor: cssVar('--muted') },
      grid: { horzLines: { color: cssVar('--line') } },
      crosshair: {
        vertLine: { color: lineStrong, labelBackgroundColor: cssVar('--fg') },
        horzLine: { color: lineStrong, labelBackgroundColor: cssVar('--fg') },
      },
    });
    series.applyOptions({
      lineColor: color,
      topColor: style === 'area' ? withAlpha(color, 0.2) : 'transparent',
      bottomColor: style === 'area' ? withAlpha(color, 0) : 'transparent',
      crosshairMarkerBorderColor: cssVar('--surface'),
      crosshairMarkerBackgroundColor: color,
    });
  }, [chartReady, docTheme, rising, style]);

  // 3) Veri / aralık → seri verisi
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chartReady || !chart || !series) return;
    const intraday = isIntraday(range);
    fmtRef.current = { currency, intraday };
    series.setData(data);
    chart.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    chart.timeScale().fitContent();
  }, [chartReady, data, range, currency]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void cardRef.current?.requestFullscreen().catch(() => {});
  }, []);

  const rangeTitle = CHART_RANGES.find((r) => r.value === range)?.title ?? '';
  const summary = hasData ? `${symbol} fiyat grafiği, ${rangeTitle}: ${money(first)} → ${money(last)}` : `${symbol} fiyat grafiği`;

  return (
    <div
      ref={cardRef}
      id={cardId}
      className={cn('flex min-w-0 flex-col overflow-hidden bg-surface', fullscreen ? 'h-full w-full p-4 sm:p-6' : 'rounded-2xl border border-line', className)}
    >
      {/* Başlık + stil / tam ekran */}
      <div className={cn('flex items-start justify-between gap-4', !fullscreen && 'px-5 pt-5 sm:px-6 sm:pt-6')}>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-fg">{fullscreen && title ? title : 'Fiyat grafiği'}</h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {rangeChange != null ? (
              <>
                <Delta value={rangeChange} />
                <span>{rangeTitle}</span>
              </>
            ) : (
              <span>{rangeTitle}</span>
            )}
            <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-muted">{currency}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div role="group" aria-label="Grafik stili" className="flex items-center gap-0.5 rounded-lg bg-surface-3 p-0.5">
            {(
              [
                ['area', 'Alan'],
                ['line', 'Çizgi'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={style === value} onClick={() => setStoredStyle(value)} className={segBtn(style === value)}>
                {label}
              </button>
            ))}
          </div>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
              title={fullscreen ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              {fullscreen ? <ArrowsPointingInIcon className="h-4 w-4" aria-hidden="true" /> : <ArrowsPointingOutIcon className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Aralık seçici (segmented control) */}
      <div className={cn('mt-4', !fullscreen && 'px-5 sm:px-6')}>
        <div role="group" aria-label="Grafik aralığı" className="scrollbar-none flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-3 p-0.5">
          {CHART_RANGES.map((r) => (
            <button key={r.value} type="button" aria-pressed={r.value === range} title={r.title} onClick={() => setStoredRange(r.value)} className={segBtn(r.value === range)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grafik alanı: kapsayıcı her zaman DOM'da kalır, durumlar üstüne bindirilir */}
      <div className={cn('relative', fullscreen ? 'mt-4 min-h-0 flex-1' : 'mx-2 mt-3 h-[260px] sm:mx-3 sm:h-[360px] lg:h-[400px]')}>
        <div
          ref={containerRef}
          role="img"
          aria-label={summary}
          className={cn('absolute inset-0 transition-opacity duration-200', !hasData && 'invisible', history.isValidating && 'opacity-60')}
        />
        <div
          ref={tipRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs opacity-0 shadow-pop transition-opacity duration-100"
        >
          <span ref={tipPriceRef} className="num block font-semibold text-fg" />
          <span ref={tipDateRef} className="block text-muted" />
        </div>

        {history.isLoading && (
          <div className="absolute inset-0 p-3">
            <Skeleton className="h-full w-full rounded-xl" />
            <span className="sr-only" role="status">Grafik yükleniyor…</span>
          </div>
        )}
        {!history.isLoading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState
              icon={<ChartBarIcon />}
              title="Grafik verisi şu an mevcut değil"
              description={
                range === '1D'
                  ? 'Bu varlık için gün içi veri yok. Daha uzun bir aralık seçebilirsin.'
                  : 'Bu varlık ve aralık için geçmiş fiyat verisi alınamadı. Başka bir aralık seçebilir ya da birazdan tekrar deneyebilirsin.'
              }
            />
          </div>
        )}
      </div>

      {!fullscreen && (
        <p className="px-5 pb-4 pt-1 text-xs text-subtle sm:px-6">
          {convert
            ? history.currency === 'USD'
              ? 'Geçmiş fiyatlar USD cinsinden alınır ve güncel USD/TRY kuruyla TL’ye çevrilir.'
              : 'Geçmiş fiyatlar TL cinsinden alınır ve güncel USD/TRY kuruyla USD’ye çevrilir.'
            : history.currency !== displayCurrency
              ? `Kur bilgisi alınamadığı için grafik ${history.currency === 'USD' ? 'USD' : 'TL'} cinsindendir.`
              : history.currency === 'USD'
                ? 'Fiyatlar ABD doları cinsindendir.'
                : 'Fiyatlar Türk lirası cinsindendir.'}
          {history.source === 'fallback' && ' Kaynak: CoinGecko.'}
        </p>
      )}
    </div>
  );
}
