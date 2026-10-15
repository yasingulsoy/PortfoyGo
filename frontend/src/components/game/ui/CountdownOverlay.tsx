'use client';

import { useEffect } from 'react';
import { cn } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import { formatCountdown } from '@/components/arena/model';
import { playSound } from './sound';

interface Props {
  /** Başlangıç anı (istemci saati, ms) */
  target: number;
  title?: string;
  subtitle?: string;
  /** "BAŞLA!" yazısının görünme süresi (ms) */
  goMs?: number;
  /** Tam ekran yerine kapsayıcıyı kaplar */
  contained?: boolean;
}

/**
 * Oyun geri sayımı: 3 saniyeden uzunsa kalan süre, son 3 saniyede dev 3-2-1, ardından "BAŞLA!".
 * Hedeften `goMs` sonra kendini gizler. Hareket azaltma tercihinde ölçek animasyonu yapılmaz.
 */
export default function CountdownOverlay({ target, title, subtitle, goMs = 900, contained }: Props) {
  const now = useNow(100);
  const ms = target - now;
  const secs = Math.ceil(ms / 1000);
  const phase = ms <= 0 ? 'go' : secs <= 3 ? `n${secs}` : 'wait';

  useEffect(() => {
    if (phase === 'go') playSound('go');
    else if (phase !== 'wait') playSound('tick');
  }, [phase]);

  if (!Number.isFinite(target) || ms < -goMs) return null;

  return (
    <div
      className={cn('z-50 flex flex-col items-center justify-center bg-(--g-scrim) px-6 text-center backdrop-blur-[2px]', contained ? 'absolute inset-0 rounded-[inherit]' : 'fixed inset-0')}
      role="status"
      aria-live="polite"
    >
      {title && <p className="g-title-sm mb-2 max-w-md text-xl sm:text-2xl">{title}</p>}
      {phase === 'wait' ? (
        <>
          <p className="text-sm font-extrabold uppercase tracking-widest text-(--g-on-color) opacity-80">Başlamasına</p>
          <p className="g-title g-num mt-1 text-6xl">{formatCountdown(ms)}</p>
        </>
      ) : phase === 'go' ? (
        <p key="go" className="g-title g-title--gold g-anim-count text-[88px] sm:text-[120px]">
          BAŞLA!
        </p>
      ) : (
        <p key={phase} className="g-title g-num g-anim-count text-[150px] leading-none sm:text-[190px]" aria-label={`${secs}`}>
          {secs}
        </p>
      )}
      {subtitle && <p className="mt-4 max-w-sm text-sm font-bold text-(--g-on-color) opacity-90">{subtitle}</p>}
    </div>
  );
}
