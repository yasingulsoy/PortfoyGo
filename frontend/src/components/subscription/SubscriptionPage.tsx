'use client';

import { useState } from 'react';
import { CheckIcon, MinusIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { CreditCardIcon, GlobeEuropeAfricaIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useEntitlements, usePlans } from '@/hooks/useEntitlements';
import { featureRows, formatLongDate, statusSummary, type EntitlementState, type Plan } from '@/lib/subscriptions';

const SOURCE_LABEL: Record<string, string> = { trial: 'Ücretsiz deneme', admin: 'Ekip tanımı', payment: 'Ödeme' };

/** /abonelik: güncel durum, plan karşılaştırması, deneme düğmesi ve ödeme notu. */
export default function SubscriptionPage() {
  const ent = useEntitlements();
  const plans = usePlans();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTrial = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await ent.startTrial();
      toast.success('Premium deneme başladı', { description: `Bitiş: ${formatLongDate(s.current?.ends_at)}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deneme başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const list = plans.data?.plans ?? [];
  const rows = featureRows(list);

  return (
    <div className="space-y-4 md:space-y-6">
      <StatusCard state={ent.state} loading={ent.loading} busy={busy} onTrial={() => void onTrial()} />
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="plans-heading" className="space-y-3">
        <h2 id="plans-heading" className="text-lg font-semibold text-fg">
          Planlar
        </h2>
        {plans.isLoading && !plans.data ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : plans.error && !plans.data ? (
          <Alert tone="error">Planlar yüklenemedi. Sayfayı yenileyip tekrar dene.</Alert>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            {list.map((p) => (
              <PlanCard key={p.id} plan={p} rows={rows} current={ent.state?.plan.id === p.id} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader title="Ödeme ve yasal bilgiler" icon={<CreditCardIcon />} />
        <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6 sm:pb-6">
          <Alert tone="info">
            <strong className="font-semibold">Ödeme altyapısı yakında.</strong> Premium şu an yalnızca {ent.state?.trial.days ?? 14} günlük ücretsiz
            deneme veya PortfoyGo ekibinin tanımıyla açılabilir; kart bilgisi istenmez ve hiçbir ücret alınmaz.
          </Alert>
          <p>
            Ödemeli abonelik açıldığında fiyat, faturalandırma (KDV dahil), mesafeli satış sözleşmesi, ön bilgilendirme formu ve cayma hakkı koşulları
            bu sayfada ve satın alma adımında açıkça gösterilecek.
          </p>
          <p>Deneme veya Premium süresi dolduğunda hesabın kendiliğinden ücretsiz plana döner; kayıtlı senaryoların ve araştırma listen silinmez.</p>
        </div>
      </Card>
    </div>
  );
}

function StatusCard({ state, loading, busy, onTrial }: { state: EntitlementState | null; loading: boolean; busy: boolean; onTrial: () => void }) {
  if (loading || !state) return <Skeleton className="h-36 w-full rounded-2xl" />;
  const premium = state.status !== 'free';
  const cur = state.current;
  const totalDays = state.status === 'trial' ? state.trial.days : null;
  const progress = cur && totalDays && cur.days_left !== null ? Math.min(1, Math.max(0, 1 - cur.days_left / totalDays)) : null;

  return (
    <Card featured={premium} className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', premium ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-fg')}
            aria-hidden="true"
          >
            {premium ? <SparklesIcon className="h-6 w-6" /> : <GlobeEuropeAfricaIcon className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted">Güncel planın</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-semibold text-fg">
              {state.plan.name}
              <Badge tone={premium ? 'brand' : 'neutral'}>{statusSummary(state)}</Badge>
            </p>
            {cur ? (
              <p className="num mt-1 text-sm text-muted">
                {SOURCE_LABEL[cur.source] ?? cur.source} · başlangıç {formatLongDate(cur.starts_at)}
                {cur.ends_at ? ` · bitiş ${formatLongDate(cur.ends_at)}` : ' · süresiz'}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Katalog, filtreler ve sınıflandırma ücretsiz. Senaryo laboratuvarı ve tam araştırma notları Premium&apos;da.
              </p>
            )}
            {progress !== null && (
              <div className="mt-3 max-w-sm">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-label="Deneme süresi"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {state.trial.eligible ? (
            <Button onClick={onTrial} loading={busy} icon={<SparklesIcon className="h-4 w-4" aria-hidden="true" />}>
              {state.trial.days} gün ücretsiz dene
            </Button>
          ) : null}
          <LinkButton href="/global-lab" variant="secondary">
            Global Portföy Lab&apos;a git
          </LinkButton>
        </div>
      </div>
      {!premium && state.trial.used && (
        <p className="border-t border-line bg-surface-2 px-5 py-3 text-xs text-muted sm:px-6">
          Ücretsiz deneme hakkını {state.trial.ended_at ? `${formatLongDate(state.trial.ended_at)} tarihinde ` : ''}kullandın. Ödeme altyapısı açıldığında
          Premium&apos;a buradan geçebileceksin.
        </p>
      )}
    </Card>
  );
}

function PlanCard({ plan, rows, current }: { plan: Plan; rows: ReturnType<typeof featureRows>; current: boolean }) {
  const premium = plan.id === 'premium';
  return (
    <Card featured={premium} className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg">{plan.name}</h3>
          {plan.description && <p className="mt-1 text-sm text-muted">{plan.description}</p>}
        </div>
        {current && <Badge tone="up">Şu anki plan</Badge>}
      </div>
      <p className="num mt-4 text-2xl font-semibold text-fg">{plan.price_display}</p>
      {premium && <p className="mt-0.5 text-xs text-subtle">Fiyat ödeme altyapısıyla birlikte açıklanacak</p>}
      <ul className="mt-5 flex-1 space-y-2.5" aria-label={`${plan.name} özellikleri`}>
        {rows.map((r) => {
          const on = r.plans[plan.id];
          return (
            <li key={r.key} className={cn('flex items-start gap-2 text-sm', on ? 'text-fg' : 'text-subtle')}>
              {on ? (
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden="true" />
              ) : (
                <MinusIcon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="sr-only">{on ? 'Dahil: ' : 'Dahil değil: '}</span>
                {r.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
