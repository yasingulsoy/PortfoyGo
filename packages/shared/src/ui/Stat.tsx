import type { ReactNode } from 'react';
import { cn } from '../format';

/** Etiket + büyük değer + opsiyonel alt satırdan oluşan özet kutusu. */
export default function Stat({ label, value, sub, icon, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </div>
      <div className="num mt-1.5 truncate text-xl font-semibold tracking-tight text-fg sm:text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
