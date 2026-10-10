import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cn } from '../format';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'up' | 'down' | 'buy' | 'sell' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg shadow-card hover:bg-brand-hover',
  secondary: 'bg-surface text-fg ring-1 ring-inset ring-line-strong shadow-card hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-3',
  up: 'bg-up-soft text-up hover:bg-up hover:text-white',
  down: 'bg-down-soft text-down hover:bg-down hover:text-white',
  buy: 'bg-up text-white shadow-card hover:brightness-95',
  sell: 'bg-down text-white shadow-card hover:brightness-95',
  danger: 'bg-down text-white shadow-card hover:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export default function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function LinkButton({ variant = 'primary', size = 'md', icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
