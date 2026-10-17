'use client';

import { useId } from 'react';
import { cn } from '../format';

/**
 * PortfoyGo işareti: dolu, köşeleri yumuşatılmış bir "P"; iç boşluğu yukarı-sağa yükselen bir ok ("Go").
 * 48×48 ızgarada çizilir; 16 px'te "P" olarak okunur, büyüdükçe ok belirginleşir.
 * Statik kopyalar (favicon, PWA, OG): frontend/public/brand/ — geometri değişirse orayı da güncelleyin.
 */
export const LOGO_P_PATH =
  'M13 13.2A2.2 2.2 0 0 1 15.2 11H25.5A9.5 9.5 0 0 1 25.5 30H20.5V34.8A2.2 2.2 0 0 1 18.3 37H15.2A2.2 2.2 0 0 1 13 34.8Z';
export const LOGO_ARROW_PATH = 'M20.4 24.6 28.4 16.6M22.2 16.2H28.8V22.8';

export type LogoVariant = 'brand' | 'inverse' | 'mono';

/**
 * - `brand`: marka renginde kare, beyaz P (varsayılan)
 * - `inverse`: beyaz kare, marka renginde P (marka renkli zeminler için)
 * - `mono`: yalnızca P, `currentColor` (tek renk baskı / küçük alanlar)
 */
export function LogoMark({ className, variant = 'brand', title }: { className?: string; variant?: LogoVariant; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const mask = `pg-logo-m-${uid}`;
  const grad = `pg-logo-g-${uid}`;
  const glyph = variant === 'inverse' ? 'var(--brand)' : variant === 'mono' ? 'currentColor' : '#fff';
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('h-8 w-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-hover)" />
        </linearGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <path fill="#fff" d={LOGO_P_PATH} />
          <path d={LOGO_ARROW_PATH} fill="none" stroke="#000" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      {variant === 'brand' && <rect width="48" height="48" rx="12" fill={`url(#${grad})`} />}
      {variant === 'inverse' && <rect width="48" height="48" rx="12" fill="#fff" />}
      <rect width="48" height="48" fill={glyph} mask={`url(#${mask})`} />
    </svg>
  );
}

/** İşaret + "PortfoyGo" yazısı. `compact`: yalnızca işaret. `variant='inverse'`: marka renkli zeminde beyaz yazı. */
export default function Logo({ className, compact, variant = 'brand' }: { className?: string; compact?: boolean; variant?: LogoVariant }) {
  const onBrand = variant === 'inverse';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} aria-label={compact ? 'PortfoyGo' : undefined}>
      <LogoMark variant={variant} />
      {!compact && (
        <span className={cn('text-[18px] font-semibold leading-none tracking-[-0.025em]', onBrand ? 'text-white' : 'text-fg')}>
          Portfoy<span className={onBrand ? 'text-white/80' : 'text-brand'}>Go</span>
        </span>
      )}
    </span>
  );
}
