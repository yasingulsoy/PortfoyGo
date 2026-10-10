'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import { cn } from '@portfoygo/shared/format';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { chartFont, cssVar, useDocumentTheme, withAlpha } from '@/components/asset/chartTheme';
import { formatClock, formatPrice, tickToElapsedMs, type SeriesPoint } from './model';

export interface ChartMarker {
  /** tick */
  t: number;
  kind: 'long' | 'short' | 'exit';
  text: string;
}

export interface ChartLine {
  price: number;
  kind: 'sl' | 'tp' | 'entry';
  title: string;
}

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

/** Tick → grafik zamanı. Negatif / sıfır tick'ler de geçerli zaman olsun diye sabit bir kaydırma eklenir. */
const T0 = 1_000_000;
const toTime = (t: number) => (t + T0) as UTCTimestamp;

/** Sıralı noktalar içinde t'ye eşit ya da ondan önceki en yakın noktanın zamanı. */
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

/**
 * Turun canlı fiyat grafiği (lightweight-charts alan serisi). Grafik bir kez kurulur;
 * her tick'te yalnızca yeni nokta eklenir (`series.update`), enstrüman değişince veri yeniden yüklenir.
 * Zaman ekseni tick numarasıdır; etiketler turun geçen süresini (m:ss) gösterir ve tur sonuna kadar
 * olan alan baştan ayrılır (çizgi soldan sağa ilerler).
 */
export default function ArenaChart({ code, label, decimals, points, durationS, ticksTotal, markers, lines, rising, className }: Props) {
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

  // 1) Grafiği bir kez oluştur
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
      chart = lc.createChart(el, {
        autoSize: true,
        handleScroll: false,
        handleScale: false,
        layout: { background: { color: 'transparent' }, fontFamily: chartFont(), fontSize: 11, attributionLogo: false },
        grid: { vertLines: { visible: false } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.1 } },
        timeScale: { borderVisible: false, minBarSpacing: 0.01, rightOffset: 0, tickMarkFormatter: (time: Time) => elapsed(time) },
        crosshair: { mode: lc.CrosshairMode.Magnet, vertLine: { style: lc.LineStyle.Dashed }, horzLine: { style: lc.LineStyle.Dashed } },
        localization: {
          locale: 'tr-TR',
          priceFormatter: (p: number) => formatPrice(p, fmtRef.current.decimals),
          timeFormatter: (time: Time) => elapsed(time),
        },
      });
      const series = chart.addSeries(lc.AreaSeries, {
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
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

  // 2) Tema / yön → renkler
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!ready || !chart || !series) return;
    const color = cssVar(rising ? '--up' : '--down');
    const lineStrong = cssVar('--line-strong');
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
      topColor: withAlpha(color, 0.22),
      bottomColor: withAlpha(color, 0),
      priceLineColor: color,
      crosshairMarkerBorderColor: cssVar('--surface'),
      crosshairMarkerBackgroundColor: color,
      lastPriceAnimation: reduce ? lcRef.current?.LastPriceAnimationMode.Disabled : lcRef.current?.LastPriceAnimationMode.OnDataUpdate,
    });
  }, [ready, docTheme, rising]);

  // 3) Fiyat biçimi (enstrümanın ondalığı)
  useEffect(() => {
    if (!ready || !seriesRef.current) return;
    seriesRef.current.applyOptions({ priceFormat: { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals } });
  }, [ready, decimals]);

  // 4) Veri: aynı enstrümanda yalnızca yeni noktaları ekle
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!ready || !chart || !series) return;
    const prev = loadedRef.current;
    const last = points[points.length - 1];
    const canAppend =
      prev && prev.code === code && last && prev.len > 0 && prev.len <= points.length && points[prev.len - 1]?.t === prev.lastT;
    if (canAppend) {
      for (let i = prev.len; i < points.length; i++) series.update({ time: toTime(points[i].t), value: points[i].v });
    } else {
      series.setData(points.map((p) => ({ time: toTime(p.t), value: p.v })));
    }
    loadedRef.current = { code, len: points.length, lastT: last?.t ?? -1 };
    if (points.length) {
      // Tur sonuna kadar kalan tick'ler için sağda boş alan: çizgi soldan sağa ilerler
      const remaining = Math.max(0, ticksTotal - 1 - last.t);
      chart.timeScale().setVisibleLogicalRange({ from: 0, to: Math.max(points.length - 1 + remaining, 10) });
    }
  }, [ready, code, points, ticksTotal]);

  // 5) Giriş / çıkış işaretleri
  useEffect(() => {
    const api = markersRef.current;
    if (!ready || !api) return;
    const up = cssVar('--up');
    const down = cssVar('--down');
    const muted = cssVar('--muted');
    const list: SeriesMarker<Time>[] = [];
    for (const m of markers) {
      const t = snap(points, m.t);
      if (t == null) continue;
      const time = toTime(t);
      list.push(
        m.kind === 'exit'
          ? { time, position: 'inBar', shape: 'circle', color: muted, text: m.text, size: 0.8 }
          : m.kind === 'long'
            ? { time, position: 'belowBar', shape: 'arrowUp', color: up, text: m.text }
            : { time, position: 'aboveBar', shape: 'arrowDown', color: down, text: m.text },
      );
    }
    list.sort((a, b) => Number(a.time) - Number(b.time));
    api.setMarkers(list);
    // points: yeni noktalar eklenince yakalama (snap) yeniden hesaplanır
  }, [ready, markers, points, docTheme]);

  // 6) Açık pozisyonların SL / TP (ve giriş) çizgileri
  useEffect(() => {
    const series = seriesRef.current;
    if (!ready || !series) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    const up = cssVar('--up');
    const down = cssVar('--down');
    const muted = cssVar('--subtle');
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
        <div className="absolute inset-0 p-2">
          <Skeleton className="h-full w-full rounded-xl" />
          <span className="sr-only" role="status">Grafik hazırlanıyor…</span>
        </div>
      )}
    </div>
  );
}
