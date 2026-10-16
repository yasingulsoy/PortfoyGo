'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDownIcon, LightBulbIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { controlClass } from '@/components/leagues/shared';

/** Sayaçlı çok satırlı alan: etiket, ipucu, isteğe bağlı örnek metin ve hata. */
export function TextAreaField({
  label,
  value,
  onChange,
  max,
  min,
  rows = 4,
  hint,
  example,
  error,
  placeholder,
  optional,
  autoFocus,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  min?: number;
  rows?: number;
  hint?: ReactNode;
  example?: string;
  error?: string | null;
  placeholder?: string;
  optional?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const len = value.trim().length;
  const short = min !== undefined && len > 0 && len < min;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium text-fg/80">
        <span>
          {label}
          {optional && <span className="font-normal text-subtle"> (isteğe bağlı)</span>}
        </span>
        <span className={cn('num shrink-0 text-xs', short || len > max ? 'text-down' : 'text-subtle')} aria-hidden="true">
          {min !== undefined && len < min ? `${len}/${min}+` : `${len}/${max}`}
        </span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max + 50}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        data-autofocus={autoFocus ? true : undefined}
        className={cn(controlClass, 'resize-y py-2.5 leading-relaxed', error && 'border-down/60')}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-down">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-subtle">
            {hint}
          </p>
        )
      )}
      {example && <ExampleText text={example} onUse={value.trim() ? undefined : () => onChange(example)} />}
    </div>
  );
}

/** "Örnek göster" açılır metni (+ boş alana örneği aktar) */
export function ExampleText({ text, onUse }: { text: string; onUse?: () => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <LightBulbIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? 'Örneği gizle' : 'Örnek göster'}
        <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="mt-2 rounded-lg border border-dashed border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <p className="whitespace-pre-line">{text}</p>
          {onUse && (
            <button type="button" onClick={onUse} className="mt-2 font-medium text-brand hover:underline">
              Örneği alana aktar (sonra kendi fikrine göre düzenle)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Numaralı adım kartı başlığı */
export function StepHeader({ n, title, done, description }: { n: number; title: string; done?: boolean; description?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          done ? 'bg-up-soft text-up' : 'bg-brand-soft text-brand',
        )}
      >
        {done ? '✓' : n}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">
          <span className="sr-only">Adım {n}: </span>
          {title}
          {done && <span className="sr-only"> (tamam)</span>}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}

/** Seçenek kartı (radyo) */
export function OptionTile({
  name,
  checked,
  onChange,
  title,
  description,
  icon,
  tone = 'brand',
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'up' | 'down' | 'gold';
}) {
  const ring = { brand: 'border-brand bg-brand-soft', up: 'border-up bg-up-soft', down: 'border-down bg-down-soft', gold: 'border-gold bg-gold-soft' }[tone];
  const text = { brand: 'text-brand', up: 'text-up', down: 'text-down', gold: 'text-gold' }[tone];
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30',
        checked ? ring : 'border-line hover:border-line-strong',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {icon && <span className={cn('mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5', checked ? text : 'text-muted')}>{icon}</span>}
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', checked ? text : 'text-fg')}>{title}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
