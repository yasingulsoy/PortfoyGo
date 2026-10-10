'use client';

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import { chartFont, cssVar, useDocumentTheme, withAlpha } from './chartTheme';

export interface SeriesPoint {
  /** 'YYYY-MM-DD' */
  time: string;
  value: number;
}

interface Props {
  points: SeriesPoint[];
  kind: 'histogram' | 'area';
  /** Eksen ve imleç etiketleri */
  format: (n: number) => string;
  height?: number;
  /** Tam sayı serisi (sayımlar): eksen yalnızca tam sayı işaretler */
  integer?: boolean;
  /** Ekran okuyucu için grafik özeti */
  label: string;
  onHover?: (p: SeriesPoint | null) => void;
}

type Handle = { chart: IChartApi; series: ISeriesApi<SeriesType> };

/** Günlük metrik grafiği (lightweight-charts): sütun veya alan. Renkler tema token'larından okunur. */
export default function TimeSeriesChart({ points, kind, format, height = 280, integer = false, label, onHover }: Props) {
  const theme = useDocumentTheme();
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const latest = useRef({ points, format, onHover });

  useEffect(() => {
    latest.current = { points, format, onHover };
  });

  // Grafik örneği: tür veya tema değişince yeniden kurulur
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    let chart: IChartApi | null = null;

    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      const brand = cssVar('--brand');
      const priceFormat = { type: 'custom' as const, minMove: integer ? 1 : 0.01, formatter: (p: number) => latest.current.format(p) };
      chart = lc.createChart(el, {
        height,
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: cssVar('--muted'), fontFamily: chartFont(), fontSize: 12, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--line') } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: kind === 'histogram' ? 0 : 0.05 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
        crosshair: {
          mode: lc.CrosshairMode.Magnet,
          vertLine: { color: cssVar('--line-strong'), labelBackgroundColor: cssVar('--fg') },
          horzLine: { color: cssVar('--line-strong'), labelBackgroundColor: cssVar('--fg') },
        },
        handleScroll: false,
        handleScale: false,
        localization: {
          locale: 'tr-TR',
          priceFormatter: (p: number) => latest.current.format(p),
          dateFormat: 'dd MMM yy',
        },
      });
      const series =
        kind === 'histogram'
          ? chart.addSeries(lc.HistogramSeries, { color: brand, priceFormat, priceLineVisible: false, lastValueVisible: false, base: 0 })
          : chart.addSeries(lc.AreaSeries, {
              lineColor: brand,
              topColor: withAlpha(brand, 0.28),
              bottomColor: withAlpha(brand, 0),
              lineWidth: 2,
              priceFormat,
              priceLineVisible: false,
              lastValueVisible: false,
            });
      handle.current = { chart, series };
      series.setData(latest.current.points.map((p) => ({ time: p.time, value: p.value })));
      chart.timeScale().fitContent();

      chart.subscribeCrosshairMove((param) => {
        const cb = latest.current.onHover;
        if (!cb) return;
        if (param.time === undefined || !param.point) return cb(null);
        const t = typeof param.time === 'string' ? param.time : null;
        cb(latest.current.points.find((p) => p.time === t) ?? null);
      });
    });

    return () => {
      disposed = true;
      handle.current = null;
      chart?.remove();
    };
  }, [kind, height, integer, theme]);

  // Yeni veri: grafiği yeniden kurmadan güncelle
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    h.series.setData(points.map((p) => ({ time: p.time, value: p.value })));
    h.chart.timeScale().fitContent();
  }, [points]);

  return <div ref={ref} role="img" aria-label={label} className="w-full" style={{ height }} />;
}
