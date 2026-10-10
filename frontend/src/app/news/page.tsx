'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, ClockIcon, MagnifyingGlassIcon, NewspaperIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { newsApi } from '@/lib/api';
import { cn, formatDateTime, formatRelative } from '@portfoygo/shared/format';
import type { NewsItem } from '@/types';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Button from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import Breadcrumb from '@/components/common/Breadcrumb';
import { SearchInput, ToolbarButton } from '@/components/common/controls';

const INITIAL_LIMIT = 20;
const STEP = 10;
/** Backend üst sınırı (limitSchema(10, 50)) */
const MAX_LIMIT = 50;
const MAX_CHIPS = 8;
const ALL = '__all__';

interface Article extends NewsItem {
  creator?: string;
}

/** Yalnızca http(s) bağlantılarına izin ver (javascript: vb. engellenir). */
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalize(res: any): Article[] {
  const raw: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const r of raw) {
    const link = safeUrl(r?.link);
    const title = typeof r?.title === 'string' ? r.title.trim() : '';
    if (!link || !title || seen.has(link)) continue;
    seen.add(link);
    out.push({
      title,
      link,
      pubDate: typeof r.pubDate === 'string' ? r.pubDate : '',
      categories: Array.isArray(r.categories) ? r.categories.filter((c: unknown): c is string => typeof c === 'string' && c.trim() !== '') : [],
      description: typeof r.description === 'string' ? r.description : '',
      image: safeUrl(r.image),
      creator: typeof r.creator === 'string' && r.creator.trim() ? r.creator.trim() : undefined,
    });
  }
  return out;
}

