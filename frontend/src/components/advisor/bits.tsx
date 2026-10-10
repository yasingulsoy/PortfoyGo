import { useId, type ReactNode } from 'react';
import { InformationCircleIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import { ChevronDownIcon } from '@heroicons/react/16/solid';
import { cn } from '@portfoygo/shared/format';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import type { AdvisorDataQuality } from '@/types';
import { DATA_QUALITY, DISCLAIMER } from './model';

const ALIGN = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
} as const;

/**
 * Terim açıklaması: (i) düğmesine gelince ya da odaklanınca (dokunmatikte dokununca) açılır, Esc ile kapanır.
 * Açıklama metni düğmeye `aria-describedby` ile bağlıdır; ekran okuyucular doğrudan okur.
 */
export function InfoTip({
  label,
  children,
  align = 'center',
  side = 'top',
  className,
}: {
  label: string;
  children: ReactNode;
  align?: keyof typeof ALIGN;
  /** Kaydırılabilir kapların (tablo) başlığında 'bottom' kullanın */
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn('group/tip relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={`${label}: bu ne demek?`}
        aria-describedby={id}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
        className="-m-1 inline-flex rounded-full p-1 text-subtle transition-colors hover:text-brand focus-visible:text-brand"
      >
        <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute z-30 hidden w-64 max-w-[min(16rem,calc(100vw-3rem))] rounded-xl border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-muted shadow-pop',
          'group-hover/tip:block group-focus-within/tip:block',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          ALIGN[align],
        )}
      >
        <span className="mb-1 block font-semibold text-fg">{label}</span>
        {children}
      </span>
    </span>
  );
}

/** "Bu ne demek?" açılır açıklaması (yerel <details>; klavye ve ekran okuyucu desteği tarayıcıdan). */
export function Explain({ children, summary = 'Bu ne demek?', className }: { children: ReactNode; summary?: string; className?: string }) {
  return (
    <details className={cn('group/ex text-sm', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-xs font-medium text-brand hover:underline [&::-webkit-details-marker]:hidden">
        <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
        {summary}
        <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open/ex:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-2 space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">{children}</div>
    </details>
  );
}

/** Backend uyarısı aynı cümleyle başlıyorsa tekrar etme; yalnızca ek kısmı göster. */
function extraDisclaimer(text?: string | null): string {
  const t = (text ?? '').trim();
  return t.startsWith(DISCLAIMER) ? t.slice(DISCLAIMER.length).trim() : t;
}

/** Her görünümde yer alan uyarı. */
export function DisclaimerNote({ text, className }: { text?: string | null; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border border-gold/30 bg-gold-soft px-3.5 py-2.5 text-xs leading-relaxed text-fg', className)}>
      <ShieldExclamationIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{DISCLAIMER}</strong>
        <span className="text-muted"> {extraDisclaimer(text) || 'Tüm işlemler sanal parayla, eğitim amaçlıdır.'}</span>
      </span>
    </p>
  );
}

/** Hesaplamada kullanılan verinin niteliği. */
export function DataQualityChip({ quality }: { quality: AdvisorDataQuality }) {
  const q = DATA_QUALITY[quality];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={q.tone}>{q.label}</Badge>
      <InfoTip label={q.label} align="end">
        {q.help}
      </InfoTip>
    </span>
  );
}

/** Radyo düğmeli bölümlü seçici (vade gibi kısa seçenekler için). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 block text-sm font-medium text-fg/80">{label}</legend>
      <div className="flex gap-0.5 rounded-lg bg-surface-3 p-0.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={cn(
                'relative flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40',
                active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
              )}
            >
              <input type="radio" name={name} className="sr-only" checked={active} onChange={() => onChange(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
