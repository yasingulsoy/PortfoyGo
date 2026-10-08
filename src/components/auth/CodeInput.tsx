'use client';

import { useEffect, useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/format';
import { CODE_LENGTH } from './authUtils';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Altı hane dolduğunda çağrılır */
  onComplete?: (value: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Altı ayrı kutudan oluşan sayısal kod girişi.
 * Değer her zaman bitişik bir rakam dizisidir (boşluk bırakılamaz); yapıştırma,
 * otomatik ilerleme, geri silme ile geri gitme ve ok tuşlarıyla gezinme desteklenir.
 */
export default function CodeInput({ value, onChange, onComplete, label = 'Doğrulama kodu', error, hint, disabled, autoFocus }: CodeInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const baseId = useId();
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');
  // Odak yönetimi, yeniden render beklemeden en güncel değeri görmeli
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string, focusIndex: number) => {
    const clean = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    latest.current = clean;
    onChange(clean);
    focusAt(focusIndex);
    if (clean.length === CODE_LENGTH && clean !== value) onComplete?.(clean);
  };

  const handleChange = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) {
      // Kutudaki rakam silindi
      commit(value.slice(0, i) + value.slice(i + 1), i);
      return;
    }
    if (typed.length === 1 || (typed.length === 2 && digits[i])) {
      // Tek rakam (dolu kutuda imleç ortadaysa eski rakamı at)
      const d = typed.length === 1 ? typed : typed[0] === digits[i] ? typed[1] : typed[0];
      commit(value.slice(0, i) + d + value.slice(i + 1), i + 1);
      return;
    }
    // Otomatik doldurma / çoklu giriş
    const next = value.slice(0, i) + typed;
    commit(next, Math.min(next.length, CODE_LENGTH - 1));
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      commit(value.slice(0, i - 1) + value.slice(i), i - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(Math.min(i + 1, value.length));
    }
  };

  const handlePaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    e.preventDefault();
    if (!pasted) return;
    const next = pasted.length >= CODE_LENGTH ? pasted : value.slice(0, i) + pasted;
    commit(next, Math.min(next.length, CODE_LENGTH - 1));
  };

  // Boş kutulara atlanmasın: odak her zaman ilk boş kutudan ileri gidemez
  const handleFocus = (i: number) => {
    const len = latest.current.length;
    if (i > len) focusAt(len);
    else refs.current[i]?.select();
  };

  const describedBy = error ? `${baseId}-err` : hint ? `${baseId}-hint` : undefined;

  return (
    <div>
      <p id={`${baseId}-label`} className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <div role="group" aria-labelledby={`${baseId}-label`} aria-describedby={describedBy} className="grid grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`${label}, ${i + 1}. hane`}
            aria-invalid={!!error}
            disabled={disabled}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={() => handleFocus(i)}
            className={cn(
              'num h-12 w-full min-w-0 rounded-lg border bg-surface text-center font-mono text-xl font-semibold text-fg caret-brand transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60 sm:h-14 sm:text-2xl',
              error ? 'border-down' : d ? 'border-line-strong' : 'border-line hover:border-line-strong',
            )}
          />
        ))}
      </div>
      {error ? (
        <p id={`${baseId}-err`} className="mt-1.5 text-xs text-down">{error}</p>
      ) : (
        hint && <p id={`${baseId}-hint`} className="mt-1.5 text-xs text-subtle">{hint}</p>
      )}
    </div>
  );
}
