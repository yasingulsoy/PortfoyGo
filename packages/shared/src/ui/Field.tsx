'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid';
import { cn } from '../format';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Sağ tarafta gösterilecek ek (ör. birim) */
  suffix?: ReactNode;
}

const inputBase =
  'h-11 w-full rounded-lg border bg-surface px-3.5 text-sm text-fg placeholder:text-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60';

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, suffix, className, id, type, 'aria-describedby': describedBy, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={[error ? `${inputId}-err` : hint ? `${inputId}-hint` : null, describedBy].filter(Boolean).join(' ') || undefined}
          className={cn(inputBase, error ? 'border-down' : 'border-line hover:border-line-strong', (!!suffix || isPassword) && 'pr-11')}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Şifreyi gizle' : 'Şifreyi göster'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-subtle hover:text-fg"
          >
            {reveal ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        ) : (
          suffix && <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-medium text-subtle">{suffix}</span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-xs text-down">{error}</p>
      ) : (
        hint && <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-subtle">{hint}</p>
      )}
    </div>
  );
});
