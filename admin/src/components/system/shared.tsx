import { cn } from '@portfoygo/shared/format';
import type { DataSource, Health, HealthStatus } from '@/lib/types';

export const HEALTH: Record<HealthStatus, { label: string; cls: string; dot: string }> = {
  ok: { label: 'Çalışıyor', cls: 'bg-up-soft text-up', dot: 'bg-up' },
  degraded: { label: 'Kısmi sorun', cls: 'bg-gold-soft text-gold', dot: 'bg-gold' },
  down: { label: 'Çalışmıyor', cls: 'bg-down-soft text-down', dot: 'bg-down' },
};

export const healthMeta = (s: string) => HEALTH[s as HealthStatus] ?? HEALTH.degraded;

/** Durum hapı: renkli nokta + etiket */
export function HealthPill({ status, className }: { status: HealthStatus | string; className?: string }) {
  const m = healthMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', m.cls, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} aria-hidden="true" />
      {m.label}
    </span>
  );
}

export const STALE_SOURCES: { key: DataSource; label: string; at: keyof Health['data'] }[] = [
  { key: 'stock', label: 'Hisse', at: 'stock_cache_at' },
  { key: 'crypto', label: 'Kripto', at: 'crypto_cache_at' },
  { key: 'fx', label: 'Döviz kurları', at: 'fx_rates_at' },
  { key: 'price_history', label: 'Fiyat geçmişi', at: 'price_history_at' },
];
