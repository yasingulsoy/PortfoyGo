'use client';

import { useId, useMemo } from 'react';
import { cn } from '@portfoygo/shared/format';
import { downsample } from '@/lib/seriesCsv';
import { formatPrice, formatUtc } from './data';

const W = 600;
const pad = { t: 10, r: 8, b: 6, l: 8 };

export interface LinePoint {
  /** unix ms */
  t: number;
  p: number;
}

/**
 * Hafif SVG çizgi grafiği (önizleme): min/maks çizgileri, uç tarihler ve isteğe bağlı vurgulu pencere.
 * Renkler tema token'larından gelir.
 */
export default function LineChart({
  points,
  label,
  height = 140,
  highlight,
  className,
}: {
  points: LinePoint[];
  /** Ekran okuyucu özeti */
  label: string;
  height?: number;
  /** Vurgulanacak zaman aralığı (ms) */
  highlight?: { from: number; to: number } | null;
  className?: string;
}) {
  const gradId = useId();
  const H = height;

  const model = useMemo(() => {
    const pts = downsample(points, 600);
    if (pts.length < 2) return null;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    let min = Infinity;
    let max = -Infinity;
    for (const p of pts) {
      if (p.p < min) min = p.p;
      if (p.p > max) max = p.p;
    }
    const span = max - min || Math.abs(max) * 0.01 || 1;
    const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
    const y = (p: number) => pad.t + (1 - (p - min) / span) * (H - pad.t - pad.b);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)},${H - pad.b}L${x(t0).toFixed(1)},${H - pad.b}Z`;
    const first = pts[0].p;
    const last = pts[pts.length - 1].p;
    return { line, area, min, max, t0, t1, x, first, last };
  }, [points, H]);

  if (!model) {
    return (
      <div className={cn('grid place-items-center rounded-xl border border-dashed border-line text-xs text-subtle', className)} style={{ height }}>
        Grafik için en az 2 nokta gerekli
      </div>
    );
  }

  const up = model.last >= model.first;
  const color = up ? 'var(--up)' : 'var(--down)';
  const hl =
    highlight && Number.isFinite(highlight.from) && Number.isFinite(highlight.to) && highlight.to > highlight.from
      ? { x0: Math.max(pad.l, model.x(highlight.from)), x1: Math.min(W - pad.r, model.x(highlight.to)) }
      : null;

  return (
    <figure className={cn('min-w-0', className)}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label={label}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t} y2={pad.t} stroke="var(--line)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          {hl && hl.x1 > hl.x0 && <rect x={hl.x0} y={0} width={hl.x1 - hl.x0} height={H} fill="var(--brand)" fillOpacity="0.08" />}
          <path d={model.area} fill={`url(#${gradId})`} />
          <path d={model.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="num pointer-events-none absolute right-1 top-0 rounded bg-surface/80 px-1 text-[10px] text-muted">{formatPrice(model.max)}</span>
        <span className="num pointer-events-none absolute bottom-1 right-1 rounded bg-surface/80 px-1 text-[10px] text-muted">{formatPrice(model.min)}</span>
      </div>
      <figcaption className="mt-1 flex justify-between gap-2 text-[11px] text-subtle">
        <span className="truncate">{formatUtc(model.t0)}</span>
        <span className="truncate text-right">{formatUtc(model.t1)}</span>
      </figcaption>
    </figure>
  );
}
