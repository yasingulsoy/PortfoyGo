'use client';

import { cn } from '@portfoygo/shared/format';

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
