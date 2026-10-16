import type { ReactNode } from 'react';
import { ShieldExclamationIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import type { LabQuote } from '@/lib/globalLab';
import { DISCLAIMER, RISK_LABELS, classColor, classLabel, money, riskTone } from './model';

/** 1–7 risk ölçeği: dolu kutucuklar + etiket (SRI benzeri) */
export function RiskMeter({ level, showLabel = true, className }: { level: number; showLabel?: boolean; className?: string }) {
  const tone = riskTone(level);
  const fill = tone === 'up' ? 'bg-up' : tone === 'gold' ? 'bg-gold' : tone === 'down' ? 'bg-down' : 'bg-brand';
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`Risk ${level}/7 · ${RISK_LABELS[level] ?? ''}`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className={cn('h-2.5 w-1.5 rounded-sm', i < level ? fill : 'bg-surface-3')} />
        ))}
      </span>
      {showLabel ? (
        <span className="num whitespace-nowrap text-xs text-muted">
          {level}/7<span className="sr-only"> risk, {RISK_LABELS[level]}</span>
        </span>
      ) : (
        <span className="sr-only">{`Risk ${level}/7, ${RISK_LABELS[level] ?? ''}`}</span>
      )}
    </span>
  );
}

/** Varlık sınıfı rozeti (renkli nokta + ad) */
export function ClassBadge({ assetClass, className }: { assetClass: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted', className)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: classColor(assetClass) }} aria-hidden="true" />
      {classLabel(assetClass)}
    </span>
  );
}

export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted', className)}>
      {children}
    </span>
  );
}

/** Uygulamadaki güncel fiyat (bağlıysa) */
export function QuoteText({ quote, className }: { quote: LabQuote | null | undefined; className?: string }) {
  if (!quote) return <span className={cn('text-xs text-subtle', className)}>—</span>;
  const ch = quote.change_24h_pct;
  return (
    <span className={cn('num inline-flex flex-col items-end leading-tight', className)}>
      <span className="text-sm font-medium text-fg">{money(quote.price, quote.currency)}</span>
      {ch !== null && (
        <span className={cn('text-xs', ch > 0 ? 'text-up' : ch < 0 ? 'text-down' : 'text-muted')}>
          {ch > 0 ? '+' : ''}
          {ch.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}%
        </span>
      )}
    </span>
  );
}

/** Her Lab görünümündeki uyarı */
export function LabDisclaimer({ className, extra }: { className?: string; extra?: ReactNode }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border border-gold/30 bg-gold-soft px-3.5 py-2.5 text-xs leading-relaxed text-fg', className)}>
      <ShieldExclamationIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{DISCLAIMER}.</strong>
        <span className="text-muted"> {extra ?? 'Katalog yalnızca tanımlayıcı bilgi içerir; fiyatlar uygulamada bağlıysa gösterilir. Sanal para ve eğitim amaçlıdır.'}</span>
      </span>
    </p>
  );
}

export function PremiumBadge() {
  return <Badge tone="brand">Premium</Badge>;
}

/** Yatay oran çubuğu (paylar için) */
export function ShareBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${w}%`, background: color ?? 'var(--brand)' }} />
    </span>
  );
}
