'use client';

import { cn } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import type { ArenaRound } from '@/types';
import { formatClock } from './model';

/** Son saniyeler (sakin bir uyarı tonu; yanıp sönme yok) */
const WARN_MS = 10_000;

/**
 * Büyük m:ss tur sayacı ve ilerleme çubuğu. Süre, sunucu saat farkı düzeltilerek `ends_at`'ten hesaplanır.
 * Kendi saniye-altı saatini tutar; sayfanın geri kalanı her saniye yeniden çizilmez.
 */
export default function RoundTimer({ round, clockOffset, compact, className }: { round: ArenaRound; clockOffset: number; compact?: boolean; className?: string }) {
  const now = useNow(250) + clockOffset;
  const start = Date.parse(round.starts_at);
  const end = Date.parse(round.ends_at);
  const total = Number.isFinite(end - start) && end > start ? end - start : round.duration_s * 1000;
  const finished = round.status === 'finished';
  const scheduled = round.status === 'scheduled' || (Number.isFinite(start) && now < start && !finished);
  const remaining = finished ? 0 : scheduled ? total : Math.max(0, end - now);
  const progress = finished ? 1 : scheduled ? 0 : Math.min(1, Math.max(0, 1 - remaining / total));
  const warn = !finished && !scheduled && remaining <= WARN_MS;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-subtle">{finished ? 'Tur bitti' : scheduled ? 'Başlamak üzere' : 'Kalan süre'}</span>
        <span
          className={cn('num font-semibold tabular-nums transition-colors', compact ? 'text-2xl' : 'text-3xl sm:text-4xl', warn ? 'text-gold' : 'text-fg')}
          role="timer"
          aria-live="off"
          aria-label={`Kalan süre ${formatClock(remaining)}`}
        >
          {formatClock(remaining)}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Tur ilerlemesi"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className={cn('h-full origin-left rounded-full transition-transform duration-300 ease-linear', warn ? 'bg-gold' : 'bg-brand')}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}
