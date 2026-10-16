'use client';

import { useEffect, useRef } from 'react';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import type { IChartApi } from 'lightweight-charts';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { axisPrice, chartFont, cssVar, useDocumentTheme, withAlpha } from '@/components/asset/chartTheme';
import { useIdeaChart } from '@/hooks/useIdeas';
import { formatQuote } from '@/lib/ideas';
import type { IdeaChart as IdeaChartData } from '@/types/ideas';

/** lightweight-charts zamanları UTC gösterir; tarayıcının yerel saatine kaydır. */
const toChartTime = (t: number) => t - new Date(t * 1000).getTimezoneOffset() * 60;

/**
 * Yayından bu yana fiyat (saklanmış fiyat geçmişi + güncel / kapanış fiyatı). Referans, hedef ve geçersizlik
 * seviyeleri yatay çizgi olarak gösterilir. Yeterli nokta yoksa sade bir açıklama gösterilir.
 */
export default function IdeaChart({ id }: { id: string }) {
  const { data, error, isLoading } = useIdeaChart(id);
  if (isLoading && !data) return <Skeleton className="h-56 w-full rounded-xl" />;
  if (error && !data) return <EmptyState className="py-8" icon={<ChartBarIcon />} title="Grafik yüklenemedi" description="Birazdan yeniden denenecek." />;
  if (!data || data.points.length < 2) {
    return (
      <EmptyState
        className="py-8"
        icon={<ChartBarIcon />}
        title="Fiyat geçmişi birikiyor"
        description="Fiyat geçmişi 15 dakikada bir kaydedilir; yayından sonra noktalar biriktikçe grafik dolar."
      />
    );
  }
  return <ChartCanvas data={data} />;
}

function ChartCanvas({ data }: { data: IdeaChartData }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useDocumentTheme();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      const up = cssVar('--up');
      const down = cssVar('--down');
      const brand = cssVar('--brand');
      const muted = cssVar('--muted');
      chart = lc.createChart(el, {
        height: 224,
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: muted, fontFamily: chartFont(), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--line') } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Magnet },
        handleScroll: false,
        handleScale: false,
        localization: { locale: 'tr-TR', priceFormatter: axisPrice },
      });
      const last = data.points[data.points.length - 1].v;
      const lineColor = last >= data.ref_price ? up : down;
      const levels = [data.ref_price, data.target_price, data.invalidation_price].filter((v): v is number => v !== null && v > 0);
      const series = chart.addSeries(lc.AreaSeries, {
        lineWidth: 2,
        lineColor,
        topColor: withAlpha(lineColor, 0.2),
        bottomColor: withAlpha(lineColor, 0),
        priceLineVisible: false,
        // Hedef / geçersizlik seviyeleri de görünür aralıkta kalsın (fiyatın seviyelere uzaklığı okunabilsin)
        autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const res = base();
          if (!res) return res;
          return {
            ...res,
            priceRange: { minValue: Math.min(res.priceRange.minValue, ...levels), maxValue: Math.max(res.priceRange.maxValue, ...levels) },
          };
        },
      });
      series.setData(data.points.map((p) => ({ time: toChartTime(p.t) as never, value: p.v })));
      series.createPriceLine({ price: data.ref_price, color: brand, lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: true, title: 'Referans' });
      if (data.target_price !== null) {
        series.createPriceLine({ price: data.target_price, color: up, lineWidth: 1, lineStyle: lc.LineStyle.Dotted, axisLabelVisible: true, title: 'Hedef' });
      }
      if (data.invalidation_price !== null) {
        series.createPriceLine({ price: data.invalidation_price, color: down, lineWidth: 1, lineStyle: lc.LineStyle.Dotted, axisLabelVisible: true, title: 'Geçersizlik' });
      }
      chart.timeScale().fitContent();
    });
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [data, theme]);

  return (
    <figure>
      <div ref={ref} className="h-56 w-full" role="img" aria-label={`Yayından bu yana fiyat grafiği, referans ${formatQuote(data.ref_price, data.quote_currency)}`} />
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-brand" aria-hidden="true" /> Referans
        </span>
        {data.target_price !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dotted border-up" aria-hidden="true" /> Hedef
          </span>
        )}
        {data.invalidation_price !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dotted border-down" aria-hidden="true" /> Geçersizlik
          </span>
        )}
        <span>Fiyatlar varlığın kendi para biriminde ({data.quote_currency === 'TRY' ? 'TL' : 'ABD doları'}).</span>
      </figcaption>
    </figure>
  );
}
