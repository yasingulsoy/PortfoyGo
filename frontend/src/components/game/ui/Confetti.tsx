'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './hooks';

interface Props {
  /** Çalışsın mı (true olduğu anda bir kez patlar) */
  active?: boolean;
  pieces?: number;
  /** ms */
  duration?: number;
  /** Patlamanın çıktığı yer */
  origin?: 'top' | 'center';
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
}

/** Tuval konfetisi (oyun paletinden). Hareket azaltma tercihinde hiç çizilmez. */
export default function Confetti({ active = true, pieces = 140, duration = 2800, origin = 'top' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!active || reduced || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const style = getComputedStyle(canvas);
    const colors = [1, 2, 3, 4, 5, 6].map((i) => style.getPropertyValue(`--g-confetti-${i}`).trim()).filter(Boolean);
    if (!colors.length) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const parts: Piece[] = Array.from({ length: pieces }, () => {
      const fromCenter = origin === 'center';
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 7;
      return {
        x: fromCenter ? W / 2 : Math.random() * W,
        y: fromCenter ? H * 0.4 : -20 - Math.random() * H * 0.4,
        vx: fromCenter ? Math.cos(angle) * speed : (Math.random() - 0.5) * 2.5,
        vy: fromCenter ? Math.sin(angle) * speed - 4 : 2 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.3,
      };
    });

    let raf = 0;
    const start = performance.now();
    const frame = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = elapsed > duration - 600 ? Math.max(0, (duration - elapsed) / 600) : 1;
      for (const p of parts) {
        p.vy += 0.12;
        p.vx *= 0.99;
        p.x += p.vx + Math.sin((elapsed + p.w * 40) / 300) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 2);
        }
        ctx.restore();
      }
      if (elapsed < duration) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced, pieces, duration, origin]);

  if (reduced) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] h-dvh w-screen" />;
}