export default function NewsPage() {
  const { user, ready } = useRequireAuth();
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');

  const { data, error, isLoading, isValidating, mutate } = useSWR(ready ? `news:list:${limit}` : null, () => newsApi.list(limit), {
    refreshInterval: 300_000,
    keepPreviousData: true,
  });

  const articles = useMemo(() => normalize(data), [data]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) for (const c of a.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
      .slice(0, MAX_CHIPS)
      .map(([name, count]) => ({ name, count }));
  }, [articles]);

  // Seçili kategori yeni veride yoksa "Tümü"ne düş (state'i effect ile sıfırlamak yerine türet)
  const activeCategory = category !== ALL && categories.some((c) => c.name === category) ? category : ALL;

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return articles.filter((a) => {
      if (activeCategory !== ALL && !a.categories.includes(activeCategory)) return false;
      if (!q) return true;
      return a.title.toLocaleLowerCase('tr').includes(q) || a.description.toLocaleLowerCase('tr').includes(q);
    });
  }, [articles, activeCategory, query]);

  if (!ready || !user) return <PageLoader />;

  const loadingMore = isValidating && articles.length > 0 && articles.length < limit;
  const canLoadMore = limit < MAX_LIMIT && articles.length >= limit;
  const [featured, ...others] = filtered;

  const categoryTabs = [{ value: ALL, label: 'Tümü', count: articles.length }, ...categories.map((c) => ({ value: c.name, label: c.name, count: c.count }))];

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Piyasa haberleri"
        description="Ekonomi ve finans dünyasından son gelişmeler. Haberler kaynağında yeni sekmede açılır."
        actions={<Breadcrumb items="Haberler" />}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {categories.length > 0 ? (
          <Tabs label="Kategori filtresi" items={categoryTabs} value={activeCategory} onChange={setCategory} className="min-w-0 max-w-full self-start lg:max-w-[62%]" />
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="flex gap-3">
          <SearchInput
            label="Haberlerde ara"
            placeholder="Başlık veya içerikte ara"
            value={query}
            onChange={setQuery}
            className="min-w-0 flex-1 lg:w-72 lg:flex-none"
          />
          <ToolbarButton
            iconOnly
            onClick={() => void mutate()}
            disabled={isValidating}
            aria-label="Haberleri yenile"
            title="Yenile"
            icon={<ArrowPathIcon className={cn('h-4 w-4', isValidating && 'animate-spin')} aria-hidden="true" />}
          />
        </div>
      </div>

      {error && articles.length > 0 && <Alert tone="error">Haberler güncellenemedi; son alınan haberler gösteriliyor.</Alert>}

      {isLoading && articles.length === 0 ? (
        <NewsSkeleton />
      ) : articles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<NewspaperIcon />}
            title={error ? 'Haberler yüklenemedi' : 'Şu an haber yok'}
            description={error ? 'Haber kaynağına şu an ulaşılamıyor.' : 'Yeni haberler geldiğinde burada görünecek.'}
            action={
              error ? (
                <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                  Tekrar dene
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MagnifyingGlassIcon />}
            title="Eşleşen haber bulunamadı"
            description="Farklı bir arama terimi ya da kategori dene."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setCategory(ALL);
                }}
              >
                Filtreleri temizle
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status">
            {filtered.length} haber listeleniyor
          </p>
          <FeaturedArticle article={featured} />
          {others.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
              {others.map((a) => (
                <li key={a.link} className="min-w-0">
                  <ArticleCard article={a} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {articles.length > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {canLoadMore ? (
            <ToolbarButton loading={loadingMore} onClick={() => setLimit((l) => Math.min(MAX_LIMIT, l + STEP))}>
              Daha fazla yükle
            </ToolbarButton>
          ) : (
            <p className="text-sm text-muted">Tüm güncel haberleri gördün.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Meta({ article, className }: { article: Article; className?: string }) {
  const time = article.pubDate ? formatRelative(article.pubDate) : null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted', className)}>
      {article.categories[0] && <Badge tone="brand">{article.categories[0]}</Badge>}
      {time && (
        <time dateTime={article.pubDate} title={formatDateTime(article.pubDate)} className="inline-flex items-center gap-1">
          <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {time}
        </time>
      )}
    </div>
  );
}

function NewsImage({ src, className }: { src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn('flex items-center justify-center bg-surface-3 text-subtle', className)} aria-hidden="true">
        <NewspaperIcon className="h-8 w-8" />
      </div>
    );
  }
  return (
    // Harici RSS görselleri: alan adları önceden bilinmediği için next/image yerine düz <img>.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn('bg-surface-3 object-cover', className)} />
  );
}

function FeaturedArticle({ article }: { article: Article }) {
  return (
    <Card className="p-4 sm:p-5">
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group grid gap-5 md:grid-cols-[1.1fr_1fr] md:gap-6">
        <NewsImage src={article.image} className="aspect-[16/9] w-full rounded-xl md:aspect-auto md:h-full md:min-h-[280px]" />
        <div className="flex min-w-0 flex-col px-1 pb-1 md:py-2 md:pr-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">Öne çıkan</Badge>
            <Meta article={article} />
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-snug text-fg group-hover:text-brand sm:text-2xl">{article.title}</h2>
          {article.description && <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted">{article.description}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-sm max-md:mt-5">
            <span className="truncate text-muted">{article.creator ?? ''}</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-brand">
              Haberi oku <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">(yeni sekmede açılır)</span>
            </span>
          </div>
        </div>
      </a>
    </Card>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Card className="h-full p-4 transition-colors hover:border-line-strong sm:p-5">
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col">
        {article.image && <NewsImage src={article.image} className="mb-4 aspect-[16/9] w-full rounded-xl" />}
        <Meta article={article} />
        <h3 className="mt-2.5 line-clamp-3 text-base font-semibold leading-snug text-fg group-hover:text-brand">{article.title}</h3>
        {article.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{article.description}</p>}
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand">
          Haberi oku <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(yeni sekmede açılır)</span>
        </span>
      </a>
    </Card>
  );
}

function NewsSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-hidden="true">
      <Card className="grid gap-5 p-4 sm:p-5 md:grid-cols-[1.1fr_1fr] md:gap-6">
        <Skeleton className="aspect-[16/9] w-full rounded-xl md:aspect-auto md:min-h-[280px]" />
        <div className="space-y-3 md:py-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="space-y-2.5 p-4 sm:p-5">
            <Skeleton className="aspect-[16/9] w-full rounded-xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </Card>
        ))}
      </div>
    </div>
  );
}
