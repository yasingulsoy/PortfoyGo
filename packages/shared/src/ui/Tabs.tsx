'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../format';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** "segment": kutulu anahtar; "underline": alt çizgili sekme */
  variant?: 'segment' | 'underline';
  label: string;
  className?: string;
}

/** Klavye ile (←/→) gezilebilen erişilebilir sekme listesi. */
export default function Tabs<T extends string>({ items, value, onChange, variant = 'segment', label, className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'scrollbar-none flex overflow-x-auto',
        variant === 'segment' ? 'gap-1 rounded-xl bg-surface-2 p-1' : 'gap-5 border-b border-line',
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors',
              variant === 'segment'
                ? cn('h-8 rounded-lg px-3', active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')
                : cn('-mb-px h-11 border-b-2', active ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg'),
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('num rounded px-1 text-[11px]', active ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-subtle')}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
