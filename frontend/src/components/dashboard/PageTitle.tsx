import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * TailAdmin sayfa başlığı: solda başlık (ve isteğe bağlı açıklama), sağda "Panel › Sayfa" içerik yolu (md+).
 * Son öğe geçerli sayfadır ve bağlantı değildir.
 */
export default function PageTitle({
  title,
  description,
  crumbs,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        {crumbs && crumbs.length > 0 && <Breadcrumb crumbs={crumbs} className="hidden md:block" />}
      </div>
    </div>
  );
}

export function Breadcrumb({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  return (
    <nav aria-label="İçerik yolu" className={className}>
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {c.href && !last ? (
                <Link href={c.href} className="text-muted transition-colors hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn('truncate', last ? 'text-fg' : 'text-muted')}>
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
