'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import type { GameAccent } from './GamePanel';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  accent?: GameAccent;
  children: ReactNode;
  footer?: ReactNode;
  /** Esc / arka plan ile kapatılabilir (varsayılan açık) */
  dismissible?: boolean;
  /** Panelin arkasında dönen ışınlar (ödül / zafer) */
  rays?: boolean;
  /** Kapat (×) düğmesi */
  closeButton?: boolean;
  className?: string;
  /** Diyalog katmanında çizilecek ek öğeler (ör. konfeti) */
  overlay?: ReactNode;
  /** Geniş pencere (sonuç ekranı) */
  wide?: boolean;
}

/** Oyun penceresi: yerel <dialog> (odak tuzağı, Esc) + kalın panel + kurdele başlık. İlk odak için `data-autofocus`. */
export default function GameDialog({ open, onClose, title, accent = 'blue', children, footer, dismissible = true, rays, closeButton = true, className, overlay, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn('g-dialog', wide && 'max-w-[min(560px,calc(100vw-24px))]')}
      aria-labelledby={title ? titleId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="relative px-1 pb-3 pt-7">
          {overlay}
          {rays && (
            <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/4">
              <div className="g-anim-spin-slow h-full w-full rounded-full bg-[repeating-conic-gradient(from_0deg,var(--g-gold-top)_0deg_9deg,transparent_9deg_22deg)] opacity-60 [mask-image:radial-gradient(circle,black_20%,transparent_66%)]" />
            </div>
          )}
          <div className={cn('g-panel g-anim-pop relative p-5 pt-8', className)}>
            {title && (
              <div className="absolute -top-5 left-0 right-0 flex justify-center px-10">
                <h2 id={titleId} className={cn('g-ribbon max-w-full truncate text-lg', `g-ribbon--${accent}`)}>
                  {title}
                </h2>
              </div>
            )}
            {closeButton && dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Kapat"
                className="g-focus absolute -right-2 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-(--g-red-edge) bg-(--g-red) text-(--g-on-color) shadow-[0_3px_0_var(--g-red-edge)] active:translate-y-0.5"
              >
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {children}
            {footer && <div className="mt-5">{footer}</div>}
          </div>
        </div>
      )}
    </dialog>
  );
}
