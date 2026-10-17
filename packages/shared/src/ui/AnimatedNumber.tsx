'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../format';

interface Props {
  value: number;
  /** Sayıyı metne çeviren biçimlendirici (ör. formatTRY) */
  format: (n: number) => string;
  /** Geçiş süresi (ms) */
  duration?: number;
  className?: string;
}

/**
 * Değer değiştiğinde eski değerden yeniye yumuşakça sayan metin.
 * İlk render sunucuyla aynı metni üretir; animasyon DOM üzerinde yapılır (yeniden render yok).
 * Hareket azaltma tercihi olan kullanıcılarda doğrudan son değeri gösterir.
 */
export default function AnimatedNumber({ value, format, duration = 650, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(value);
  const formatRef = useRef(format);
  const animating = useRef(false);

  // Biçimlendirici değişince (ör. TL → USD görüntüleme) değer aynı kalsa da metni yenile. Metin DOM üzerinden
  // yazıldığı için React'in kendi metin düğümü güncel olmayabilir; animasyon sürerken karışılmaz.
  useEffect(() => {
    formatRef.current = format;
    const el = ref.current;
    if (!el || animating.current) return;
    const text = format(from.current);
    if (el.textContent !== text) el.textContent = text;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = from.current;
    const end = value;
    from.current = value;
    if (start === end || !Number.isFinite(start) || !Number.isFinite(end)) {
      el.textContent = formatRef.current(end);
      return;
    }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = formatRef.current(end);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    animating.current = true;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatRef.current(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else animating.current = false;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      animating.current = false;
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={cn('num', className)}>
      {format(value)}
    </span>
  );
}
