'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import { cn } from '@portfoygo/shared/format';
import { useDocumentTheme, withAlpha } from '@/components/asset/chartTheme';
import { formatClock, formatPrice, tickToElapsedMs, type SeriesPoint } from '@/components/arena/model';
import type { ChartLine, ChartMarker } from '@/components/arena/ArenaChart';

interface Props {
  code: string;
  label: string;
  decimals: number;
  points: SeriesPoint[];
  durationS: number;
  ticksTotal: number;
  markers: ChartMarker[];
  lines: ChartLine[];
  rising: boolean;
  className?: string;
}

const T0 = 1_000_000;
const toTime = (t: number) => (t + T0) as UTCTimestamp;

function snap(points: SeriesPoint[], t: number): number | null {
  if (!points.length) return null;
  if (t <= points[0].t) return points[0].t;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return points[lo].t;
}

/** Oyun derisinin değişkenini (tuval için) kapsayıcı öğeden okur. */
function gameVar(el: Element | null, name: string): string {
  if (!el) return '';
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * Oyun tur grafiği (lightweight-charts alan serisi). ArenaChart ile aynı veri mantığı; renkler
 * [data-skin="game"] altındaki --g-chart-* değişkenlerinden çalışma anında okunur.
 */
export default function GameChart({ code, label, decimals, points, durationS, ticksTotal, markers, lines, rising, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const loadedRef = useRef<{ code: string; len: number; lastT: number } | null>(null);
  const fmtRef = useRef({ decimals, durationS, ticksTotal });
  const lcRef = useRef<typeof import('lightweight-charts') | null>(null);
  const [ready, setReady] = useState(false);
  const docTheme = useDocumentTheme();

  useEffect(() => {
    fmtRef.current = { decimals, durationS, ticksTotal };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    const elapsed = (time: Time) => {
      const { durationS: d, ticksTotal: n } = fmtRef.current;
      return formatClock(tickToElapsedMs(Math.max(0, Number(time) - T0), { duration_s: d, ticks_total: n }));
    };
    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      lcRef.current = lc;
      const font = getComputedStyle(el).fontFamily || 'ui-rounded, system-ui, sans-serif';
      chart = lc.createChart(el, {
        autoSize: true,
        handleScroll: false,
        handleScale: false,
        layout: { background: { color: 'transparent' }, fontFamily: font, fontSize: 12, attributionLogo: false },
        grid: { vertLines: { visible: false } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.18, bottom: 0.12 } },
        timeScale: { borderVisible: false, minBarSpacing: 0.01, rightOffset: 0, tickMarkFormatter: (time: Time) => elapsed(time) },
        crosshair: { mode: lc.CrosshairMode.Magnet, vertLine: { style: lc.LineStyle.Dashed }, horzLine: { style: lc.LineStyle.Dashed } },
        localization: {
          locale: 'tr-TR',
          priceFormatter: (p: number) => formatPrice(p, fmtRef.current.decimals),
          timeFormatter: (time: Time) => elapsed(time),
        },
      });
      const series = chart.addSeries(lc.AreaSeries, {
        lineWidth: 3,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderWidth: 2,
        lastPriceAnimation: lc.LastPriceAnimationMode.OnDataUpdate,
      });
      seriesRef.current = series;
      markersRef.current = lc.createSeriesMarkers(series, []);
      chartRef.current = chart;
      setReady(true);
    });
    return () => {
      disposed = true;
      chart?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      linesRef.current = [];
      loadedRef.current = null;
    };
  }, []);

  // Tema / yön → renkler (oyun değişkenleri)
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!ready || !chart || !series || !el) return;
    const color = gameVar(el, rising ? '--g-chart-up' : '--g-chart-down');
    const cross = gameVar(el, '--g-chart-cross');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    chart.applyOptions({
      layout: { textColor: gameVar(el, '--g-chart-text') },
      grid: { horzLines: { color: gameVar(el, '--g-chart-grid') } },
      crosshair: {
        vertLine: { color: cross, labelBackgroundColor: gameVar(el, '--g-chart-label') },
        horzLine: { color: cross, labelBackgroundColor: gameVar(el, '--g-chart-label') },
      },
    });
    series.applyOptions({
      lineColor: color,
      topColor: withAlpha(color, 0.32),
      bottomColor: withAlpha(color, 0.02),
      priceLineColor: color,
      crosshairMarkerBorderColor: gameVar(el, '--g-chart-surface'),
      crosshairMarkerBackgroundColor: color,
      lastPriceAnimation: reduce ? lcRef.current?.LastPriceAnimationMode.Disabled : lcRef.current?.LastPriceAnimationMode.OnDataUpdate,
    });
  }, [ready, docTheme, rising]);

  useEffect(() => {
    if (!ready || !seriesRef.current) return;
    seriesRef.current.applyOptions({ priceFormat: { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals } });
  }, [ready, decimals]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!ready || !chart || !series) return;
    const prev = loadedRef.current;
    const last = points[points.length - 1];
    const canAppend = prev && prev.code === code && last && prev.len > 0 && prev.len <= points.length && points[prev.len - 1]?.t === prev.lastT;
    if (canAppend) {
      for (let i = prev.len; i < points.length; i++) series.update({ time: toTime(points[i].t), value: points[i].v });
    } else {
      series.setData(points.map((p) => ({ time: toTime(p.t), value: p.v })));
    }
    loadedRef.current = { code, len: points.length, lastT: last?.t ?? -1 };
    if (points.length) {
      const remaining = Math.max(0, ticksTotal - 1 - last.t);
      chart.timeScale().setVisibleLogicalRange({ from: 0, to: Math.max(points.length - 1 + remaining, 10) });
    }
  }, [ready, code, points, ticksTotal]);

  useEffect(() => {
    const api = markersRef.current;
    const el = containerRef.current;
    if (!ready || !api || !el) return;
    const up = gameVar(el, '--g-chart-up');
    const down = gameVar(el, '--g-chart-down');
    const muted = gameVar(el, '--g-chart-text');
    const list: SeriesMarker<Time>[] = [];
    for (const m of markers) {
      const t = snap(points, m.t);
      if (t == null) continue;
      const time = toTime(t);
      list.push(
        m.kind === 'exit'
          ? { time, position: 'inBar', shape: 'circle', color: muted, text: m.text, size: 0.9 }
          : m.kind === 'long'
            ? { time, position: 'belowBar', shape: 'arrowUp', color: up, text: m.text, size: 1.3 }
            : { time, position: 'aboveBar', shape: 'arrowDown', color: down, text: m.text, size: 1.3 },
      );
    }
    list.sort((a, b) => Number(a.time) - Number(b.time));
    api.setMarkers(list);
  }, [ready, markers, points, docTheme]);

  useEffect(() => {
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!ready || !series || !el) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    const up = gameVar(el, '--g-chart-up');
    const down = gameVar(el, '--g-chart-down');
    const muted = gameVar(el, '--g-chart-text');
    linesRef.current = lines.map((l) =>
      series.createPriceLine({
        price: l.price,
        color: l.kind === 'sl' ? down : l.kind === 'tp' ? up : muted,
        lineWidth: 1,
        lineStyle: l.kind === 'entry' ? 1 : 2,
        axisLabelVisible: true,
        title: l.title,
      }),
    );
  }, [ready, lines, docTheme]);

  const lastPoint = points[points.length - 1];
  const summary = lastPoint ? `${label} canlı grafik, son fiyat ${formatPrice(lastPoint.v, decimals)}` : `${label} canlı grafik`;

  return (
    <div className={cn('relative', className)}>
      <div ref={containerRef} role="img" aria-label={summary} className={cn('absolute inset-0', !ready && 'invisible')} />
      {(!ready || !points.length) && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <span className="g-title-sm text-lg opacity-80">Grafik hazırlanıyor…</span>
        </div>
      )}
    </div>
  );
}
