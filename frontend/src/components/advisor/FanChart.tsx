'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, Time } from 'lightweight-charts';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { chartFont, cssVar, useDocumentTheme } from '@/components/asset/chartTheme';
import type { AdvisorSimulation } from '@/types';
import { Explain } from './bits';
import { GLOSSARY, compactTRY, fanSummary, mixColors, monthFromTime, toFanSeries } from './model';

const HEIGHT = 280;

/**
 * Monte Carlo yelpaze grafiği: medyan (p50) çizgisi, %50 (p25–p75) ve %90 (p5–p95) olasılık bantları.
 *
 * lightweight-charts'ta iki seri arasını dolduran hazır bir seri yoktur. Bantlar, yukarıdan aşağıya
 * opak alan serileri üst üste çizilerek elde edilir: p95 (dış bant rengi) → p75 (iç bant) → p25 (dış bant)
 * → p5 (kart zemini). Opak renkler marka ve yüzey token'larının çalışma anında karıştırılmasıyla üretilir.
 */
export default function FanChart({ simulation, amount, className }: { simulation: AdvisorSimulation; amount: number; className?: string }) {
  const fan = useMemo(() => toFanSeries(simulation), [simulation]);
  const end = useMemo(() => fanSummary(simulation), [simulation]);
  const theme = useDocumentTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
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
      const label = (t: Time) => `${monthFromTime(Number(t))}. ay`;

      chart = lc.createChart(el, {
        height: HEIGHT,
        autoSize: true,
        layout: { background: { color: surface }, textColor: cssVar('--muted'), fontFamily: chartFont(), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.04 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: label },
        crosshair: { mode: lc.CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
        handleScroll: false,
        handleScale: false,
        localization: { locale: 'tr-TR', priceFormatter: (p: number) => compactTRY(p), timeFormatter: label },
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
      const toData = (pts: { time: number; value: number }[]) => pts.map((p) => ({ time: p.time as Time, value: p.value }));

      area(outer).setData(toData(fan.p95));
      area(inner).setData(toData(fan.p75));
      area(outer).setData(toData(fan.p25));
      area(surface).setData(toData(fan.p5));
      const median = chart.addSeries(lc.LineSeries, {
        color: brand,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
      });
      median.setData(toData(fan.p50));
      if (amount > 0) {
        median.createPriceLine({
          price: amount,
          color: cssVar('--subtle'),
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: false,
          title: 'Başlangıç',
        });
      }
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((param) => {
        setHoverMonth(param.time === undefined || !param.point ? null : monthFromTime(Number(param.time)));
      });
    });

    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [fan, amount, hasData, theme]);

  const point = useMemo(() => {
    if (hoverMonth === null) return end;
    const i = fan.p50.findIndex((p) => monthFromTime(p.time) === hoverMonth);
    if (i < 0) return end;
    return { month: hoverMonth, p5: fan.p5[i].value, p25: fan.p25[i].value, p50: fan.p50[i].value, p75: fan.p75[i].value, p95: fan.p95[i].value };
  }, [hoverMonth, fan, end]);

  return (
    <Card className={cn('flex min-w-0 flex-col overflow-hidden', className)}>
      <CardHeader title="Olası gelecekler" description="Monte Carlo senaryolarının yayılımı" />
      {!hasData || !end || !point ? (
        <EmptyState icon={<ChartBarIcon />} title="Simülasyon verisi yok" description="Bu öneri için senaryo dağılımı hesaplanmamış." />
      ) : (
        <figure className="flex flex-1 flex-col" aria-label="Monte Carlo yelpaze grafiği">
          <div className="px-5 sm:px-6" aria-live="off">
            <p className="text-xs text-muted">{point.month === 0 ? 'Bugün' : `${point.month}. ay sonunda`}</p>
            <p className="num mt-0.5 text-2xl font-semibold text-fg">{formatTRY(point.p50)}</p>
            <p className="num mt-1 text-xs text-muted">
              <span className="whitespace-nowrap">%50 olasılıkla {compactTRY(point.p25)} – {compactTRY(point.p75)}</span>
              <span aria-hidden="true"> · </span>
              <span className="whitespace-nowrap">%90 olasılıkla {compactTRY(point.p5)} – {compactTRY(point.p95)}</span>
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
                %50 olasılık aralığı
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))]" aria-hidden="true" />
                %90 olasılık aralığı
              </li>
              {amount > 0 && (
                <li className="flex items-center gap-1.5">
                  <span className="w-4 border-t border-dashed border-subtle" aria-hidden="true" />
                  Başlangıç ({compactTRY(amount)})
                </li>
              )}
            </ul>
            <p className="sr-only">
              {`${end.month}. ayın sonunda medyan senaryoda portföy değeri ${formatTRY(end.p50)}. Senaryoların yüzde 90'ı ${formatTRY(end.p5)} ile ${formatTRY(end.p95)} arasında.`}
            </p>
            <Explain>
              <p>{GLOSSARY.monte_carlo}</p>
              <p>
                Koyu bant senaryoların ortadaki yarısını, açık bant %90&apos;ını kapsar. Grafik bir tahmin değil, olası sonuçların yelpazesidir;
                gerçek yol bantların dışına da çıkabilir.
              </p>
            </Explain>
          </figcaption>
        </figure>
      )}
    </Card>
  );
}
