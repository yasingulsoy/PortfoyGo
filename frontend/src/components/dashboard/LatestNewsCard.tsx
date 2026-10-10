'use client';

import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { NewspaperIcon } from '@heroicons/react/24/outline';
import { cn, formatRelative } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import type { NewsItem } from '@/types';
import { useNews } from './useNews';

/** Kısa haber listesi (panel ve varlık sayfası). */
export function NewsList({ items, className }: { items: NewsItem[]; className?: string }) {
  return (
    <ul className={className}>
      {items.map((n) => (
        <li key={n.link} className="border-b border-line last:border-b-0">
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="group block py-3.5">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-fg group-hover:text-brand">{n.title}</p>
            <p className="mt-1 text-xs text-muted">
              {[n.categories[0], n.pubDate ? formatRelative(n.pubDate) : null].filter(Boolean).join(' · ')}
              <span className="sr-only"> (yeni sekmede açılır)</span>
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Panel: son 5 piyasa haberi. */
export default function LatestNewsCard({ className }: { className?: string }) {
  const { items, error, isLoading } = useNews(20);
  const top = items.slice(0, 5);

  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title="Son haberler"
        description="Ekonomi ve finans gündemi"
        action={
          <LinkButton href="/news" variant="ghost" size="sm">
            Tümü <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </LinkButton>
        }
      />
      {isLoading ? (
        <div className="space-y-4 px-5 pb-6 sm:px-6" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyState className="py-8" icon={<NewspaperIcon />} title={error ? 'Haberler yüklenemedi' : 'Şu an haber yok'} />
      ) : (
        <NewsList items={top} className="px-5 pb-3 sm:px-6" />
      )}
    </Card>
  );
}
