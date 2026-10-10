import type { ReactNode } from 'react';
import { Card } from '@portfoygo/shared/ui/Card';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** İkonun karşısındaki rozet (ör. <Delta />) */
  aside?: ReactNode;
  /** Değerin altındaki küçük açıklama satırı */
  sub?: ReactNode;
  loading?: boolean;
  /** İkon kutusunun tonu (varsayılan nötr) */
  tone?: 'neutral' | 'brand' | 'up' | 'down' | 'gold';
  className?: string;
}

const ICON_TONE = {
  neutral: 'bg-surface-3 text-fg',
  brand: 'bg-brand-soft text-brand',
  up: 'bg-up-soft text-up',
  down: 'bg-down-soft text-down',
  gold: 'bg-gold-soft text-gold',
} as const;

/**
 * TailAdmin e-ticaret metrik kartı: 48px ikon kutusu (karşısında değişim rozeti), etiket, büyük değer ve açıklama satırı.
 * Telefonda dikey yer kazanmak için ikon solda, içerik sağda olacak şekilde yatay dizilir.
 */
export default function MetricCard({ icon, label, value, aside, sub, loading, tone = 'neutral', className }: MetricCardProps) {
  const badge = aside && !loading ? aside : null;
  return (
    <Card className={cn('min-w-0 p-4 sm:p-5 md:p-6', className)}>
      <div className="flex items-center gap-4 sm:block">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl [&>svg]:h-6 [&>svg]:w-6', ICON_TONE[tone])} aria-hidden="true">
            {icon}
          </div>
          {badge && <div className="hidden min-w-0 sm:block">{badge}</div>}
        </div>
        <div className="min-w-0 flex-1 sm:mt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-muted">{label}</p>
            {badge && <div className="shrink-0 sm:hidden">{badge}</div>}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-32 sm:h-8" />
          ) : (
            <p className="num mt-1 truncate text-xl font-semibold text-fg sm:mt-2 sm:text-2xl">{value}</p>
          )}
          {sub && !loading && <div className="num mt-1 truncate text-xs text-muted sm:mt-1.5">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

/** Metrik kartları ızgarası: mobilde tek sütun, sm 2, xl 4 sütun. */
export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4', className)}>{children}</div>;
}
