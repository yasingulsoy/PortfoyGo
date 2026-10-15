'use client';

import { useEffect, useRef } from 'react';
import { useNow } from '@/hooks/useNow';
import { formatCountdown, formatDurationWords } from './time';

/**
 * Saniyelik geri sayım ("05:42:11"). Yalnızca kendisi yeniden render olur.
 * `onDone` süre dolduğunda bir kez çağrılır (ör. verileri yenilemek için).
 */
export function Countdown({ target, onDone, className }: { /** ms zaman damgası */ target: number; onDone?: () => void; className?: string }) {
  const now = useNow(1000);
  const left = Math.max(0, target - now);
  const fired = useRef<number | null>(null);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (left > 0 || fired.current === target) return;
    fired.current = target;
    doneRef.current?.();
  }, [left, target]);

  return (
    <span className={className}>
      <span aria-hidden="true" className="g-num tabular-nums">
        {formatCountdown(left)}
      </span>
      <span className="sr-only">{formatDurationWords(left)}</span>
    </span>
  );
}
