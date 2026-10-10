import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * TailAdmin tarzı sayfa konumu: "Panel › Sayfa". Varsayılan olarak yalnızca md+ genişlikte görünür
 * (mobilde başlık satırı sade kalır). `items` bir metin ise "Panel › {metin}" üretilir.
 */
export default function Breadcrumb({ items, className }: { items: string | Crumb[]; className?: string }) {
  const crumbs: Crumb[] = typeof items === 'string' ? [{ label: 'Panel', href: '/' }, { label: items }] : items;
  return (
    <nav aria-label="Sayfa konumu" className={cn('hidden md:block', className)}>
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {c.href && !last ? (
                <Link href={c.href} className="whitespace-nowrap text-muted transition-colors hover:text-brand">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn('max-w-[16rem] truncate', last ? 'text-fg' : 'text-muted')}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
