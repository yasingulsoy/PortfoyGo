'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EllipsisHorizontalIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'up' | 'down';
  disabled?: boolean;
}

type Position = { right: number; top?: number; bottom?: number };

const MENU_WIDTH = 216;
const ITEM_HEIGHT = 40;

/** Menünün düğmeye göre konumu: aşağıda yer yoksa yukarı açılır. */
function computePosition(btn: HTMLElement, itemCount: number): Position {
  const r = btn.getBoundingClientRect();
  const height = itemCount * ITEM_HEIGHT + 16;
  const right = Math.max(8, window.innerWidth - r.right);
  return r.bottom + height + 8 > window.innerHeight && r.top > height ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 };
}

const TONE = {
  default: 'text-muted hover:text-fg',
  up: 'text-up',
  down: 'text-down',
} as const;

/**
 * Satır sonu "⋯" menüsü (TailAdmin açılır menü görünümü).
 * Menü gövdeye portal ile sabit konumda açılır; böylece yatay kayan tablo kaplarında kırpılmaz.
 * Esc ve dışarı tıklama menüyü kapatır; kaydırmada menü düğmeyi takip eder (düğme görünümden çıkarsa kapanır); ↑/↓ ile gezilir.
 */
export default function RowMenu({ items, label, className }: { items: RowMenuItem[]; label: string; className?: string }) {
  const [pos, setPos] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = pos !== null;
  const itemCount = items.length;

  const toggle = () => {
    if (open) {
      setPos(null);
      return;
    }
    const btn = buttonRef.current;
    if (!btn) return;
    setPos(computePosition(btn, items.length));
  };

  useEffect(() => {
    if (!open) return;
    // preventScroll: odaklanma sayfayı kaydırıp menüyü hemen kapatmasın
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });

    const close = () => setPos(null);
    const follow = () => {
      const btn = buttonRef.current;
      if (!btn) return close();
      const r = btn.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return close();
      setPos(computePosition(btn, itemCount));
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, itemCount]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) return;
    if (e.key === 'Tab') {
      setPos(null);
      return;
    }
    e.preventDefault();
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (!nodes.length) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-fg',
          open && 'bg-surface-3 text-fg',
          className,
        )}
      >
        <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={{ position: 'fixed', right: pos.right, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH }}
            className="z-50 rounded-2xl border border-line bg-surface p-2 text-fg shadow-pop"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  setPos(null);
                  buttonRef.current?.focus();
                  item.onSelect();
                }}
                className={cn(
                  'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:pointer-events-none disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0',
                  TONE[item.tone ?? 'default'],
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
