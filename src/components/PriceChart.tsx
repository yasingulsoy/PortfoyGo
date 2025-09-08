'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
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
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
      if (!containerRef.current || !data?.series || !mounted) return;
      const lc = await import('lightweight-charts');
      
      // Dark mode desteği (next-themes)
      const currentTheme = theme === 'system' ? systemTheme : theme;
      const isDark = currentTheme === 'dark';
      const bgColor = isDark ? '#1F2937' : '#FFFFFF';
      const textColor = isDark ? '#F9FAFB' : '#111827';
      const gridColor = isDark ? '#374151' : '#F3F4F6';
      const lineColor = isDark ? '#60A5FA' : '#4F46E5';
      const topColor = isDark ? 'rgba(96,165,250,0.3)' : 'rgba(79,70,229,0.3)';
      
      chart = lc.createChart(containerRef.current, {
        layout: { 
          background: { color: bgColor }, 
          textColor: textColor 
        },
        grid: { 
          vertLines: { color: gridColor }, 
          horzLines: { color: gridColor } 
        },
        timeScale: {
          borderColor: gridColor,
        },
        rightPriceScale: {
          borderColor: gridColor,
        },
        width: containerRef.current.clientWidth,
        height: 320,
      });
      
      series = chart.addAreaSeries({
        lineColor: lineColor,
        topColor: topColor,
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
  }, [data, theme, systemTheme, mounted]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full rounded-lg border" />
    </div>
  );
}
