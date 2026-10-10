'use client';

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
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

/**
 * Klavye ile (←/→) gezilebilen erişilebilir sekme listesi.
 * Aktif sekmenin arkasındaki gösterge, seçim değiştikçe yumuşakça kayar
 * (konum DOM'dan ölçülür; React state'i kullanılmaz).
 */
export default function Tabs<T extends string>({ items, value, onChange, variant = 'segment', label, className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placedRef = useRef(false);
  const keys = items.map((i) => i.value).join('|');

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;

    const place = () => {
      const btn = refs.current[items.findIndex((i) => i.value === value)];
      if (!btn) {
        indicator.style.opacity = '0';
        return;
      }
      // İlk yerleşimde animasyon olmasın
      if (!placedRef.current) indicator.style.transition = 'none';
      indicator.style.width = `${btn.offsetWidth}px`;
      indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
      indicator.style.opacity = '1';
      if (!placedRef.current) {
        placedRef.current = true;
        requestAnimationFrame(() => {
          indicator.style.transition = '';
        });
      }
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
    // keys: sekme listesi değiştiğinde yeniden ölç
  }, [value, keys, items]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  const segment = variant === 'segment';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(
        'scrollbar-none relative flex overflow-x-auto',
        segment ? 'gap-0.5 rounded-lg bg-surface-3 p-0.5' : 'gap-5 border-b border-line',
        className,
      )}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-0 opacity-0 transition-[transform,width] duration-300 ease-[var(--ease-out-soft)]',
          segment ? 'inset-y-0.5 rounded-md bg-surface shadow-card' : 'bottom-0 h-0.5 rounded-full bg-brand',
        )}
      />
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
              'relative z-10 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors',
              segment ? cn('h-9 rounded-md px-3', active ? 'text-fg' : 'text-muted hover:text-fg') : cn('h-11', active ? 'text-fg' : 'text-muted hover:text-fg'),
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('num rounded-full px-1.5 text-[11px] transition-colors', active ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-subtle')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
