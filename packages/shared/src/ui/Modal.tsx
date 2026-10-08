'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { cn } from '../format';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

/**
 * Yerel <dialog> üzerine kurulu modal: odak tuzağı, Esc ile kapanma ve
 * arka plan kilidi tarayıcı tarafından sağlanır. İlk odak için alana `data-autofocus` ekleyin.
 */
export default function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // React'in autoFocus'u dialog açılmadan çalıştığından odak burada verilir
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Arka plana tıklayınca kapat
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl',
        'max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none',
        size === 'sm' ? 'max-w-sm' : 'max-w-md',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold tracking-tight">{title}</h2>
              {description && <p id={descId} className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="safe-bottom border-t border-line px-5 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
