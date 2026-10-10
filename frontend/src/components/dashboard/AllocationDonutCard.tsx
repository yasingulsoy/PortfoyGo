'use client';

import { useMemo } from 'react';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { ASSET_TYPE_LABELS, type AssetType } from '@/types';

type Bucket = AssetType | 'cash';

const COLORS: Record<Bucket, string> = {
  stock: 'var(--brand)',
  crypto: 'var(--gold)',
  currency: 'var(--up)',
  commodity: 'var(--bronze)',
  cash: 'var(--line-strong)',
};

const LABELS: Record<Bucket, string> = { ...ASSET_TYPE_LABELS, cash: 'Nakit' };

const ORDER: Bucket[] = ['stock', 'crypto', 'currency', 'commodity', 'cash'];

const R = 42;
const STROKE = 12;
const C = 2 * Math.PI * R;

const pct = (n: number) => `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

/** Panel: varlık türüne göre dağılım (nakit dahil) — düz SVG halka grafik ve açıklama listesi. */
export default function AllocationDonutCard({ className }: { className?: string }) {
  const { balance, reservedCash, holdings, totals, loaded } = useLivePortfolio();

  const slices = useMemo(() => {
    const sums: Record<Bucket, number> = { stock: 0, crypto: 0, currency: 0, commodity: 0, cash: balance + reservedCash };
    for (const h of holdings) sums[h.assetType] += h.liveValue;
    const total = ORDER.reduce((s, k) => s + Math.max(0, sums[k]), 0);
    const shares = ORDER.map((k) => {
      const value = Math.max(0, sums[k]);
      return { key: k, value, share: total > 0 ? (value / total) * 100 : 0 };
    });
    // Her dilimin başlangıcı: kendisinden önceki dilimlerin toplamı
    return shares.map((s, i) => ({ ...s, offset: shares.slice(0, i).reduce((acc, p) => acc + p.share, 0) }));
  }, [balance, reservedCash, holdings]);

  const invested = totals.netWorth > 0 ? (totals.value / totals.netWorth) * 100 : 0;
  const visible = slices.filter((s) => s.share > 0);
  const summary = visible.map((s) => `${LABELS[s.key]} ${pct(s.share)}`).join(', ');

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader title="Varlık dağılımı" description="Türlere göre portföy ağırlığı" />
      <div className="flex items-center gap-5 px-5 pb-5 sm:px-6 sm:pb-6">
        {loaded ? (
          <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label={`Varlık dağılımı: ${summary}`}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-3)" strokeWidth={STROKE} />
            {visible.map((s) => {
              // Dilimler arasında küçük bir boşluk bırak (tek dilimde bırakma)
              const gap = visible.length > 1 ? 1.2 : 0;
              const len = Math.max(0, (s.share / 100) * C - gap);
              return (
                <circle
                  key={s.key}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={COLORS[s.key]}
                  strokeWidth={STROKE}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-(s.offset / 100) * C}
                />
              );
            })}
            <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}>
              <text x="50" y="48" textAnchor="middle" className="fill-fg text-[15px] font-semibold num">
                {pct(invested)}
              </text>
              <text x="50" y="61" textAnchor="middle" className="fill-muted text-[8px]">
                yatırımda
              </text>
            </g>
          </svg>
        ) : (
          <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
        )}

        <ul className="min-w-0 flex-1 space-y-2">
          {(loaded ? slices : ORDER.map((key) => ({ key, value: 0, share: 0, offset: 0 }))).map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[s.key] }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-muted">{LABELS[s.key]}</span>
              {loaded ? (
                <span className="num shrink-0 text-right">
                  <span className="font-medium text-fg">{pct(s.share)}</span>
                  <span className="ml-1.5 hidden text-xs text-subtle min-[420px]:inline">{formatTRY(s.value)}</span>
                </span>
              ) : (
                <Skeleton className="h-4 w-12" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
