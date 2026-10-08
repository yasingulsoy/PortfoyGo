'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { cn } from '../format';

type ToastTone = 'success' | 'error' | 'info';

interface ToastOptions {
  /** Başlığın altındaki ikincil satır */
  description?: ReactNode;
  /** Milisaniye; 0 verilirse kendiliğinden kapanmaz */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  title: ReactNode;
}

type ToastFn = (title: ReactNode, opts?: ToastOptions) => number;

interface ToastContextType {
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_VISIBLE = 4;
const DEFAULT_DURATION: Record<ToastTone, number> = { success: 4000, info: 4500, error: 6500 };

const toneStyles: Record<ToastTone, { icon: typeof CheckCircleIcon; className: string }> = {
  success: { icon: CheckCircleIcon, className: 'bg-up-soft text-up' },
  error: { icon: ExclamationTriangleIcon, className: 'bg-down-soft text-down' },
  info: { icon: InformationCircleIcon, className: 'bg-brand-soft text-brand' },
};

/**
 * Uygulama geneli bildirimler. `useToast().success('Emir gönderildi')` biçiminde kullanılır.
 * Bildirimler ekran okuyuculara aria-live bölgesi üzerinden duyurulur.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      if (ms <= 0) return;
      const prev = timers.current.get(id);
      if (prev) clearTimeout(prev);
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: ReactNode, opts: ToastOptions = {}) => {
      const id = nextId.current++;
      const duration = opts.duration ?? DEFAULT_DURATION[tone];
      setToasts((list) => [...list, { id, tone, title, ...opts, duration }].slice(-MAX_VISIBLE));
      schedule(id, duration);
      return id;
    },
    [schedule],
  );

  // Sağlayıcı kaldırılırken bekleyen zamanlayıcıları temizle
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo<ToastContextType>(
    () => ({
      success: (title, opts) => push('success', title, opts),
      error: (title, opts) => push('error', title, opts),
      info: (title, opts) => push('info', title, opts),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className={cn(
          'pointer-events-none fixed z-[70] flex flex-col gap-2',
          // Mobilde alt menünün üstünde ortalı; geniş ekranda sağ alt köşe
          'inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] items-center',
          'sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end',
        )}
      >
        <style href="pg-toast-keyframes" precedence="default">
          {'@keyframes pg-toast-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}'}
        </style>
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            toast={t}
            onClose={() => dismiss(t.id)}
            onPause={() => pause(t.id)}
            onResume={() => schedule(t.id, t.duration ?? DEFAULT_DURATION[t.tone])}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose, onPause, onResume }: { toast: ToastItem; onClose: () => void; onPause: () => void; onResume: () => void }) {
  const { icon: Icon, className } = toneStyles[toast.tone];
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-3.5 pr-2.5 text-fg shadow-xl motion-safe:animate-[pg-toast-in_180ms_ease-out]"
    >
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', className)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold leading-snug">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Bildirimi kapat"
        className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı');
  return ctx;
}
