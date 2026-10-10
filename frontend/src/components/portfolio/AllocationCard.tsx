'use client';

import { useMemo } from 'react';
import type { LiveHolding } from '@/context/PortfolioContext';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { ASSET_TYPE_LABELS, type AssetType } from '@/types';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';

type Bucket = AssetType | 'cash';

export const ALLOCATION_COLORS: Record<Bucket, string> = {
  // Halkanın boş izi surface-3 olduğundan nakit dilimi bir ton daha koyu
  cash: 'var(--line-strong)',
  stock: 'var(--brand)',
  crypto: 'var(--gold)',
  currency: 'var(--up)',
  commodity: 'var(--muted)',
};

const LABELS: Record<Bucket, string> = { cash: 'Nakit', ...ASSET_TYPE_LABELS };

const R = 46;
const C = 2 * Math.PI * R;

const pctText = (p: number) => `%${p.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

/** Nakit + varlık türlerine göre dağılım: düz SVG halka grafik ve açıklama listesi. */
export default function AllocationCard({ holdings, balance, loaded, className }: { holdings: LiveHolding[]; balance: number; loaded: boolean; className?: string }) {
  const { slices, total } = useMemo(() => {
    const buckets: Partial<Record<Bucket, number>> = { cash: Math.max(0, balance) };
    for (const h of holdings) buckets[h.assetType] = (buckets[h.assetType] ?? 0) + Math.max(0, h.liveValue);
    const sum = Object.values(buckets).reduce((s, v) => s + (v ?? 0), 0);
    const entries = (Object.entries(buckets) as [Bucket, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const list: { key: Bucket; value: number; pct: number; length: number; offset: number }[] = [];
    for (const [key, value] of entries) {
      const pct = sum > 0 ? (value / sum) * 100 : 0;
      const prev = list[list.length - 1];
      list.push({ key, value, pct, length: (pct / 100) * C, offset: prev ? prev.offset + prev.length : 0 });
    }
    return { slices: list, total: sum };
  }, [holdings, balance]);

  const invested = total > 0 ? ((total - Math.max(0, balance)) / total) * 100 : 0;
  const summary = slices.map((s) => `${LABELS[s.key]} ${pctText(s.pct)}`).join(', ');

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title="Varlık dağılımı" description="Nakit ve varlık türlerine göre" />
      {!loaded ? (
        <div className="flex flex-col items-center gap-5 px-5 pb-6 sm:px-6">
          <Skeleton className="h-40 w-40 rounded-full" />
          <div className="w-full space-y-2.5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-6 px-5 pb-5 sm:flex-row sm:px-6 sm:pb-6 md:flex-col xl:flex-col">
          <div className="relative h-40 w-40 shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Varlık dağılımı: ${summary || 'veri yok'}`}>
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
              {slices.map((s) => (
                <circle
                  key={s.key}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={ALLOCATION_COLORS[s.key]}
                  strokeWidth="12"
                  strokeDasharray={`${s.length} ${C - s.length}`}
                  strokeDashoffset={-s.offset}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-muted">Yatırımda</span>
              <span className="num text-xl font-semibold text-fg">{pctText(invested)}</span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 divide-y divide-line text-sm">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ALLOCATION_COLORS[s.key] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-muted">{LABELS[s.key]}</span>
                <span className="num font-medium text-fg">{formatTRY(s.value)}</span>
                <span className="num w-14 shrink-0 text-right text-xs text-muted">{pctText(s.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
