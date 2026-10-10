'use client';

import { useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { Alert, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { isEndpointMissing } from '@/lib/labels';

/* Etkileşimli panel denetimleri: arama / seçim / tarih alanları, sayfalama, hata durumu ve onay penceresi. */

const control =
  'h-11 w-full rounded-lg border border-line bg-surface text-sm text-fg shadow-card transition-[border-color,box-shadow] placeholder:text-subtle hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

/** Büyüteç ikonlu arama kutusu (kontrollü). */
export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <label className={cn('relative block w-full sm:w-72', className)}>
      <span className="sr-only">{label}</span>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(control, 'pl-11 pr-4')} />
    </label>
  );
}

/** Yerel <select>; etiket görünür veya yalnızca ekran okuyucu için. */
export function SelectField({
  label,
  hideLabel,
  options,
  className,
  ...rest
}: { label: string; hideLabel?: boolean; options: { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-xs font-medium text-muted'}>
        {label}
      </label>
      <div className="relative">
        <select id={id} className={cn(control, 'appearance-none pl-4 pr-10')} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Tarih girişi (yerel takvim). */
export function DateField({ label, value, onChange, min, max, className }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      <input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className={cn(control, 'px-4 [color-scheme:inherit]')} />
    </div>
  );
}

/** Uç nokta henüz yoksa (404) veya hata verdiyse gösterilen boş durum + tekrar dene. */
export function LoadError({
  error,
  onRetry,
  title = 'Veriler yüklenemedi',
  description: override,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  description?: string;
  className?: string;
}) {
  const description =
    override ??
    (isEndpointMissing(error) ? 'Bu özellik için sunucu uç noktası henüz yok. Backend güncellendiğinde burada görünecek.' : error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.');
  return (
    <EmptyState
      icon={<ExclamationTriangleIcon />}
      title={title}
      description={description}
      action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Tekrar dene</Button> : undefined}
      className={cn('border-t border-line', className)}
    />
  );
}

/** Liste güncellenemedi ama eski veri var: ince uyarı */
export function StaleNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="px-5 pb-4 sm:px-6">
      <Alert tone="error">Liste güncellenemedi; son alınan veriler gösteriliyor.</Alert>
    </div>
  );
}

/** Numaralı sayfalama penceresi: 1 … 4 5 6 … 12 (null = boşluk) */
export function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push(null);
  out.push(pages);
  return out;
}

/** TailAdmin sayfalama çubuğu: önceki / numaralar / sonraki + "x–y / toplam". */
export function Pagination({ offset, limit, total, onChange, label }: { offset: number; limit: number; total: number; onChange: (offset: number) => void; label: string }) {
  if (total <= limit) {
    return total > 0 ? (
      <p className="num border-t border-line px-5 py-3 text-xs text-subtle sm:px-6">
        {formatNumber(total, 0)} kayıt
      </p>
    ) : null;
  }
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = offset + 1;
  const to = Math.min(total, offset + limit);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-6" aria-label={label}>
      <Button variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))} aria-label="Önceki sayfa">
        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Önceki</span>
      </Button>
      <p className="num text-center text-sm text-muted md:hidden">
        {formatNumber(from, 0)}–{formatNumber(to, 0)} / {formatNumber(total, 0)}
      </p>
      <ul className="hidden items-center gap-1 md:flex">
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} className="px-1 text-sm text-subtle" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange((p - 1) * limit)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Sayfa ${p}`}
                className={cn(
                  'num flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors',
                  p === page ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-brand-soft hover:text-brand',
                )}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <Button variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)} aria-label="Sonraki sayfa">
        <span className="hidden sm:inline">Sonraki</span>
        <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}

/**
 * Onay penceresi: açıklama, isteğe bağlı gerekçe alanı ve hata satırı.
 * `onConfirm` hata fırlatırsa mesaj pencerede gösterilir ve pencere açık kalır.
 */
export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Gerekçe alanı açıksa girilen metinle çağrılır */
  onConfirm: (reason: string) => Promise<void>;
  /** Gerekçe alanı (isteğe bağlı metin) */
  reason?: { label: string; placeholder?: string };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const reasonId = useId();

  // Pencere kapandığında alanları sıfırla (render sırasında; efekt kullanmadan)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError('');
      setText('');
    }
  }

  const close = () => {
    if (!busy) onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(text.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={title}
      description={description}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy} data-autofocus={reason ? undefined : true}>
            Vazgeç
          </Button>
          <Button variant={tone} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        {children}
        {reason && (
          <div>
            <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium text-fg/80">
              {reason.label} <span className="font-normal text-subtle">(isteğe bağlı)</span>
            </label>
            <textarea
              id={reasonId}
              data-autofocus
              rows={3}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reason.placeholder}
              className="w-full resize-y rounded-lg border border-line bg-transparent px-4 py-2.5 text-sm text-fg shadow-card placeholder:text-subtle hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
            />
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
