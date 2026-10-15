import { cn } from '@portfoygo/shared/format';
import { StarIcon } from '@/components/game/ui/icons';
import type { ScenarioDifficulty } from '@/types';
import { DIFFICULTY_META } from './model';

/** Zorluk yıldızları (1–3 dolu) */
export function DifficultyStars({ difficulty, size = 18, className }: { difficulty: ScenarioDifficulty; size?: number; className?: string }) {
  const meta = DIFFICULTY_META[difficulty];
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`Zorluk: ${meta.label} (3 üzerinden ${meta.stars})`}>
      {[1, 2, 3].map((i) => (
        <StarIcon key={i} size={size} className={i <= meta.stars ? undefined : 'opacity-25 grayscale'} />
      ))}
    </span>
  );
}

/** "Sentetik eğitim verisi" rozeti */
export function SyntheticBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border-2 border-(--g-purple-edge) bg-(--g-purple) px-2 py-0.5 text-[11px] font-extrabold text-(--g-on-color)',
        className,
      )}
      title="Fiyatlar gerçek piyasa verisi değildir; eğitim amaçlı yapay olarak üretilmiştir."
    >
      <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden="true">
        <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" fill="currentColor" />
      </svg>
      Sentetik eğitim verisi
    </span>
  );
}

const TONE_VAR: Record<'up' | 'gold' | 'down', { face: string; edge: string; top: string }> = {
  up: { face: 'var(--g-green)', edge: 'var(--g-green-edge)', top: 'var(--g-green-top)' },
  gold: { face: 'var(--g-gold)', edge: 'var(--g-gold-edge)', top: 'var(--g-gold-top)' },
  down: { face: 'var(--g-red)', edge: 'var(--g-red-edge)', top: 'var(--g-red-top)' },
};

/** Senaryo kartı çizimi: film şeridi çerçevesinde ani hareketli grafik */
export function ScenarioArt({ difficulty, size = 64 }: { difficulty: ScenarioDifficulty; size?: number }) {
  const t = TONE_VAR[DIFFICULTY_META[difficulty].tone];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x={4} y={8} width={56} height={46} rx={10} fill={t.face} stroke={t.edge} strokeWidth={3} />
      <rect x={4} y={8} width={56} height={10} rx={5} fill={t.top} />
      {[10, 20, 30, 40, 50].map((x) => (
        <rect key={x} x={x} y={10.5} width={5} height={5} rx={1.2} fill={t.edge} opacity={0.6} />
      ))}
      <rect x={10} y={22} width={44} height={26} rx={5} fill="var(--g-c-white)" />
      <path d="M13 30 L22 33 L28 29 L33 43 L39 37 L45 40 L51 31" fill="none" stroke="var(--g-c-ink)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 24 l-3 7 h4 l-3 7" fill="none" stroke="var(--g-c-orange)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
