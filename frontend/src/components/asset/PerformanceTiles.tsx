'use client';

import { useMarketPerformance } from '@/hooks/useMarketHistory';
import type { PerformancePeriod } from '@/lib/api';
import { cn, formatPercent, trend } from '@portfoygo/shared/format';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import type { AssetType } from '@/types';

export const PERFORMANCE_PERIODS: { key: PerformancePeriod; label: string; title: string }[] = [
  { key: '1W', label: '1H', title: '1 hafta' },
  { key: '1M', label: '1A', title: '1 ay' },
  { key: '3M', label: '3A', title: '3 ay' },
  { key: '6M', label: '6A', title: '6 ay' },
  { key: 'YTD', label: 'YB', title: 'Yılbaşından bu yana' },
  { key: '1Y', label: '1Y', title: '1 yıl' },
];

const tile = {
  up: 'bg-up-soft',
  down: 'bg-down-soft',
  flat: 'bg-surface-2',
};

const value = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-muted',
};

interface Props {
  type: AssetType;
  symbol: string;
  /** "row": geniş alanda 6 sütun (mobilde 3); "grid": dar panelde 3 sütun */
  layout?: 'row' | 'grid';
  className?: string;
}

/** TradingView tarzı dönemsel getiri karoları (1H, 1A, 3A, 6A, YB, 1Y). Veri yoksa "—". */
export default function PerformanceTiles({ type, symbol, layout = 'row', className }: Props) {
  const { performance, isLoading } = useMarketPerformance(type, symbol);
  const cols = layout === 'row' ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3';

  return (
    <dl className={cn('grid gap-2', cols, className)} aria-busy={isLoading || undefined}>
      {PERFORMANCE_PERIODS.map((p) => {
        const v = performance?.[p.key];
        const has = typeof v === 'number' && Number.isFinite(v);
        const t = has ? trend(v) : 'flat';
        return (
          // Görsel sıra: değer üstte, etiket altta (DOM'da dt önce gelir)
          <div key={p.key} className={cn('flex min-w-0 flex-col-reverse rounded-xl px-3 py-2.5 text-center transition-colors', tile[t])} title={p.title}>
            <dt className="mt-0.5 text-[11px] font-medium text-muted">
              <abbr title={p.title} className="no-underline">
                {p.label}
              </abbr>
            </dt>
            <dd className={cn('num truncate text-sm font-semibold', value[t])}>
              {isLoading ? <Skeleton className="mx-auto h-5 w-14" /> : has ? formatPercent(v) : '—'}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
