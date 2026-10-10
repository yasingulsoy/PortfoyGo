'use client';

import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ArrowLeftIcon, ArrowPathIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { ApiError, advisorApi } from '@/lib/api';
import { useAdvisorPlan, useAdvisorProfile, useAdvisorQuestionnaire } from '@/hooks/useAdvisor';
import type { AdvisorPlan, AdvisorProfileDef, AdvisorProfileResult } from '@/types';
import AdvisorIntro from './AdvisorIntro';
import PastPlans from './PastPlans';
import PlanBuilder from './PlanBuilder';
import PlanView from './PlanView';
import ProfileCard from './ProfileCard';
import Questionnaire from './Questionnaire';
import { DisclaimerNote } from './bits';

type View = { kind: 'home' } | { kind: 'quiz' } | { kind: 'result' } | { kind: 'plan'; planId: string | null };

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/** /advisor sayfasının içeriği: karşılama → anket → profil sonucu → öneri. */
export default function Advisor() {
  const questionnaire = useAdvisorQuestionnaire();
  const profile = useAdvisorProfile();
  const { mutate } = useSWRConfig();
  const [view, setView] = useState<View>({ kind: 'home' });
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const go = (next: View) => {
    setView(next);
    scrollTop();
  };

  const profiles = questionnaire.data?.profiles ?? [];
  const result = profile.data ?? null;
  const missing = (err: unknown) => err instanceof ApiError && err.status === 404;

  // Anketten dönünce sonuç başlığına odaklan (ekran okuyucu profili duyurur)
  useEffect(() => {
    if (view.kind === 'result') resultHeading.current?.focus({ preventScroll: true });
  }, [view.kind]);

  if ((profile.isLoading && !profile.data) || (questionnaire.isLoading && !questionnaire.data && view.kind !== 'plan')) {
    return <AdvisorSkeleton />;
  }

  if (profile.error && !profile.data) {
    return (
      <Unavailable
        notReady={missing(profile.error)}
        message={profile.error instanceof Error ? profile.error.message : undefined}
        onRetry={() => void Promise.all([profile.mutate(), questionnaire.mutate()])}
      />
    );
  }

  /* ---------- Anket ---------- */
  if (view.kind === 'quiz') {
    if (!questionnaire.data?.questions.length) {
      return (
        <Unavailable
          notReady={missing(questionnaire.error) || !questionnaire.error}
          message={questionnaire.error instanceof Error ? questionnaire.error.message : undefined}
          onRetry={() => void questionnaire.mutate()}
        />
      );
    }
    return (
      <div className="space-y-4 md:space-y-6">
        <Questionnaire
          questionnaire={questionnaire.data}
          onCancel={() => go({ kind: 'home' })}
          onDone={(res) => {
            void mutate(advisorApi.profileKey, res, { revalidate: false });
            go({ kind: 'result' });
          }}
        />
        <DisclaimerNote className="mx-auto max-w-2xl" />
      </div>
    );
  }

  /* ---------- Profil yok: karşılama ---------- */
  if (!result) {
    return (
      <div className="space-y-4 md:space-y-6">
        {questionnaire.error && !questionnaire.data ? (
          <Unavailable
            notReady={missing(questionnaire.error)}
            message={questionnaire.error instanceof Error ? questionnaire.error.message : undefined}
            onRetry={() => void questionnaire.mutate()}
          />
        ) : (
          <AdvisorIntro questionCount={questionnaire.data?.questions.length ?? 0} onStart={() => go({ kind: 'quiz' })} />
        )}
      </div>
    );
  }

  /* ---------- Öneri çalışma alanı ---------- */
  if (view.kind === 'plan') {
    return (
      <PlanWorkspace
        key={view.planId ?? 'new'}
        result={result}
        profiles={profiles}
        openId={view.planId}
        onOpen={(id) => go({ kind: 'plan', planId: id })}
        onBack={() => go({ kind: 'home' })}
      />
    );
  }

  /* ---------- Profil sonucu / ana görünüm ---------- */
  const justFinished = view.kind === 'result';
  return (
    <div className="space-y-4 md:space-y-6">
      {justFinished && (
        <Alert tone="success" className="animate-enter">
          Risk profilin belirlendi. Şimdi profiline uygun bir dağılım önerisi oluşturabilirsin.
        </Alert>
      )}
      <ProfileCard
        result={result}
        profiles={profiles}
        eyebrow={justFinished ? 'Sonucun' : 'Risk profilin'}
        headingRef={resultHeading}
        actions={
          <>
            <Button onClick={() => go({ kind: 'plan', planId: null })} icon={<SparklesIcon className="h-4 w-4" aria-hidden="true" />}>
              {justFinished ? 'Öneri oluştur' : 'Yeni öneri oluştur'}
            </Button>
            <Button variant="secondary" onClick={() => go({ kind: 'quiz' })} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}>
              Anketi yeniden çöz
            </Button>
          </>
        }
      />
      <PastPlans onOpen={(id) => go({ kind: 'plan', planId: id })} />
      <DisclaimerNote />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlanWorkspace({
  result,
  profiles,
  openId,
  onOpen,
  onBack,
}: {
  result: AdvisorProfileResult;
  profiles: AdvisorProfileDef[];
  openId: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const opened = useAdvisorPlan(openId);
  const { mutate } = useSWRConfig();
  const [created, setCreated] = useState<AdvisorPlan | null>(null);
  const planHeading = useRef<HTMLHeadingElement>(null);
  const focusPending = useRef(!!openId);
  const plan = created ?? opened.data ?? null;

  // Yeni hesaplanan / açılan öneriye kaydır ve başlığına odaklan
  useEffect(() => {
    if (!plan || !focusPending.current) return;
    focusPending.current = false;
    const el = planHeading.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plan]);

  const initial = opened.data
    ? {
        horizon: opened.data.horizon_months,
        amount: opened.data.amount_try,
        override: opened.data.profile.id && opened.data.profile.id !== result.profile.id ? opened.data.profile.id : '',
      }
    : undefined;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />} className="-ml-2">
          Profilim
        </Button>
        <p className="text-sm text-muted">
          Profilin: <span className="font-semibold text-fg">{result.profile.label}</span>
        </p>
      </div>

      <PlanBuilder
        key={`builder-${opened.data?.id ?? 'new'}`}
        result={result}
        profiles={profiles}
        initial={initial}
        onPlan={(p) => {
          focusPending.current = true;
          setCreated(p);
          void mutate((key) => typeof key === 'string' && key.startsWith('/advisor/plans?'));
        }}
      />

      {plan ? (
        <PlanView
          key={plan.id}
          plan={plan}
          headingRef={planHeading}
          onApplied={(applied_at) => setCreated({ ...plan, applied_at })}
          className="scroll-mt-20"
        />
      ) : openId && opened.isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Öneri yükleniyor">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      ) : openId && opened.error ? (
        <Alert tone="error">
          Öneri yüklenemedi: {opened.error instanceof Error ? opened.error.message : 'bilinmeyen hata'}{' '}
          <button type="button" onClick={() => void opened.mutate()} className="font-semibold underline underline-offset-2">
            Tekrar dene
          </button>
        </Alert>
      ) : (
        <Card className="border-dashed">
          <EmptyState
            icon={<SparklesIcon />}
            title="Önerin burada görünecek"
            description="Vadeni ve tutarı seçip “Öneriyi hesapla”ya bas. Dağılım, olası senaryolar ve riskler birkaç saniyede hazırlanır."
          />
        </Card>
      )}

      <PastPlans onOpen={onOpen} activeId={plan?.id ?? openId} />
    </div>
  );
}

function AdvisorSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="Portföy Sihirbazı yükleniyor">
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

function Unavailable({ notReady, message, onRetry }: { notReady: boolean; message?: string; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<WrenchScrewdriverIcon />}
        title={notReady ? 'Portföy Sihirbazı hazırlanıyor' : 'Portföy Sihirbazı şu anda yüklenemedi'}
        description={notReady ? 'Bu özellik çok yakında kullanıma açılacak. Biraz sonra tekrar dene.' : message || 'Bağlantını kontrol edip tekrar dene.'}
        action={
          <Button variant="secondary" onClick={onRetry} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}>
            Tekrar dene
          </Button>
        }
      />
    </Card>
  );
}
