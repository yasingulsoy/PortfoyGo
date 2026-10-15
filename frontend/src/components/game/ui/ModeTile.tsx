'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@portfoygo/shared/format';
import { playSound } from './sound';
import type { GameAccent } from './GamePanel';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Simge (küçük) */
  icon?: ReactNode;
  /** Büyük çizim (simgeye tercih edilir) */
  art?: ReactNode;
  /** Sağ üstteki rozet (sayı / kısa metin); 0 / null / false gizler */
  badge?: ReactNode;
  href?: string;
  onClick?: () => void;
  color?: GameAccent;
  /** Geniş (2 sütun) kutu */
  wide?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Oyun modu kutusu: renkli 3B kart, yüzen çizim, başlık ve isteğe bağlı rozet. */
export default function ModeTile({ title, subtitle, icon, art, badge, href, onClick, color = 'blue', wide, disabled, className }: Props) {
  const showBadge = badge !== null && badge !== undefined && badge !== false && badge !== 0 && badge !== '';
  const body = (
    <>
      {showBadge && (
        <span className="g-badge-dot g-anim-bounce absolute -right-2 -top-2.5 z-10" aria-hidden="true">
          {badge}
        </span>
      )}
      <span className={cn('flex items-start', wide ? 'gap-3' : 'flex-col gap-1.5')}>
        <span className="g-anim-float inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--g-glass-strong) text-(--g-on-color) [&>svg]:h-8 [&>svg]:w-8">
          {art ?? icon}
        </span>
        <span className="flex w-full min-w-0 flex-col">
          <span className="g-title-sm g-tile-text line-clamp-2 break-words text-[17px] leading-[1.1]">{title}</span>
          {subtitle && <span className="g-tile-text line-clamp-2 text-xs font-bold leading-snug opacity-95">{subtitle}</span>}
        </span>
      </span>
    </>
  );
  const cls = cn(`g-tile g-tile--${color}`, 'min-h-[112px] p-3', wide && 'col-span-2 min-h-0', disabled && 'pointer-events-none opacity-60', className);
  const aria = showBadge && (typeof badge === 'number' || typeof badge === 'string') ? `${title} (${badge})` : title;

  if (href && !disabled) {
    return (
      <Link href={href} className={cls} aria-label={aria} onClick={() => playSound('tap')}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-label={aria}
      disabled={disabled}
      onClick={() => {
        playSound('tap');
        onClick?.();
      }}
    >
      {body}
    </button>
  );
}
