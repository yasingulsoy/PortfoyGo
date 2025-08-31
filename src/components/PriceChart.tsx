'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';

interface PriceChartProps {
  type: 'stock' | 'crypto';
  symbol?: string; // stock
  id?: string; // crypto id
  days?: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('network');
  return res.json();
};

export default function PriceChart({ type, symbol, id, days = 30 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { data } = useSWR(() =>
    type === 'stock'
      ? `/api/asset/history?type=stock&symbol=${symbol}&days=${days}`
      : `/api/asset/history?type=crypto&id=${id}&days=${days}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  useEffect(() => {
    let chart: any;
    let series: any;
    let dispose = () => {};

    (async () => {
      if (!containerRef.current || !data?.series) return;
      const lc = await import('lightweight-charts');
      const bgColor = '#F3F4F6';
      const textColor = '#111827';
      const gridColor = '#F3F4F6';
      chart = lc.createChart(containerRef.current, {
        layout: { 
          background: { type: 'solid' as any, color: bgColor }, 
          textColor: textColor 
        },
        grid: { 
          vertLines: { color: gridColor }, 
          horzLines: { color: gridColor } 
        },
        width: containerRef.current.clientWidth,
        height: 320,
      });
      series = chart.addAreaSeries({
        lineColor: '#4F46E5',
        topColor: 'rgba(79,70,229,0.3)',
        bottomColor: 'rgba(79,70,229,0.0)'
      });
      series.setData(data.series);

      const onResize = () => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      };
      window.addEventListener('resize', onResize);
      dispose = () => window.removeEventListener('resize', onResize);
    })();

    return () => {
      try { dispose(); } catch {}
      try { chart?.remove(); } catch {}
    };
  }, [data]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full rounded-lg border" />
    </div>
  );
}
