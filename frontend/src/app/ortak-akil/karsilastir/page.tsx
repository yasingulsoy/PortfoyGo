'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon, ScaleIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useIdeaCompare } from '@/hooks/useIdeas';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import { toolbarButtonClass } from '@/components/common/controls';
import CompareView from '@/components/ideas/CompareView';
import { IdeaDisclaimer } from '@/components/ideas/parts';
import { IDEAS_PATH, parseCompareIds } from '@/lib/ideas';

export default function ComparePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <CompareGate />
    </Suspense>
  );
}

function CompareGate() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <Compare />;
}

function Compare() {
  const search = useSearchParams();
  const ids = parseCompareIds(search.get('ids'));
  const { data, error, isLoading, mutate } = useIdeaCompare(ids);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={IDEAS_PATH} className={toolbarButtonClass}>
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Öneri Havuzu
        </Link>
        <Breadcrumb
          items={[
            { label: 'Panel', href: '/' },
            { label: 'Ortak Akıl', href: IDEAS_PATH },
            { label: 'Karşılaştır' },
          ]}
        />
      </div>
      <PageHeader
        eyebrow="Ortak Akıl"
        title="Önerileri karşılaştır"
        description="Aynı ya da farklı varlıklar üzerindeki önerileri gerekçe, senaryo, risk ve izleme kriterleri açısından yan yana incele."
      />
      <IdeaDisclaimer />

      {ids.length < 2 ? (
        <Card>
          <EmptyState
            icon={<ScaleIcon />}
            title="Karşılaştırmak için 2–3 öneri seç"
            description="Öneri Havuzu’nda kartlardaki “Karşılaştır” kutularını işaretle."
            action={<LinkButton href={IDEAS_PATH}>Önerilere dön</LinkButton>}
          />
        </Card>
      ) : isLoading && !data ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : error && !data ? (
        <Card>
          <EmptyState
            icon={<ScaleIcon />}
            title="Karşılaştırma yüklenemedi"
            description={error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                Tekrar dene
              </Button>
            }
          />
        </Card>
      ) : data ? (
        <>
          {data.missing.length > 0 && <Alert tone="info">{data.missing.length} öneri bulunamadı ya da görme yetkin yok; listeden çıkarıldı.</Alert>}
          {data.items.length > 0 ? (
            <CompareView items={data.items} />
          ) : (
            <Card>
              <EmptyState icon={<ScaleIcon />} title="Gösterilecek öneri yok" action={<LinkButton href={IDEAS_PATH}>Önerilere dön</LinkButton>} />
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
