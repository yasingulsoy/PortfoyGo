import { cn, formatUSD } from '@portfoygo/shared/format';
import { CLASS_META, CLASS_ORDER, fmtPct } from '@/components/sandbox/model';
import type { ClassWeight } from '@/components/sandbox/types';

/**
 * "Nakit ve varlık sınıflarının yeri": sınıf ağırlıkları (yığılmış çubuk + satırlar) ve her sınıfın portföydeki
 * rolüne dair tek cümlelik açıklama.
 */
export default function ClassPlacementPanel({ byClass, className }: { byClass: ClassWeight[]; className?: string }) {
  const rows = CLASS_ORDER.map((c) => ({ c, row: byClass.find((x) => x.asset_class === c) }));
  const present = rows.filter((r) => (r.row?.weight ?? 0) > 0);
  return (
    <div className={cn('min-w-0 space-y-4', className)}>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={present.map((r) => `${CLASS_META[r.c].label} ${fmtPct(r.row!.weight)}`).join(', ')}>
        {present.map((r) => (
          <span key={r.c} style={{ width: `${r.row!.weight}%`, background: CLASS_META[r.c].color }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="space-y-3">
        {rows.map(({ c, row }) => {
          const w = row?.weight ?? 0;
          return (
            <li key={c} className={cn('flex gap-3', w === 0 && 'opacity-60')}>
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CLASS_META[c].color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-medium text-fg">{CLASS_META[c].label}</span>
                  <span className="num text-muted">
                    <span className="font-semibold text-fg">{fmtPct(w)}</span>
                    {row && w > 0 && <span className="ml-1.5 text-xs">{formatUSD(row.value_usd)}</span>}
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{CLASS_META[c].edu}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
