import type { ReactNode } from 'react';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import type { AdvisorMetrics } from '@/types';
import { InfoTip } from './bits';
import { GLOSSARY, pct } from './model';

interface Tile {
  key: keyof typeof GLOSSARY;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone?: 'down';
}

/** Öneri metrikleri: her biri kısa açıklamalı (i) kutucuk. */
export default function PlanMetrics({ metrics, horizon, amount, className }: { metrics: AdvisorMetrics; horizon: number; amount: number; className?: string }) {
  const m = metrics;
  const tiles: Tile[] = [
    { key: 'expected_return', label: 'Beklenen yıllık getiri', value: pct(m.expected_return, { sign: true }), sub: 'Senaryoların ortalaması' },
    { key: 'volatility', label: 'Volatilite', value: pct(m.volatility), sub: 'Yıllık dalgalanma' },
    {
      key: 'sharpe',
      label: 'Sharpe oranı',
      value: m.sharpe.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      sub: 'Risk başına ek getiri',
    },
    { key: 'prob_loss', label: 'Zarar olasılığı', value: pct(m.prob_loss), sub: `${horizon} ay sonunda` },
    {
      key: 'var95',
      label: 'Kötü senaryo (VaR %95)',
      value: m.var95 >= 0.0005 ? `-${pct(m.var95)}` : pct(0),
      sub: m.var95 < 0.0005 ? '%95 güvenle yıllık kayıp öngörülmüyor' : amount > 0 ? `≈ ${formatTRY(m.var95 * amount)} / yıl` : 'Bir yıllık kayıp',
      tone: m.var95 >= 0.0005 ? 'down' : undefined,
    },
    { key: 'max_drawdown_median', label: 'Tipik maksimum düşüş', value: m.max_drawdown_median > 0 ? `-${pct(m.max_drawdown_median)}` : pct(0), sub: 'Medyan senaryo', tone: 'down' },
    { key: 'max_drawdown_p95', label: 'En kötü maksimum düşüş', value: m.max_drawdown_p95 > 0 ? `-${pct(m.max_drawdown_p95)}` : pct(0), sub: 'Kötü senaryoların sınırı (%95)', tone: 'down' },
  ];

  return (
    <section aria-label="Risk ve getiri ölçüleri" className={cn('grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4', className)}>
      {tiles.map((t, i) => (
        <Card key={t.key} className="min-w-0 p-4 sm:p-5">
          <p className="flex items-start gap-1 text-xs leading-snug text-muted sm:text-sm">
            <span className="min-w-0">{t.label}</span>
            <InfoTip label={t.label} align={i % 2 === 0 ? 'start' : 'end'} className="mt-px">
              {GLOSSARY[t.key]}
            </InfoTip>
          </p>
          <p className={cn('num mt-2 truncate text-xl font-semibold sm:text-2xl', t.tone === 'down' ? 'text-down' : 'text-fg')}>{t.value}</p>
          <p className="num mt-1 line-clamp-2 text-xs text-subtle">{t.sub}</p>
        </Card>
      ))}
      <Card className="col-span-2 flex min-w-0 flex-col justify-center bg-surface-2 p-4 sm:p-5 lg:col-span-1">
        <p className="text-sm font-semibold text-fg">Nasıl okunur?</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Rakamlar binlerce simüle edilmiş senaryodan gelir; bir söz değil, olası sonuçların özetidir. Düşüş değerleri, bu dağılımla hangi dalgalanmalara hazır olman gerektiğini gösterir.
        </p>
      </Card>
    </section>
  );
}
