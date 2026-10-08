'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import useSWR from 'swr';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';

interface Props {
  type: 'stock' | 'crypto';
  symbol?: string;
  coinId?: string;
  days: number;
  /** USD → TL çevirme katsayısı; verilmezse seri USD gösterilir */
  multiplier?: number | null;
  height?: number;
}

type Series = { series: { time: number; value: number }[]; unavailable?: boolean };

const EMPTY_POINTS: Series['series'] = [];

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Series>);

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function PriceChart({ type, symbol, coinId, days, multiplier, height = 320 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const key = type === 'crypto' ? (coinId ? `/api/asset/history?type=crypto&id=${encodeURIComponent(coinId)}&days=${days}` : null) : symbol ? `/api/asset/history?type=stock&symbol=${encodeURIComponent(symbol)}&days=${days}` : null;
  const { data, isLoading } = useSWR(key, fetcher, { revalidateOnFocus: false, refreshInterval: 5 * 60_000 });

  const points = data?.series ?? EMPTY_POINTS;
  const hasData = points.length > 1;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasData) return;
    let disposed = false;
    let cleanup = () => {};

    import('lightweight-charts').then((lc) => {
      if (disposed || !ref.current) return;
      const first = points[0].value;
      const last = points[points.length - 1].value;
      const color = last >= first ? cssVar('--up') : cssVar('--down');
      const chart = lc.createChart(el, {
        height,
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: cssVar('--subtle'), fontFamily: 'var(--font-geist-sans)', attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: cssVar('--line') } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: days <= 7 },
        crosshair: { mode: lc.CrosshairMode.Magnet },
        localization: { locale: 'tr-TR', priceFormatter: (p: number) => p.toLocaleString('tr-TR', { maximumFractionDigits: p < 1 ? 6 : 2 }) },
      });
      const series = chart.addSeries(lc.AreaSeries, {
        lineColor: color,
        lineWidth: 2,
        topColor: color + '33',
        bottomColor: color + '00',
        priceLineVisible: false,
      });
      const k = multiplier ?? 1;
      series.setData(points.map((p) => ({ time: p.time as never, value: p.value * k })));
      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    });

    return () => {
      disposed = true;
      cleanup();
    };
    // resolvedTheme: tema değişince renkler yeniden okunur
  }, [points, hasData, multiplier, height, days, resolvedTheme]);

  if (isLoading) return <div style={{ height }}><Skeleton className="h-full w-full rounded-xl" /></div>;
  if (!hasData) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState icon={<ChartBarIcon />} title="Grafik verisi şu an mevcut değil" description="Bu varlık için geçmiş fiyat verisi sağlayıcıdan alınamadı." />
      </div>
    );
  }
  return <div ref={ref} style={{ height }} className="w-full" />;
}
