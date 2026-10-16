'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LightBulbIcon, PlusIcon, ScaleIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useIdeaList, useMyLeagues } from '@/hooks/useIdeas';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Breadcrumb from '@/components/common/Breadcrumb';
import Pagination from '@/components/common/Pagination';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn } from '@portfoygo/shared/format';
import IdeaCard, { IdeaCardSkeleton } from '@/components/ideas/IdeaCard';
import IdeaFilters, { EMPTY_FILTERS, filtersActive, type FilterState } from '@/components/ideas/IdeaFilters';
import { IdeaDisclaimer } from '@/components/ideas/parts';
import { IDEAS_PATH, IDEA_LIMITS, VIEW_LABELS, compareHref, toggleCompare } from '@/lib/ideas';
import type { IdeaListFilters, IdeaView } from '@/types/ideas';

const PAGE = 12;

/** Görünüm ↔ adres (?gorunum=…): "İzlediklerim" gibi görünümler paylaşılabilir ve geri tuşuyla korunur */
const VIEW_SLUGS: Record<IdeaView, string> = {
  newest: 'en-yeni',
  review_due: 'degerlendirme-bekleyenler',
  closed: 'kapananlar',
  bookmarks: 'izlediklerim',
  mine: 'onerilerim',
};
const VIEWS = Object.keys(VIEW_SLUGS) as IdeaView[];
const viewFromSlug = (s: string | null): IdeaView => VIEWS.find((v) => VIEW_SLUGS[v] === s) ?? 'newest';

const EMPTY_TEXT: Record<IdeaView, { title: string; description: string }> = {
  newest: { title: 'Henüz öneri yok', description: 'İlk yapılandırılmış fikri sen paylaş: varlık, gerekçe, beklenen senaryo, riskler ve izleme kriterleri.' },
  review_due: { title: 'Değerlendirme bekleyen öneri yok', description: 'Değerlendirme tarihi gelen açık öneriler burada listelenir.' },
  closed: { title: 'Henüz kapanan öneri yok', description: 'Yazarları değerlendirmesini yazıp kapattığında öneriler burada görünür.' },
  bookmarks: { title: 'İzlediğin öneri yok', description: 'Bir önerinin sayfasında "İzlemeye al" ile listene ekleyebilirsin; kapandığında haber verilir.' },
  mine: { title: 'Henüz öneri paylaşmadın', description: 'Fikrini kişisel görüş düzeyinden çıkar: gerekçe, risk ve izleme kriterleriyle kaydet.' },
};

export default function IdeasPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <IdeasGate />
    </Suspense>
  );
}

function IdeasGate() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <Ideas />;
}

function Ideas() {
  const router = useRouter();
  const search = useSearchParams();
  const view = viewFromSlug(search.get('gorunum'));
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [compare, setCompare] = useState<string[]>([]);
  const leagues = useMyLeagues();

  const setView = (v: IdeaView) => {
    setPage(1);
    router.replace(v === 'newest' ? IDEAS_PATH : `${IDEAS_PATH}?gorunum=${VIEW_SLUGS[v]}`, { scroll: false });
  };

  const query: IdeaListFilters = useMemo(() => {
    const scope = filters.scope.startsWith('league:') ? 'leagues' : (filters.scope as IdeaListFilters['scope']);
    return {
      view,
      scope,
      league_id: filters.scope.startsWith('league:') ? filters.scope.slice(7) : null,
      asset_type: filters.asset_type || null,
      stance: filters.stance || null,
      horizon: filters.horizon || null,
      status: view === 'review_due' || view === 'closed' ? null : filters.status || null,
      q: filters.q.trim(),
      limit: PAGE,
      offset: (page - 1) * PAGE,
    };
  }, [filters, page, view]);

  const list = useIdeaList(query);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE));

  const onFilters = (next: FilterState) => {
    setFilters(next);
    setPage(1);
  };

  const newButton = (
    <LinkButton href={`${IDEAS_PATH}/yeni`} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
      Öneri paylaş
    </LinkButton>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        eyebrow="Ortak Akıl"
        title="Öneri Havuzu"
        description="Yatırım fikirlerini belirli bir düzende kaydet ve karşılaştır: varlık, gerekçe, beklenen senaryo, riskler ve izleme kriterleri. Amaç fikirleri kişisel görüşten çıkarıp gerekçe, risk ve izleme kriterleriyle birlikte değerlendirmek."
        actions={
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Breadcrumb items="Ortak Akıl" />
            {newButton}
          </div>
        }
      />

      <IdeaDisclaimer />

      <Tabs
        variant="underline"
        label="Öneri görünümü"
        value={view}
        onChange={setView}
        items={VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
      />

      <IdeaFilters value={filters} onChange={onFilters} view={view} leagues={(leagues.data ?? []).map((l) => ({ id: l.id, name: l.name }))} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-live="polite">
        <span>
          {list.data ? (
            <>
              <span className="num font-medium text-fg">{total}</span> öneri
              {view === 'newest' && ' · en yeni önce'}
              {view === 'review_due' && ' · değerlendirme tarihi en eski önce'}
              {view === 'closed' && ' · en son kapanan önce'}
            </>
          ) : (
            'Yükleniyor…'
          )}
        </span>
        {filtersActive(filters) && (
          <button type="button" onClick={() => onFilters(EMPTY_FILTERS)} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            <XMarkIcon className="h-4 w-4" aria-hidden="true" /> Filtreleri temizle
          </button>
        )}
      </div>

      {list.isLoading && !list.data ? (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <IdeaCardSkeleton key={i} />
          ))}
        </div>
      ) : list.error && !list.data ? (
        <Card>
          <EmptyState
            icon={<LightBulbIcon />}
            title="Öneriler yüklenemedi"
            description={list.error instanceof Error ? list.error.message : 'Beklenmeyen bir hata oluştu.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => void list.mutate()}>
                Tekrar dene
              </Button>
            }
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LightBulbIcon />}
            title={filtersActive(filters) ? 'Filtrelere uyan öneri yok' : EMPTY_TEXT[view].title}
            description={filtersActive(filters) ? 'Filtreleri değiştirip yeniden dene.' : EMPTY_TEXT[view].description}
            action={filtersActive(filters) ? undefined : newButton}
          />
        </Card>
      ) : (
        <ul className={cn('grid gap-4 transition-opacity sm:grid-cols-2 md:gap-6 xl:grid-cols-3', list.isValidating && 'opacity-80')}>
          {items.map((idea) => (
            <li key={idea.id}>
              <IdeaCard
                idea={idea}
                selected={compare.includes(idea.id)}
                compareDisabled={compare.length >= IDEA_LIMITS.compareMax}
                onToggleCompare={(id) => setCompare((c) => toggleCompare(c, id))}
              />
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Öneri sayfaları" />

      {compare.length > 0 && (
        <div className="sticky bottom-3 z-30 rounded-2xl border border-line bg-surface px-4 py-3 shadow-pop" role="region" aria-label="Karşılaştırma seçimi">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg">
              <ScaleIcon className="mr-1.5 inline h-4 w-4 text-brand" aria-hidden="true" />
              <span className="num font-semibold">{compare.length}</span>/{IDEA_LIMITS.compareMax} öneri seçildi
              {compare.length < 2 && <span className="text-muted"> · karşılaştırmak için en az 2 seç</span>}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCompare([])}>
                Temizle
              </Button>
              <Button size="sm" disabled={compare.length < 2} onClick={() => router.push(compareHref(compare))} icon={<ScaleIcon className="h-4 w-4" aria-hidden="true" />}>
                Karşılaştır
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
