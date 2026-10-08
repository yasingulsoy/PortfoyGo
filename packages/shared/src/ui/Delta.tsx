import { ArrowDownRightIcon, ArrowUpRightIcon } from '@heroicons/react/20/solid';
import { cn, formatPercent, formatTRY, trend } from '../format';

const tone = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-muted',
};

const pill = {
  up: 'bg-up-soft text-up',
  down: 'bg-down-soft text-down',
  flat: 'bg-surface-2 text-muted',
};

/** Yüzde değişim göstergesi. variant="pill" arka planlı rozet, "text" düz metin. */
export function Delta({ value, variant = 'pill', className }: { value: number | null | undefined; variant?: 'pill' | 'text'; className?: string }) {
  const t = trend(value);
  const Icon = t === 'down' ? ArrowDownRightIcon : ArrowUpRightIcon;
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 font-medium',
        variant === 'pill' ? cn('rounded-md px-1.5 py-0.5 text-xs', pill[t]) : tone[t],
        className,
      )}
    >
      {t !== 'flat' && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {formatPercent(value)}
    </span>
  );
}

/** Kâr/zarar tutarı; işaretli ve renkli. */
export function Money({ value, signed = false, className }: { value: number | null | undefined; signed?: boolean; className?: string }) {
  const t = signed ? trend(value) : 'flat';
  return <span className={cn('num', signed && tone[t], !signed && 'text-fg', className)}>{formatTRY(value, { sign: signed })}</span>;
}
