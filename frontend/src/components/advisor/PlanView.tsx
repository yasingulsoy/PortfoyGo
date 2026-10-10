'use client';

import { useState } from 'react';
import { CheckBadgeIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import { ShoppingCartIcon } from '@heroicons/react/20/solid';
import { cn, formatDateTime, formatTRY } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import type { AdvisorPlan } from '@/types';
import AllocationCard from './AllocationCard';
import ApplyModal from './ApplyModal';
import DriftCard from './DriftCard';
import FanChart from './FanChart';
import FrontierChart from './FrontierChart';
import PlanMetrics from './PlanMetrics';
import { DataQualityChip, DisclaimerNote } from './bits';

/** Hesaplanan öneri: dağılım, ölçüler, simülasyon, etkin sınır, gerekçe, karşılaştırma ve uygulama. */
export default function PlanView({
  plan,
  onApplied,
  headingRef,
  className,
}: {
  plan: AdvisorPlan;
  onApplied: (appliedAt: string) => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  className?: string;
}) {
  const [applyOpen, setApplyOpen] = useState(false);
  const chosen = { volatility: plan.metrics.volatility, expected_return: plan.metrics.expected_return };

  return (
    <section aria-labelledby="advisor-plan-title" className={cn('space-y-4 md:space-y-6', className)}>
      <Card featured className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{plan.profile.label}</Badge>
              <DataQualityChip quality={plan.data_quality} />
              {plan.applied_at && (
                <Badge tone="up">
                  <CheckBadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Uygulandı
                </Badge>
              )}
            </div>
            <h2 id="advisor-plan-title" ref={headingRef} tabIndex={-1} className="mt-2 text-xl font-semibold text-fg outline-none">
              Senin için önerilen portföy
            </h2>
            <p className="num mt-1 text-sm text-muted">
              {plan.horizon_months} ay vade · {formatTRY(plan.amount_try)}
              {plan.created_at && <> · {formatDateTime(plan.created_at)}</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
            <Button onClick={() => setApplyOpen(true)} icon={<ShoppingCartIcon className="h-4 w-4" aria-hidden="true" />}>
              {plan.applied_at ? 'Yeniden uygula' : 'Portföyüme uygula'}
            </Button>
            <p className="text-xs text-subtle">Yalnızca alım yapılır; önce önizleme gösterilir.</p>
          </div>
        </div>
        <DisclaimerNote text={plan.disclaimer} className="mt-5" />
      </Card>

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <AllocationCard allocation={plan.allocation} expectedReturn={plan.metrics.expected_return} className="xl:col-span-7" />
        <Card className="min-w-0 xl:col-span-5">
          <CardHeader icon={<LightBulbIcon />} title="Neden bu dağılım?" description="Algoritmanın gerekçeleri" />
          {plan.explanation.length ? (
            <ul className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
              {plan.explanation.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-fg">
                  <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{e}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-6 text-sm text-muted sm:px-6">Bu öneri için açıklama yok.</p>
          )}
        </Card>
      </div>

      <PlanMetrics metrics={plan.metrics} horizon={plan.horizon_months} amount={plan.amount_try} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <FanChart simulation={plan.simulation} amount={plan.amount_try} className="xl:col-span-8" />
        <FrontierChart frontier={plan.frontier} chosen={chosen} className="xl:col-span-4" />
      </div>

      <DriftCard drift={plan.current.drift} allocation={plan.allocation} />

      <ApplyModal plan={plan} open={applyOpen} onClose={() => setApplyOpen(false)} onApplied={() => onApplied(new Date().toISOString())} />
    </section>
  );
}
