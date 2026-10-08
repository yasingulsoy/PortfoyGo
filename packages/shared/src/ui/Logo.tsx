import { cn } from '../format';

/** Logodaki yükselen çubuk + ok motifinden türetilmiş işaret. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M8 23v-3.5M12.5 23v-6M17 23v-4.5M21.5 23v-8" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7.5 16.5 13 12l4 3 7.5-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.5 8.5h4v4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight text-fg">
          Portfoy<span className="text-brand">Go</span>
        </span>
      )}
    </span>
  );
}
