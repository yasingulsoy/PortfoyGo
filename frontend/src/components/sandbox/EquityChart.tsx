'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { cn, formatDate, formatDateTime, formatUSD } from '@portfoygo/shared/format';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import { chartFont, cssVar, useDocumentTheme, withAlpha } from '@/components/asset/chartTheme';
import { cleanSeries, compactUSD, toChartTime } from './model';
import type { SeriesPoint } from './types';

export interface EquitySeries {
  id: string;
  label: string;
  /** Renk token'ı (CSS değişkeni adı, ör. '--brand') — tuval için çalışma anında çözülür */
  colorVar: string;
  points: SeriesPoint[];
}

interface Props {
  series: EquitySeries[];
  /** 'usd': değer (USD); 'index': başlangıç = 100 */
  format?: 'usd' | 'index';
  /** Kesikli referans çizgisi (ör. başlangıç sermayesi veya 100) */
  baseline?: number | null;
  height?: number;
  /** Saatlik veri: ipucunda saat de göster */
  intraday?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/** Varsayılan seri renkleri (karşılaştırma) */
export const SERIES_COLOR_VARS = ['--brand', '--up', '--gold'] as const;

const fmtValue = (v: number, format: 'usd' | 'index') => (format === 'usd' ? formatUSD(v) : v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/**
 * Özvarlık grafiği (lightweight-charts): tek seri alan, çoklu seri çizgi. Veri çekmez.
 * Tek seri için alan dolgusu, çoklu seride çizgiler + gösterge. Üzerine gelince her serinin değeri gösterilir.
 */
export default function EquityChart({
  series,
  format = 'usd',
  baseline = null,
  height = 260,
  intraday = false,
  emptyTitle = 'Henüz yeterli veri yok',
  emptyDescription = 'Değer geçmişi her saat kaydedilir; birkaç saat sonra grafik oluşur.',
  className,
}: Props) {
  const clean = useMemo(() => series.map((s) => ({ ...s, points: cleanSeries(s.points) })).filter((s) => s.points.length > 0), [series]);
  const hasData = clean.some((s) => s.points.length >= 2);
  const theme = useDocumentTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ t: number; values: Record<string, number> } | null>(null);
  const latest = useRef(clean);
  useEffect(() => {
    latest.current = clean;
  });

  const signature = clean.map((s) => `${s.id}:${s.colorVar}:${s.points.length}:${s.points[0]?.t}:${s.points[s.points.length - 1]?.t}:${s.points[s.points.length - 1]?.v}`).join('|');

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasData) return;
    let disposed = false;
    let chart: IChartApi | null = null;

    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      const data = latest.current;
      chart = lc.createChart(el, {
        height,
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: cssVar('--muted'), fontFamily: chartFont(), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--line') } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: lc.CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
        handleScroll: false,
        handleScale: false,
        localization: { locale: 'tr-TR', priceFormatter: (p: number) => (format === 'usd' ? compactUSD(p) : p.toLocaleString('tr-TR', { maximumFractionDigits: 1 })) },
      });
      const handles: { id: string; s: ISeriesApi<'Area'> | ISeriesApi<'Line'> }[] = [];
      data.forEach((s, i) => {
        const color = cssVar(s.colorVar) || cssVar('--brand');
        const pts = s.points.map((p) => ({ time: toChartTime(p.t) as Time, value: p.v }));
        if (data.length === 1) {
          const a = chart!.addSeries(lc.AreaSeries, {
            lineColor: color,
            topColor: withAlpha(color, 0.22),
            bottomColor: withAlpha(color, 0),
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
          });
          a.setData(pts);
          handles.push({ id: s.id, s: a });
        } else {
          const l = chart!.addSeries(lc.LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3 });
          l.setData(pts);
          handles.push({ id: s.id, s: l });
        }
        if (i === 0 && baseline !== null) {
          handles[0].s.createPriceLine({
            price: baseline,
            color: cssVar('--subtle'),
            lineWidth: 1,
            lineStyle: lc.LineStyle.Dashed,
            axisLabelVisible: false,
            title: '',
          });
        }
      });
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((param) => {
        if (param.time === undefined || !param.point) {
          setHover(null);
          return;
        }
        const values: Record<string, number> = {};
        for (const h of handles) {
          const d = param.seriesData.get(h.s) as { value?: number } | undefined;
          if (d && typeof d.value === 'number') values[h.id] = d.value;
        }
        const t = Number(param.time);
        const orig = latest.current.flatMap((s) => s.points).find((p) => toChartTime(p.t) === t);
        setHover({ t: orig ? orig.t : t, values });
      });
    });

    return () => {
      disposed = true;
      chart?.remove();
    };
    // signature: veri değişince yeniden kur (seriler küçük)
  }, [signature, hasData, height, format, baseline, intraday, theme]);

  if (!hasData) {
    return <EmptyState className={className} icon={<ChartBarIcon />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <figure className={cn('min-w-0', className)} aria-label="Portföy değeri grafiği">
      <figcaption className="mb-2 flex min-h-[2.5rem] flex-wrap items-end gap-x-4 gap-y-1">
        {clean.map((s) => {
          const last = s.points[s.points.length - 1]?.v;
          const v = hover?.values[s.id] ?? last;
          return (
            <span key={s.id} className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(${s.colorVar})` }} aria-hidden="true" />
              <span className="max-w-[9rem] truncate text-muted">{s.label}</span>
              <span className="num font-semibold text-fg">{v === undefined ? '—' : fmtValue(v, format)}</span>
            </span>
          );
        })}
        <span className="ml-auto text-[11px] text-subtle">{hover ? (intraday ? formatDateTime(hover.t * 1000) : formatDate(hover.t * 1000)) : ''}</span>
      </figcaption>
      <div ref={ref} style={{ height }} className="w-full" />
    </figure>
  );
}
