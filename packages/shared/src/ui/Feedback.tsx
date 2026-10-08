import type { ReactNode } from 'react';
import { ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/20/solid';
import { cn } from '../format';

export function Skeleton({ className }: { className?: string }) {
  // Özel köşe yuvarlaması verildiyse varsayılanı ekleme (cn sınıfları birleştirmez)
  const rounded = /(^|\s)rounded/.test(className ?? '') ? '' : 'rounded-md';
  return <div className={cn('animate-pulse bg-surface-3', rounded, className)} aria-hidden="true" />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-subtle [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type AlertTone = 'error' | 'success' | 'info';

const alertStyles: Record<AlertTone, string> = {
  error: 'border-down/30 bg-down-soft text-down',
  success: 'border-up/30 bg-up-soft text-up',
  info: 'border-brand/30 bg-brand-soft text-brand',
};

const alertIcons = { error: ExclamationTriangleIcon, success: CheckCircleIcon, info: InformationCircleIcon };

export function Alert({ tone = 'info', children, className }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  const Icon = alertIcons[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm', alertStyles[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'up' | 'down' | 'gold'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    brand: 'bg-brand-soft text-brand border-transparent',
    up: 'bg-up-soft text-up border-transparent',
    down: 'bg-down-soft text-down border-transparent',
    gold: 'bg-gold-soft text-gold border-transparent',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}
