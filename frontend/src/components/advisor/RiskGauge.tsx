import type { CSSProperties } from 'react';
import { cn } from '@portfoygo/shared/format';
import { arcPath, gaugeAngle, gaugeSegments, polar } from './model';

/** Düşük riskten yükseğe token tabanlı renk skalası (5 kademe; farklı sayıda profilde orantılı seçilir). */
const SCALE = [
  'var(--up)',
  'color-mix(in srgb, var(--up) 50%, var(--gold))',
  'var(--gold)',
  'color-mix(in srgb, var(--gold) 45%, var(--down))',
  'var(--down)',
];

export function riskColor(index: number, count: number): string {
  if (count <= 1) return SCALE[2];
  return SCALE[Math.round((index / (count - 1)) * (SCALE.length - 1))];
}

const CX = 100;
const CY = 100;
const R = 86;
const RI = 62;

/**
 * Yarım daire risk göstergesi: her profil bir dilim, ibre kullanıcının profilinde.
 * Ekran okuyucular için tek bir görsel olarak (role="img") özetlenir.
 */
export default function RiskGauge({
  index,
  count,
  label,
  className,
  size = 'md',
}: {
  index: number;
  count: number;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const n = Math.max(1, count);
  const segments = gaugeSegments(n, 2.5);
  const angle = gaugeAngle(index, n);
  const tip = polar(CX, CY, RI - 8, 0);

  return (
    <svg
      viewBox="0 0 200 118"
      role="img"
      aria-label={`Risk seviyesi: ${label} (${n} seviyeden ${index + 1}.)`}
      className={cn(size === 'sm' ? 'w-36' : 'w-full max-w-[16rem]', 'h-auto', className)}
    >
      <style href="pg-advisor-needle" precedence="default">
        {'@keyframes pg-needle{from{transform:rotate(-90deg)}to{transform:rotate(var(--a))}}'}
      </style>
      {segments.map((s, i) => (
        <path
          key={i}
          d={arcPath(CX, CY, R, RI, s.start, s.end)}
          fill={riskColor(i, n)}
          opacity={i === index ? 1 : 0.28}
        />
      ))}
      <g
        className="motion-safe:animate-[pg-needle_900ms_var(--ease-out-soft)_both]"
        style={{ '--a': `${angle}deg`, transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px`, transformBox: 'view-box' } as CSSProperties}
      >
        <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="var(--fg)" strokeWidth={4} strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={CY} r={8} fill="var(--fg)" />
      <circle cx={CX} cy={CY} r={3} fill="var(--surface)" />
      <text x={CX - R + 12} y={116} textAnchor="middle" className="fill-subtle text-[10px]">
        Düşük
      </text>
      <text x={CX + R - 12} y={116} textAnchor="middle" className="fill-subtle text-[10px]">
        Yüksek
      </text>
    </svg>
  );
}
