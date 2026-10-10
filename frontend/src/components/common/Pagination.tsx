import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { toolbarButtonClass } from './controls';

/** 1 … 4 5 6 … 12 biçiminde sayfa listesi (null = üç nokta). */
function pageList(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => set.add(p));
  const sorted = [...set].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/**
 * TailAdmin sayfalama: kenarlıklı "← Önceki" / "Sonraki →" düğmeleri ve sayfa numaraları
 * (aktif sayfa marka tonunda). Dar kaplarda (kapsayıcı sorgusu) numaralar yerine "Sayfa x / y" gösterilir.
 */
export default function Pagination({
  page,
  pageCount,
  onChange,
  label = 'Sayfalar',
  className,
}: {
  /** 1 tabanlı sayfa */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  label?: string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className={cn('@container flex items-center justify-between gap-3', className)}>
      <button type="button" className={toolbarButtonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        <span>Önceki</span>
      </button>

      <p className="num text-sm text-muted @[36rem]:hidden">
        Sayfa <span className="font-medium text-fg">{page}</span> / {pageCount}
      </p>
      <ul className="hidden items-center gap-0.5 @[36rem]:flex">
        {pageList(page, pageCount).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} className="flex h-10 w-8 items-center justify-center text-sm text-subtle" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Sayfa ${p}`}
                className={cn(
                  'num flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors',
                  p === page ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-3 hover:text-brand',
                )}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>

      <button type="button" className={toolbarButtonClass} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        <span>Sonraki</span>
        <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
