'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { CoinIcon } from '@/components/game/ui/icons';

interface Flight {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  count: number;
}

/** Üst çubuktaki jeton sayacının konumu (yoksa sağ üst köşe). */
function coinTarget(): { x: number; y: number } {
  const el =
    document.querySelector<HTMLElement>('[data-coin-target]') ??
    Array.from(document.querySelectorAll<HTMLElement>('.g-hud')).find((n) => /^Jeton/i.test(n.getAttribute('aria-label') ?? ''));
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) return { x: r.left + r.height / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth - 56, y: 28 };
}

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let seq = 0;

/**
 * Jetonların bir öğeden üst çubuktaki sayaca uçuşu. `fly(fromElement)` olay geri çağrısında çağrılır;
 * hareket azaltma tercihinde hiçbir şey göstermez.
 */
export function useCoinFlight() {
  const [flights, setFlights] = useState<Flight[]>([]);

  const fly = useCallback((from: Element | null, amount = 1) => {
    if (!from || prefersReduced()) return;
    const a = from.getBoundingClientRect();
    const t = coinTarget();
    const x = a.left + a.width / 2;
    const y = a.top + a.height / 2;
    const id = ++seq;
    setFlights((f) => [...f, { id, x, y, dx: t.x - x, dy: t.y - y, count: Math.max(4, Math.min(9, Math.round(amount / 10))) }]);
    setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 1600);
  }, []);

  const layer = (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {flights.map((f) =>
        Array.from({ length: f.count }, (_, i) => {
          const spread = (i - (f.count - 1) / 2) * 10;
          const style = {
            left: f.x - 14 + spread,
            top: f.y - 14 + ((i * 7) % 13) - 6,
            '--fly-x': `${f.dx - spread}px`,
            '--fly-y': `${f.dy}px`,
            animationDelay: `${i * 55}ms`,
            opacity: 0,
          } as CSSProperties;
          return (
            <span key={`${f.id}-${i}`} className="g-anim-coin-fly absolute" style={style}>
              <CoinIcon size={28} />
            </span>
          );
        }),
      )}
    </div>
  );

  return { fly, layer };
}
