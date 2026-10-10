'use client';

import { cn } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import { formatCountdown } from './model';

interface Props {
  /** Başlangıç anı (istemci saati, ms) */
  target: number;
  title: string;
  subtitle?: string;
}

/**
 * Tur başlamadan önceki geri sayım: son 3 saniyede büyük 3-2-1, öncesinde (meydan okumalarda) kalan süre.
 * Tur ekranının üstüne bindirilir; hareket azaltma tercihinde ölçek animasyonu yapılmaz.
 */
export default function CountdownOverlay({ target, title, subtitle }: Props) {
  const now = useNow(200);
  const ms = target - now;
  const secs = Math.ceil(ms / 1000);
  const big = ms > 0 && secs <= 3;

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center rounded-2xl bg-canvas/80 px-4 pt-10 backdrop-blur-sm">
      <div className="sticky top-28 w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center shadow-pop" role="status" aria-live="polite">
        <p className="text-sm font-medium text-muted">{title}</p>
        {big ? (
          <p key={secs} className="num mt-3 text-7xl font-semibold text-brand motion-safe:animate-[pg-count_900ms_var(--ease-out-soft)]">
            {secs}
          </p>
        ) : ms > 0 ? (
          <p className="num mt-3 text-4xl font-semibold text-fg">{formatCountdown(ms)}</p>
        ) : (
          <p className="mt-3 text-3xl font-semibold text-fg">Başlıyor…</p>
        )}
        {subtitle && <p className={cn('mt-3 text-sm text-muted')}>{subtitle}</p>}
        <style href="pg-arena-count" precedence="default">
          {'@keyframes pg-count{from{opacity:0;transform:scale(1.25)}30%{opacity:1}to{opacity:1;transform:none}}'}
        </style>
      </div>
    </div>
  );
}
