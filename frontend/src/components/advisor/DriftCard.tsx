import { ScaleIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import type { AdvisorAllocation, AdvisorDrift } from '@/types';
import { classColor, classLabel, pct } from './model';

/** Puan farkı: +5,0 puan. */
function points(diff: number): string {
  const v = Math.round(diff * 1000) / 10 || 0;
  const text = Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return v > 0 ? `+${text} puan` : v < 0 ? `−${text} puan` : '0 puan';
}

/** "Mevcut portföyünle karşılaştır": hedef ve mevcut ağırlıklar yan yana çubuklarla. */
export default function DriftCard({ drift, allocation, className }: { drift: AdvisorDrift[]; allocation: AdvisorAllocation[]; className?: string }) {
  const labels = new Map(allocation.map((a) => [a.class, a.label]));
  const order = new Map(allocation.map((a, i) => [a.class, i]));
  const rows = [...drift]
    .filter((d) => d.target > 0 || d.current > 0)
    .sort((a, b) => (order.get(a.class) ?? 99) - (order.get(b.class) ?? 99) || b.target - a.target);
  const max = Math.max(0.01, ...rows.flatMap((r) => [r.target, r.current]));
  const hasCurrent = rows.some((r) => r.current > 0);

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader title="Mevcut portföyünle karşılaştır" description="Öneri ve bugünkü dağılımın" />
      {rows.length === 0 ? (
        <EmptyState icon={<ScaleIcon />} title="Karşılaştırma yok" description="Mevcut portföy bilgisi bu öneriyle birlikte gelmedi." />
      ) : (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-brand" /> Öneri
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-line-strong" /> Şu an
            </span>
          </div>
          {!hasCurrent && <p className="mb-4 text-sm text-muted">Portföyünün tamamı şu an nakitte; öneriyi uygularsan dağılım hedefe yaklaşır.</p>}
          <ul className="space-y-4">
            {rows.map((r, i) => {
              const big = Math.abs(r.diff) >= 0.05;
              return (
                <li key={r.class}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classColor(r.class, i) }} aria-hidden="true" />
                      <span className="truncate font-medium text-fg">{labels.get(r.class) ?? classLabel(r.class)}</span>
                    </span>
                    <span className={cn('num shrink-0 text-xs font-medium', big ? 'text-gold' : 'text-muted')}>
                      <span className="sr-only">Hedef {pct(r.target)}, şu an {pct(r.current)}, fark </span>
                      {points(r.current - r.target)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1" aria-hidden="true">
                    <Bar value={r.target} max={max} className="bg-brand" text={pct(r.target, { digits: 0 })} />
                    <Bar value={r.current} max={max} className="bg-line-strong" text={pct(r.current, { digits: 0 })} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-subtle">
            Fark, bugünkü ağırlığın önerilenden ne kadar saptığını gösterir (puan = yüzde puanı). Uygulama yalnızca alım yaptığından, fazla ağırlıklı sınıflar kendiliğinden azalmaz.
          </p>
        </div>
      )}
    </Card>
  );
}

function Bar({ value, max, className, text }: { value: number; max: number; className: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
      </div>
      <span className="num w-9 shrink-0 text-right text-[11px] text-muted">{text}</span>
    </div>
  );
}
