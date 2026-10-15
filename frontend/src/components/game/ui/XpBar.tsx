import { cn } from '@portfoygo/shared/format';
import { StarIcon } from './icons';

interface Props {
  level: number;
  /** 0..100 */
  pct: number;
  /** Çubuğun altında "120 / 300 XP" gibi açıklama */
  caption?: string;
  className?: string;
}

/** Seviye yıldızı + parlayan XP çubuğu */
export default function XpBar({ level, pct, caption, className }: Props) {
  const value = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center">
        <span className="relative z-10 -mr-3 inline-flex h-10 w-10 shrink-0 items-center justify-center">
          <StarIcon size={40} className="absolute inset-0" />
          <span className="g-title-sm relative text-[15px] leading-none">{level}</span>
        </span>
        <div
          className="g-progress h-5 min-w-0 flex-1"
          role="progressbar"
          aria-label={`Seviye ${level} ilerlemesi`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
        >
          <span className="g-progress-fill" style={{ width: `${Math.max(value, 6)}%`, ['--p-color' as string]: 'var(--g-xp)' }} />
        </div>
      </div>
      {caption && <p className="g-num mt-0.5 pl-9 text-[11px] font-bold opacity-80">{caption}</p>}
    </div>
  );
}
