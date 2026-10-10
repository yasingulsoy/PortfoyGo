'use client';

import { cn, formatNumber } from '@portfoygo/shared/format';
import { formatCountdown, spokenCountdown, useNow } from './time';

/** Arena sanal bakiyesi dolar cinsindendir (oyuncu uygulamasıyla aynı): "$10.000" */
export const formatCash = (n: number) => `${n < 0 ? '-' : ''}$${formatNumber(Math.abs(n), 0)}`;

/** Seçim çipi (radio / checkbox etiketinin kendisi); yerel girdi sr-only kalır. */
export const chipClass = cn(
  'relative inline-flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-muted shadow-card transition-colors',
  'hover:border-line-strong hover:text-fg',
  'has-[:checked]:border-brand/50 has-[:checked]:bg-brand-soft has-[:checked]:text-brand',
  'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/20',
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:hover:border-line has-[:disabled]:hover:text-muted',
);

/** Belirli bir ana kadar geri sayım ("Başlamasına 04:59"). Hedef geçtiyse `doneLabel` gösterilir. */
export function Countdown({ to, prefix, doneLabel, className }: { to: number; prefix: string; doneLabel: string; className?: string }) {
  const now = useNow(1000);
  if (!now || !Number.isFinite(to)) return null;
  const left = to - now;
  if (left <= 0) return <span className={cn('text-xs text-subtle', className)}>{doneLabel}</span>;
  return (
    <span className={cn('text-xs text-subtle', className)}>
      <span aria-hidden="true">
        {prefix} <span className="num font-medium text-fg/80">{formatCountdown(left)}</span>
      </span>
      <span className="sr-only">
        {prefix} {spokenCountdown(left)}
      </span>
    </span>
  );
}

/** Canlı durum noktası (hareket azaltma tercihine uyar) */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex h-2 w-2', className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full rounded-full bg-up opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
    </span>
  );
}
