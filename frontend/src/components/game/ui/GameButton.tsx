'use client';

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@portfoygo/shared/format';
import { playSound } from './sound';

export type GameButtonVariant = 'green' | 'blue' | 'gold' | 'red' | 'purple' | 'ghost' | 'teal' | 'orange' | 'plain';
export type GameButtonSize = 'sm' | 'md' | 'lg' | 'xl';

/** 3B oyun düğmesinin sınıfları (Link veya özel öğelerde de kullanılabilir). */
export function gameButtonClass(variant: GameButtonVariant = 'blue', size: GameButtonSize = 'md', opts: { block?: boolean; iconOnly?: boolean; wrap?: boolean } = {}) {
  return cn(
    'g-btn',
    `g-btn--${variant}`,
    `g-btn--${size}`,
    opts.block && 'w-full',
    opts.iconOnly && 'g-btn--icon',
    opts.wrap && '!h-auto min-h-[56px] whitespace-normal py-2 text-center leading-[1.05]',
  );
}

/** Küçük dönen halka (yükleniyor) */
export function GameSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-[1em] w-[1em] shrink-0 rounded-full border-[3px] border-current border-r-transparent g-anim-spin', className)}
    />
  );
}

export interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  icon?: ReactNode;
  /** Sağdaki simge (ör. ok) */
  trailing?: ReactNode;
  loading?: boolean;
  /** Tam genişlik */
  block?: boolean;
  /** Yalnızca simge (kare) — `aria-label` zorunlu */
  iconOnly?: boolean;
  /** Uzun etiket iki satıra kırılabilir */
  wrap?: boolean;
  /** Tıklama sesi (ses açıksa) */
  sound?: false | Parameters<typeof playSound>[0];
}

/** Kafa Topu tarzı tıknaz düğme: koyu alt kenar, basınca aşağı iner. */
const GameButton = forwardRef<HTMLButtonElement, GameButtonProps>(function GameButton(
  { variant = 'blue', size = 'md', icon, trailing, loading, block, iconOnly, wrap, sound = 'tap', className, children, disabled, onClick, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (sound) playSound(sound);
        onClick?.(e);
      }}
      className={cn(gameButtonClass(variant, size, { block, iconOnly, wrap }), className)}
      {...rest}
    >
      {loading ? <GameSpinner /> : icon ? <span className="inline-flex shrink-0 items-center [&>svg]:h-[1.15em] [&>svg]:w-[1.15em]">{icon}</span> : null}
      {children != null && <span className={cn('min-w-0', !iconOnly && !wrap && 'truncate')}>{children}</span>}
      {trailing && <span className="inline-flex shrink-0 items-center [&>svg]:h-[1.1em] [&>svg]:w-[1.1em]">{trailing}</span>}
    </button>
  );
});

export default GameButton;

export interface GameLinkButtonProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
  iconOnly?: boolean;
  prefetch?: boolean;
}

/** Bağlantı olarak 3B düğme. */
export function GameLinkButton({ href, variant = 'blue', size = 'md', icon, trailing, block, iconOnly, className, children, onClick, prefetch, ...rest }: GameLinkButtonProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        playSound('tap');
        onClick?.(e);
      }}
      className={cn(gameButtonClass(variant, size, { block, iconOnly }), className)}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0 items-center [&>svg]:h-[1.15em] [&>svg]:w-[1.15em]">{icon}</span>}
      {children != null && <span className={cn('min-w-0', !iconOnly && 'truncate')}>{children}</span>}
      {trailing && <span className="inline-flex shrink-0 items-center [&>svg]:h-[1.1em] [&>svg]:w-[1.1em]">{trailing}</span>}
    </Link>
  );
}
