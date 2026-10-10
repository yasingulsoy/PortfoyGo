'use client';

import { useId, useState } from 'react';
import { CalculatorIcon } from '@heroicons/react/20/solid';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Select } from '@/components/common/controls';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { advisorApi } from '@/lib/api';
import type { AdvisorPlan, AdvisorProfileDef, AdvisorProfileResult } from '@/types';
import { Segmented } from './bits';
import { AMOUNT_CHIPS, HORIZONS, MIN_AMOUNT, formatAmountInput, parseAmount } from './model';

export interface BuilderInitial {
  horizon: number;
  amount: number;
  override: string;
}

const MAX_AMOUNT = 100_000_000;

/** Öneri ayarları: vade, tutar ve (isteğe bağlı) farklı bir risk profili. */
export default function PlanBuilder({
  result,
  profiles,
  initial,
  onPlan,
  className,
}: {
  result: AdvisorProfileResult;
  profiles: AdvisorProfileDef[];
  initial?: Partial<BuilderInitial>;
  onPlan: (plan: AdvisorPlan) => void;
  className?: string;
}) {
  const { totals, loaded } = useLivePortfolio();
  const amountId = useId();
  const [horizon, setHorizon] = useState<number>(initial?.horizon && HORIZONS.includes(initial.horizon as never) ? initial.horizon : 24);
  const [text, setText] = useState(() => formatAmountInput(initial?.amount || 100_000));
  const [override, setOverride] = useState(initial?.override ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(text);
  const netWorth = Math.floor(totals.netWorth);
  const invalid = amount < MIN_AMOUNT ? `En az ${formatTRY(MIN_AMOUNT)} gir.` : amount > MAX_AMOUNT ? 'Tutar çok büyük.' : null;

  const options = [
    { value: '', label: `Profilim: ${result.profile.label}` },
    ...profiles.filter((p) => p.id !== result.profile.id).map((p) => ({ value: p.id, label: p.label })),
  ];

  const submit = async () => {
    if (invalid) return;
    setLoading(true);
    setError(null);
    try {
      const plan = await advisorApi.createPlan({
        profile_id: result.id || undefined,
        profile_override: override || undefined,
        horizon_months: horizon,
        amount_try: Math.floor(amount),
      });
      onPlan(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öneri hesaplanamadı. Lütfen tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  const chip = (value: number, label: string) => {
    const active = Math.floor(amount) === Math.floor(value);
    return (
      <button
        key={label}
        type="button"
        aria-pressed={active}
        onClick={() => setText(formatAmountInput(value))}
        className={cn(
          'num h-8 rounded-full border px-3 text-xs font-medium transition-colors',
          active ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader icon={<AdjustmentsHorizontalIcon />} title="Öneri ayarları" description="Vade ve tutarı seç, gerisini algoritma yapar" />
      <form
        className="grid gap-5 px-5 pb-5 sm:px-6 sm:pb-6 lg:grid-cols-12 lg:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-busy={loading}
      >
        <Segmented
          className="lg:col-span-4"
          label="Vade"
          value={horizon}
          onChange={setHorizon}
          options={HORIZONS.map((h) => ({ value: h, label: `${h} ay` }))}
        />

        <div className="lg:col-span-5">
          <label htmlFor={amountId} className="mb-1.5 block text-sm font-medium text-fg/80">
            Tutar
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm text-subtle">₺</span>
            <input
              id={amountId}
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(formatAmountInput(parseAmount(e.target.value)))}
              aria-invalid={!!invalid}
              aria-describedby={`${amountId}-hint`}
              className={cn(
                'num h-9 w-full rounded-lg border bg-transparent pl-8 pr-3 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10',
                invalid ? 'border-down' : 'border-line hover:border-line-strong',
              )}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Hızlı tutarlar">
            {AMOUNT_CHIPS.map((v) => chip(v, `₺${v.toLocaleString('tr-TR')}`))}
            {loaded && netWorth >= MIN_AMOUNT && chip(netWorth, 'Tüm varlığım')}
          </div>
          <p id={`${amountId}-hint`} className={cn('mt-1.5 text-xs', invalid ? 'text-down' : 'text-subtle')}>
            {invalid ?? 'Simülasyonun başlangıç değeri. Uygularken tutarı yeniden seçebilirsin.'}
          </p>
        </div>

        <div className="lg:col-span-3">
          <p aria-hidden="true" className="mb-1.5 block text-sm font-medium text-fg/80">
            Profilimden farklı dene
          </p>
          <Select label="Profilimden farklı dene" value={override} onChange={setOverride} options={options} className="[&_select]:h-9" />
          <p className="mt-1.5 text-xs text-subtle">Farklı bir risk düzeyinin sonuçlarını karşılaştır.</p>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
          <p className="text-xs text-muted" aria-live="polite">
            {loading ? 'Binlerce senaryo hesaplanıyor…' : `${horizon} ay · ${amount > 0 ? formatTRY(amount) : '—'} · ${options.find((o) => o.value === override)?.label}`}
          </p>
          <Button type="submit" loading={loading} disabled={!!invalid} icon={<CalculatorIcon className="h-4 w-4" aria-hidden="true" />}>
            Öneriyi hesapla
          </Button>
        </div>

        {error && (
          <Alert tone="error" className="lg:col-span-12">
            {error}
          </Alert>
        )}
      </form>
    </Card>
  );
}
