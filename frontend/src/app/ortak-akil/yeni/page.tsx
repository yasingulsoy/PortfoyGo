'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useRefreshIdeas } from '@/hooks/useIdeas';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useToast } from '@portfoygo/shared/ui/Toast';
import Breadcrumb from '@/components/common/Breadcrumb';
import { toolbarButtonClass } from '@/components/common/controls';
import IdeaForm from '@/components/ideas/IdeaForm';
import { IDEAS_PATH, ideaHref, ideasApi } from '@/lib/ideas';
import type { CreateIdeaInput } from '@/types/ideas';

export default function NewIdeaPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <NewIdea verified={user.email_verified} />;
}

function NewIdea({ verified }: { verified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefreshIdeas();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: CreateIdeaInput) => {
    setBusy(true);
    setError(null);
    try {
      const idea = await ideasApi.create(input);
      void refresh();
      toast.success('Öneri yayınlandı', { description: `${idea.symbol} · referans fiyat kaydedildi` });
      router.push(ideaHref(idea.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Öneri yayınlanamadı.');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 md:space-y-6">
      <Link href={IDEAS_PATH} className={toolbarButtonClass}>
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Öneri Havuzu
      </Link>
      <PageHeader
        eyebrow="Ortak Akıl"
        title="Yeni öneri"
        description="Fikrini adım adım yapılandır: gerekçe, beklenen senaryo, riskler ve izleme kriterleri. Diğer üyeler gerekçeli olarak katılır ya da katılmaz."
        actions={
          <Breadcrumb
            items={[
              { label: 'Panel', href: '/' },
              { label: 'Ortak Akıl', href: IDEAS_PATH },
              { label: 'Yeni öneri' },
            ]}
          />
        }
      />
      {!verified ? (
        <Alert tone="info">
          Öneri paylaşmak için e-posta adresini doğrulaman gerekiyor.{' '}
          <Link href="/verify-email" className="font-semibold underline underline-offset-2">
            E-postamı doğrula
          </Link>
        </Alert>
      ) : (
        <IdeaForm busy={busy} error={error} onSubmit={(i) => void submit(i)} />
      )}
    </div>
  );
}
