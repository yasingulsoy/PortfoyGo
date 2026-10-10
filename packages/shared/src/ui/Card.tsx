import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../format';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Öne çıkan kart: marka gradyanlı ince kenarlık */
  featured?: boolean;
}

export function Card({ className, featured, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl border border-line bg-surface', featured && 'edge-glow', className)}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-fg">{title}</h2>
          {description && <p className="mt-1 truncate text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...rest} />;
}
