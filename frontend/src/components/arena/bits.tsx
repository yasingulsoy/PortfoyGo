'use client';

import { useId, type ReactNode } from 'react';
import { ClockIcon, CommandLineIcon, ShieldCheckIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { ARENA_SHORTCUTS } from './model';

/** Üzerine gelince / odaklanınca açılan küçük ipucu (yalnızca CSS; dokunmatikte odakla açılır). */
export function Tip({
  label,
  children,
  tip,
  className,
  align = 'left',
}: {
  label: string;
  children: ReactNode;
  tip: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  const id = useId();
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        {children}
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          // Gizliyken yer kaplamasın (display:none): dar ekranda sayfayı yatay taşırmaz
          'pointer-events-none absolute top-full z-40 mt-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 text-left text-xs font-normal leading-relaxed text-muted shadow-pop',
          'group-focus-within/tip:block group-hover/tip:block motion-safe:animate-[enter_160ms_ease-out]',
          align === 'right' ? 'right-0' : 'left-0',
        )}
      >
        {tip}
      </span>
    </span>
  );
}

/** "Hızlandırılmış geçmiş veri" bilgi çipi. */
export function ReplayChip({ align }: { align?: 'left' | 'right' }) {
  return (
    <Tip
      label="Hızlandırılmış geçmiş veri hakkında"
      align={align}
      tip={
        <>
          <span className="block font-semibold text-fg">Fiyatlar gerçek piyasadan gelir</span>
          Turdaki fiyatlar, geçmişteki gerçek bir piyasa hareketinin sunucuda hızlandırılarak yeniden oynatılmasıdır. Veri boşlukları benzetimle doldurulur.
          Hangi tarih aralığının oynatıldığı tur bitince açıklanır.
        </>
      }
    >
      <ClockIcon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
      Hızlandırılmış geçmiş veri
    </Tip>
  );
}

/** Kısayol yardımı. */
export function ShortcutsTip({ align = 'right' }: { align?: 'left' | 'right' }) {
  // Dokunmatik / dar ekranda klavye kısayolu ipucu gösterilmez
  return (
    <span className="hidden sm:inline-flex">
      <Tip
        label="Klavye kısayolları"
        align={align}
        tip={
          <>
            <span className="mb-2 block font-semibold text-fg">Klavye kısayolları</span>
            <span className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
              {ARENA_SHORTCUTS.map((s) => (
                <span key={s.keys} className="contents">
                  <kbd className="num min-w-7 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-center font-sans text-[11px] text-fg">{s.keys}</kbd>
                  <span>{s.label}</span>
                </span>
              ))}
            </span>
          </>
        }
      >
        <CommandLineIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Kısayollar
      </Tip>
    </span>
  );
}

/** Sorumlu oyun notu: her arena ekranında görünür. */
export function ResponsibleNote({ className, limit = true }: { className?: string; limit?: boolean }) {
  return (
    <p className={cn('flex items-start gap-2 text-xs leading-relaxed text-muted', className)}>
      <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden="true" />
      <span>
        <span className="font-medium text-fg">Sanal para — gerçek yatırım değildir.</span>
        {limit && ' Saatlik tur sayısı sınırlıdır; ara vermeyi unutma, oyun sakin kafayla daha keyifli.'}
      </span>
    </p>
  );
}

/** Canlı bağlantı göstergesi. */
export function LiveDot({ live, className }: { live: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', live ? 'text-up' : 'text-subtle', className)} role="status">
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inline-flex h-full w-full rounded-full bg-up opacity-60 motion-safe:animate-ping" />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', live ? 'bg-up' : 'bg-line-strong')} />
      </span>
      {live ? 'Canlı' : 'Bağlanıyor…'}
    </span>
  );
}

/** Sıra rozetinin rengi (ilk üç: altın, gümüş, bronz). */
export function RankBadge({ rank, className }: { rank: number | null | undefined; className?: string }) {
  const tone =
    rank === 1 ? 'bg-gold-soft text-gold' : rank === 2 ? 'bg-surface-3 text-silver' : rank === 3 ? 'bg-gold-soft text-bronze' : 'bg-surface-2 text-muted';
  return (
    <span className={cn('num inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold', tone, className)}>
      {rank ?? '—'}
    </span>
  );
}
