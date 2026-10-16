'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, Time } from 'lightweight-charts';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import { chartFont, cssVar, useDocumentTheme } from '@/components/asset/chartTheme';
import { Explain } from '@/components/advisor/bits';
import { fanSummary, mixColors, monthFromTime, toFanSeries } from '@/components/advisor/model';
import type { BaseCurrency, LabSimulation } from '@/lib/globalLab';
import { compactMoney, money } from './model';

const HEIGHT = 260;

const monthLabel = (m: number) => (m === 0 ? 'Bugün' : m % 12 === 0 ? `${m / 12}. yıl` : `${m}. ay`);
/** Eksen etiketi: 2 yıldan uzun vadede yıl olarak (yuvarlanmış) */
const tickLabel = (m: number, total: number) => (m === 0 ? 'Bugün' : total > 24 ? `${Math.max(1, Math.round(m / 12))}. yıl` : `${m}. ay`);

/**
 * Monte Carlo yelpazesi (Portföy Sihirbazı FanChart'ının deseni; baz para birimine göre etiketler).
 * Bantlar opak alan serileriyle çizilir: p95 → p75 → p25 → p5 (kart zemini); medyan çizgisi üstte.
 */
export default function LabFanChart({ simulation, amount, currency, className }: { simulation: LabSimulation; amount: number; currency: BaseCurrency; className?: string }) {
  const fan = useMemo(() => toFanSeries(simulation), [simulation]);
  const end = useMemo(() => fanSummary(simulation), [simulation]);
  const theme = useDocumentTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hasData = fan.p50.length >= 2;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasData) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    import('lightweight-charts').then((lc) => {
      if (disposed) return;
      const brand = cssVar('--brand');
      const surface = cssVar('--surface');
      const outer = mixColors(brand, surface, 0.86);
      const inner = mixColors(brand, surface, 0.68);
      const label = (t: Time) => monthLabel(monthFromTime(Number(t)));
      const total = simulation.months[simulation.months.length - 1] ?? 0;
      const tick = (t: Time) => tickLabel(monthFromTime(Number(t)), total);
      chart = lc.createChart(el, {
        height: HEIGHT,
        autoSize: true,
        layout: { background: { color: surface }, textColor: cssVar('--muted'), fontFamily: chartFont(), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.04 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: tick },
        crosshair: { mode: lc.CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
        handleScroll: false,
        handleScale: false,
        localization: { locale: 'tr-TR', priceFormatter: (p: number) => compactMoney(p, currency), timeFormatter: label },
      });
      const area = (color: string) =>
        chart!.addSeries(lc.AreaSeries, {
          topColor: color,
          bottomColor: color,
          lineVisible: false,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
      const data = (pts: { time: number; value: number }[]) => pts.map((p) => ({ time: p.time as Time, value: p.value }));
      area(outer).setData(data(fan.p95));
      area(inner).setData(data(fan.p75));
      area(outer).setData(data(fan.p25));
      area(surface).setData(data(fan.p5));
      const median = chart.addSeries(lc.LineSeries, { color: brand, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4 });
      median.setData(data(fan.p50));
      if (amount > 0) {
        median.createPriceLine({ price: amount, color: cssVar('--subtle'), lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, title: 'Başlangıç' });
      }
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((param) => setHover(param.time === undefined || !param.point ? null : monthFromTime(Number(param.time))));
    });
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [fan, amount, hasData, theme, currency, simulation.months]);

  const point = useMemo(() => {
    if (hover === null) return end;
    const i = fan.p50.findIndex((p) => monthFromTime(p.time) === hover);
    if (i < 0) return end;
    return { month: hover, p5: fan.p5[i].value, p25: fan.p25[i].value, p50: fan.p50[i].value, p75: fan.p75[i].value, p95: fan.p95[i].value };
  }, [hover, fan, end]);

  return (
    <Card className={cn('flex min-w-0 flex-col overflow-hidden', className)}>
      <CardHeader title="Olası gelecekler" description={`Monte Carlo · ${simulation.paths.toLocaleString('tr-TR')} senaryo · ${currency} bazında`} />
      {!hasData || !end || !point ? (
        <EmptyState icon={<ChartBarIcon />} title="Simülasyon verisi yok" />
      ) : (
        <figure className="flex flex-1 flex-col" aria-label="Monte Carlo yelpaze grafiği">
          <div className="px-5 sm:px-6">
            <p className="text-xs text-muted">{point.month === 0 ? 'Bugün' : `${monthLabel(point.month)} sonunda (medyan)`}</p>
            <p className="num mt-0.5 text-2xl font-semibold text-fg">{money(point.p50, currency)}</p>
            <p className="num mt-1 text-xs text-muted">
              <span className="whitespace-nowrap">
                %50 olasılıkla {compactMoney(point.p25, currency)} – {compactMoney(point.p75, currency)}
              </span>
              <span aria-hidden="true"> · </span>
              <span className="whitespace-nowrap">
                %90 olasılıkla {compactMoney(point.p5, currency)} – {compactMoney(point.p95, currency)}
              </span>
            </p>
          </div>
          <div ref={ref} className="mt-3 w-full px-1 sm:px-3" style={{ height: HEIGHT }} />
          <figcaption className="space-y-3 px-5 pb-5 pt-3 sm:px-6">
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-brand" aria-hidden="true" />
                Medyan senaryo
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm bg-[color-mix(in_srgb,var(--brand)_32%,var(--surface))]" aria-hidden="true" />
                %50 aralık
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))]" aria-hidden="true" />
                %90 aralık
              </li>
              {amount > 0 && (
                <li className="flex items-center gap-1.5">
                  <span className="w-4 border-t border-dashed border-subtle" aria-hidden="true" />
                  Başlangıç ({compactMoney(amount, currency)})
                </li>
              )}
            </ul>
            <p className="sr-only">
              {`${monthLabel(end.month)} sonunda medyan senaryoda değer ${money(end.p50, currency)}. Senaryoların yüzde 90'ı ${money(end.p5, currency)} ile ${money(end.p95, currency)} arasında.`}
            </p>
            <Explain>
              <p>
                Varsayılan getiri, oynaklık ve korelasyonlarla binlerce olası yol üretilir (sabit tohum: aynı girdi aynı sonucu verir). Bantlar senaryoların
                nereye yığıldığını gösterir; gerçek yol bantların dışına da çıkabilir.
              </p>
            </Explain>
          </figcaption>
        </figure>
      )}
    </Card>
  );
}
