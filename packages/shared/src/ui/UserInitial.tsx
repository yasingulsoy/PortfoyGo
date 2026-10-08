import { cn } from '../format';

const tones = {
  brand: 'bg-brand-soft text-brand',
  gold: 'bg-gold-soft text-gold',
  neutral: 'bg-surface-3 text-muted',
} as const;

/** Kullanıcı adının baş harfinden oluşan yuvarlak avatar. */
export default function UserInitial({
  name,
  size = 36,
  tone = 'brand',
  className,
}: {
  name: string;
  size?: number;
  tone?: keyof typeof tones;
  className?: string;
}) {
  const letter = (name.trim().charAt(0) || '?').toLocaleUpperCase('tr');
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', tones[tone], className)}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.42)) }}
    >
      {letter}
    </span>
  );
}
