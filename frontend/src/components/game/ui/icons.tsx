import { cn } from '@portfoygo/shared/format';

/* Oyun simgeleri (satır içi SVG; renkler oyun token'larından). */

interface IconProps {
  className?: string;
  size?: number;
}

export function CoinIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <circle cx={16} cy={17.5} r={13} fill="var(--g-coin-edge)" />
      <circle cx={16} cy={15.5} r={13} fill="var(--g-coin)" stroke="var(--g-coin-edge)" strokeWidth={1.5} />
      <circle cx={16} cy={15.5} r={9} fill="none" stroke="var(--g-coin-edge)" strokeWidth={1.4} opacity={0.55} />
      <path d="M16 9.2l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="var(--g-coin-shine)" stroke="var(--g-coin-edge)" strokeWidth={1.5} strokeLinejoin="round" />
      <ellipse cx={11} cy={9.5} rx={3.2} ry={1.8} transform="rotate(-35 11 9.5)" fill="var(--g-coin-shine)" opacity={0.85} />
    </svg>
  );
}

export function TrophyIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <path d="M9 5h14v6a7 7 0 0 1-14 0z" fill="var(--g-coin)" stroke="var(--g-coin-edge)" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M9 7H5.5a3.5 3.5 0 0 0 4 5M23 7h3.5a3.5 3.5 0 0 1-4 5" fill="none" stroke="var(--g-coin-edge)" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M14 18h4v4h-4z" fill="var(--g-coin-edge)" />
      <rect x={9.5} y={22} width={13} height={5} rx={1.6} fill="var(--g-coin)" stroke="var(--g-coin-edge)" strokeWidth={1.6} />
      <ellipse cx={12.5} cy={8.5} rx={1.4} ry={2.4} fill="var(--g-coin-shine)" opacity={0.85} />
    </svg>
  );
}

export function StarIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <path
        d="M16 2.8l3.9 8 8.7 1.2-6.3 6.1 1.5 8.7L16 22.7l-7.8 4.1 1.5-8.7-6.3-6.1 8.7-1.2z"
        fill="var(--g-xp)"
        stroke="var(--g-xp-edge)"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M11 11.5l3-.4" stroke="var(--g-on-color)" strokeWidth={1.6} strokeLinecap="round" opacity={0.7} />
    </svg>
  );
}

export function GemIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <path d="M6 3h12l4 6-10 12L2 9z" fill="var(--g-gem)" stroke="var(--g-gem-edge)" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M2 9h20M8 3l4 6 4-6M12 9v12" stroke="var(--g-gem-edge)" strokeWidth={1} fill="none" />
    </svg>
  );
}

export function FlameIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <path d="M16 3c1 5 7 7.5 7 15a7 7 0 0 1-14 0c0-4 2-6 3.5-7.5C13 13 14 15 15 15c0-4-1.5-7 1-12z" fill="var(--g-orange)" stroke="var(--g-orange-edge)" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M16 15c.5 2.5 3.5 3.5 3.5 7a3.5 3.5 0 0 1-7 0c0-2.2 2-3.2 3.5-7z" fill="var(--g-gold-top)" />
    </svg>
  );
}

/** Sorumlu oyun / bilgi kalkanı */
export function ShieldIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="var(--g-teal)" stroke="var(--g-teal-edge)" strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M11 16l3.5 3.5L21.5 12" fill="none" stroke="var(--g-on-color)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GiftIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <rect x={5} y={13} width={22} height={15} rx={3} fill="var(--g-purple)" stroke="var(--g-purple-edge)" strokeWidth={1.6} />
      <rect x={3} y={9} width={26} height={6} rx={2.5} fill="var(--g-purple-top)" stroke="var(--g-purple-edge)" strokeWidth={1.6} />
      <path d="M14 9h4v19h-4z" fill="var(--g-gold)" />
      <path d="M16 9c-2-5-8-5-7-1.5C9.8 9.5 14 9 16 9zm0 0c2-5 8-5 7-1.5C22.2 9.5 18 9 16 9z" fill="var(--g-gold)" stroke="var(--g-gold-edge)" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

const WHEEL_SEGMENTS = ['--g-confetti-1', '--g-confetti-2', '--g-confetti-3', '--g-confetti-4', '--g-confetti-5', '--g-confetti-6'];

function wheelPoint(a: number) {
  return `${(16 + 12 * Math.cos(a)).toFixed(2)} ${(16 + 12 * Math.sin(a)).toFixed(2)}`;
}

export function WheelIcon({ className, size = 24 }: IconProps) {
  const n = WHEEL_SEGMENTS.length;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" focusable="false">
      <circle cx={16} cy={16} r={14} fill="var(--g-on-color)" stroke="var(--g-outline)" strokeWidth={1.6} />
      {WHEEL_SEGMENTS.map((v, i) => {
        const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
        return <path key={v} d={`M16 16 L${wheelPoint(a0)} A12 12 0 0 1 ${wheelPoint(a1)} Z`} fill={`var(${v})`} />;
      })}
      <circle cx={16} cy={16} r={3.2} fill="var(--g-on-color)" stroke="var(--g-outline)" strokeWidth={1.4} />
      <path d="M16 0.5l3 5h-6z" fill="var(--g-red)" stroke="var(--g-red-edge)" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}
