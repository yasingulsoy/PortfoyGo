'use client';

import { useState, type ReactNode } from 'react';
import { CheckIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import type { FeatureKey } from '@/lib/subscriptions';

interface PremiumGateProps {
  /** Gereken yetki (ör. 'global_lab_pro') */
  feature: FeatureKey;
  /** Yetki varsa gösterilir */
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  /** Kısa fayda listesi (en fazla 3–4 madde) */
  benefits?: string[];
  /** Yetki yoksa kartın ALTINDA gösterilir (ör. salt okunur örnek) */
  fallback?: ReactNode;
  /** 'compact': satır içi küçük bilgi kutusu (ör. kilitli notlar) */
  variant?: 'card' | 'compact';
  className?: string;
}

/**
 * Premium kapısı: yetki varsa içeriği, yoksa sakin bir yükseltme kartı gösterir (deneme düğmesi + planlar bağlantısı).
 * Yalnızca arayüz yönlendirmesidir; asıl kontrol backend'dedir (402 SUBSCRIPTION_REQUIRED).
 */
export default function PremiumGate({ feature, children, title, description, benefits, fallback, variant = 'card', className }: PremiumGateProps) {
  const { state, loading, has, startTrial } = useEntitlements();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Skeleton className={cn(variant === 'compact' ? 'h-16' : 'h-56', 'w-full rounded-2xl', className)} />;
  if (has(feature)) return <>{children}</>;

  const trialDays = state?.trial.days ?? 14;
  const eligible = !!state?.trial.eligible;
  const onTrial = async () => {
    setBusy(true);
    setError(null);
    try {
      await startTrial();
      toast.success(`${trialDays} günlük Premium deneme başladı`, { description: 'Ücret alınmaz; süre dolunca ücretsiz plana dönersin.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deneme başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {eligible ? (
        <Button size={variant === 'compact' ? 'sm' : 'md'} onClick={() => void onTrial()} loading={busy} icon={<SparklesIcon className="h-4 w-4" aria-hidden="true" />}>
          {trialDays} gün ücretsiz dene
        </Button>
      ) : null}
      <LinkButton href="/abonelik" variant={eligible ? 'secondary' : 'primary'} size={variant === 'compact' ? 'sm' : 'md'}>
        Planları karşılaştır
      </LinkButton>
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className={cn('rounded-xl border border-line bg-surface-2 p-3.5', className)}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
            <LockClosedIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{title ?? 'Premium ile açılır'}</p>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
            <div className="mt-2.5">{actions}</div>
            {error && <p className="mt-2 text-xs text-down">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 md:space-y-6', className)}>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-start">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
            <SparklesIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Premium</p>
            <h2 className="mt-1 text-lg font-semibold text-fg">{title ?? 'Bu bölüm Premium üyelere açık'}</h2>
            {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
            {benefits && benefits.length > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-fg">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden="true" />
                    <span className="min-w-0">{b}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5">{actions}</div>
            {error && (
              <Alert tone="error" className="mt-4">
                {error}
              </Alert>
            )}
            <p className="mt-4 text-xs leading-relaxed text-subtle">
              {eligible
                ? `Deneme ${trialDays} gün sürer, kart bilgisi istenmez ve süre dolunca hesabın kendiliğinden ücretsiz plana döner.`
                : state?.trial.used
                  ? 'Ücretsiz deneme hakkını kullandın.'
                  : null}{' '}
              Ödeme altyapısı yakında.
            </p>
          </div>
        </div>
      </Card>
      {fallback}
    </div>
  );
}
