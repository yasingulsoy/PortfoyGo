'use client';

import { memo, useId } from 'react';
import { cn } from '@portfoygo/shared/format';
import type { GameWheelSegment } from '@/types';
import { segmentFace, sliceAngle, sliceColor } from './model';
import styles from './wheel.module.css';

const SIZE = 400;
const C = SIZE / 2;
const R = 172;
const RIM = 188;
const BULBS = 16;

const v = (name: string) => `var(${name})`;

/** Üstten saat yönünde açı (derece) → SVG noktası */
function point(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function slicePath(i: number, count: number): string {
  const s = sliceAngle(count);
  const [x0, y0] = point(i * s, R);
  const [x1, y1] = point((i + 1) * s, R);
  return `M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${s > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

/** Dilim simgesi (dilimin üst kısmında, merkezi (C, y) noktasında) */
function SliceIcon({ kind, y }: { kind: GameWheelSegment['kind']; y: number }) {
  switch (kind) {
    case 'coins':
      return (
        <g transform={`translate(${C} ${y})`}>
          <circle r="15" fill={v('--g-coin')} stroke={v('--g-coin-edge')} strokeWidth="3" />
          <circle r="9" fill="none" stroke={v('--g-coin-edge')} strokeWidth="2" opacity="0.7" />
          <path d="M-6,-8 a9,9 0 0 1 9,-3" stroke={v('--g-coin-shine')} strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      );
    case 'xp':
      return (
        <g transform={`translate(${C} ${y})`}>
          <path
            d="M0,-16 L4.7,-6.5 L15.2,-4.9 L7.6,2.5 L9.4,13 L0,8 L-9.4,13 L-7.6,2.5 L-15.2,-4.9 L-4.7,-6.5 Z"
            fill={v('--g-gold-top')}
            stroke={v('--g-outline')}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'spin':
      return (
        <g transform={`translate(${C} ${y})`} fill="none" stroke={v('--g-on-color')} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11,-6 A12,12 0 1 0 12,4" />
          <path d="M12,-14 L12,-5 L3,-5" />
        </g>
      );
    default:
      return (
        <g transform={`translate(${C} ${y})`}>
          <path d="M-14,-5 L-7,-14 L7,-14 L14,-5 L0,15 Z" fill={v('--g-gem')} stroke={v('--g-gem-edge')} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M-14,-5 L14,-5 M-7,-14 L-3,-5 L0,15 M7,-14 L3,-5" stroke={v('--g-gem-edge')} strokeWidth="1.5" fill="none" />
        </g>
      );
  }
}

export interface SpinWheelProps {
  segments: GameWheelSegment[];
  /** Mutlak dönüş açısı (derece, saat yönünde) */
  rotation: number;
  /** Dönüş animasyonu süresi (ms); 0 = anında */
  durationMs: number;
  spinning: boolean;
  /** Kazanan dilim (dönüş bitince vurgulanır) */
  highlight: number | null;
  onSpinEnd?: () => void;
  className?: string;
}

/**
 * Renkli SVG şans çarkı. Sonucu sunucu belirler; bileşen yalnızca verilen açıya döner
 * (ease-out, uzun yavaşlama). Gösterge üstte sabittir.
 */
function SpinWheelImpl({ segments, rotation, durationMs, spinning, highlight, onSpinEnd, className }: SpinWheelProps) {
  const uid = useId().replace(/[:«»]/g, '');
  const count = Math.max(1, segments.length);
  const slice = sliceAngle(count);

  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[22rem] select-none', className)} aria-hidden="true">
      {/* Gölge zemin */}
      <div className="absolute inset-[3%] translate-y-3 rounded-full bg-(--g-drop) blur-md" />

      {/* Dönen disk */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: durationMs > 0 ? `transform ${durationMs}ms cubic-bezier(0.12, 0.72, 0.16, 1)` : 'none',
        }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'transform') onSpinEnd?.();
        }}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id={`gloss-${uid}`} cx="50%" cy="38%" r="62%">
              <stop offset="0%" style={{ stopColor: v('--g-on-color'), stopOpacity: 0.32 }} />
              <stop offset="55%" style={{ stopColor: v('--g-on-color'), stopOpacity: 0.06 }} />
              <stop offset="100%" style={{ stopColor: v('--g-outline'), stopOpacity: 0.16 }} />
            </radialGradient>
            <linearGradient id={`hub-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: v('--g-gold-top') }} />
              <stop offset="100%" style={{ stopColor: v('--g-gold') }} />
            </linearGradient>
          </defs>

          {/* Dış çember (altın) */}
          <circle cx={C} cy={C} r={RIM + 8} fill={v('--g-gold-edge')} />
          <circle cx={C} cy={C} r={RIM} fill={v('--g-gold')} stroke={v('--g-outline')} strokeWidth="4" />

          {/* Dilimler */}
          {segments.map((seg, i) => {
            const col = sliceColor(i);
            return (
              <path
                key={seg.id}
                d={slicePath(i, count)}
                fill={v(col.face)}
                stroke={v('--g-outline')}
                strokeWidth="3"
                strokeLinejoin="round"
                className={cn(highlight === i && !spinning && styles.win)}
                style={highlight === i && !spinning ? { fill: v(col.top) } : undefined}
              />
            );
          })}
          <circle cx={C} cy={C} r={R} fill={`url(#gloss-${uid})`} pointerEvents="none" />

          {/* Etiketler (dilim üstteyken dik okunur) */}
          {segments.map((seg, i) => {
            const col = sliceColor(i);
            const face = segmentFace(seg);
            const angle = slice * i + slice / 2;
            const bigSize = face.big.length <= 2 ? 30 : face.big.length === 3 ? 28 : face.big.length === 4 ? 23 : 18;
            const smallSize = face.small.length > 5 ? 11 : 13;
            return (
              <g key={`l-${seg.id}`} transform={`rotate(${angle} ${C} ${C})`}>
                <SliceIcon kind={seg.kind} y={C - R + 34} />
                <text
                  x={C}
                  y={C - R + 82}
                  textAnchor="middle"
                  fontSize={bigSize}
                  fontWeight={800}
                  fill={v(col.ink)}
                  stroke={col.ink === '--g-on-color' ? v('--g-outline') : 'none'}
                  strokeWidth={col.ink === '--g-on-color' ? 5 : 0}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  style={{ fontFamily: 'var(--font-game), ui-rounded, system-ui, sans-serif' }}
                >
                  {face.big}
                </text>
                <text
                  x={C}
                  y={C - R + 102}
                  textAnchor="middle"
                  fontSize={smallSize}
                  fontWeight={800}
                  letterSpacing="0.04em"
                  fill={v(col.ink)}
                  stroke={col.ink === '--g-on-color' ? v('--g-outline') : 'none'}
                  strokeWidth={col.ink === '--g-on-color' ? 3 : 0}
                  paintOrder="stroke"
                  style={{ fontFamily: 'var(--font-game), ui-rounded, system-ui, sans-serif' }}
                >
                  {face.small}
                </text>
              </g>
            );
          })}

          {/* Ampuller */}
          {Array.from({ length: BULBS }, (_, i) => {
            const [x, y] = point((360 / BULBS) * i, RIM - 0.5);
            return (
              <circle
                key={`b-${i}`}
                cx={x}
                cy={y}
                r="5.5"
                fill={v(i % 2 ? '--g-on-color' : '--g-gold-top')}
                stroke={v('--g-gold-edge')}
                strokeWidth="1.5"
                className={spinning ? (i % 2 ? styles.bulbA : styles.bulbB) : undefined}
              />
            );
          })}

          {/* Göbek */}
          <circle cx={C} cy={C + 4} r="36" fill={v('--g-gold-edge')} />
          <circle cx={C} cy={C} r="36" fill={`url(#hub-${uid})`} stroke={v('--g-outline')} strokeWidth="4" />
          <path
            transform={`translate(${C} ${C}) scale(1.15)`}
            d="M0,-16 L4.7,-6.5 L15.2,-4.9 L7.6,2.5 L9.4,13 L0,8 L-9.4,13 L-7.6,2.5 L-15.2,-4.9 L-4.7,-6.5 Z"
            fill={v('--g-on-color')}
            stroke={v('--g-gold-edge')}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Gösterge (sabit, üstte) */}
      <svg
        viewBox="0 0 60 72"
        className={cn('absolute left-1/2 top-[-4%] h-[17%] w-auto -translate-x-1/2 drop-shadow-[0_4px_0_var(--g-drop)]', spinning && styles.pointerTick)}
        style={{ transformOrigin: '50% 30%' }}
      >
        <path d="M30,70 L6,24 A26,26 0 1 1 54,24 Z" fill={v('--g-red')} stroke={v('--g-outline')} strokeWidth="4" strokeLinejoin="round" />
        <circle cx="30" cy="24" r="9" fill={v('--g-on-color')} stroke={v('--g-red-edge')} strokeWidth="3" />
      </svg>
    </div>
  );
}

export const SpinWheel = memo(SpinWheelImpl);
