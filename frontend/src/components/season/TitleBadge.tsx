import { cn } from '@portfoygo/shared/format';
import { placeTone } from '@/lib/competition';

const BADGE = {
  gold: 'border-transparent bg-gold-soft text-gold',
  silver: 'border-silver/40 bg-silver/10 text-fg',
  bronze: 'border-bronze/40 bg-bronze/10 text-fg',
  neutral: 'border-line bg-surface-2 text-muted',
} as const;

const DOT = {
  gold: 'bg-gold',
  silver: 'bg-silver',
  bronze: 'bg-bronze',
  neutral: 'bg-subtle',
} as const;

/** Sezon unvanı rozeti; sıraya göre altın / gümüş / bronz tonlanır. */
export function TitleBadge({ rank, title, className }: { rank: number; title: string; className?: string }) {
  const tone = placeTone(rank);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium', BADGE[tone], className)}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />
      {title || `${rank}. sıra`}
    </span>
  );
}

const MEDAL = {
  gold: 'bg-gold text-surface',
  silver: 'bg-silver text-surface',
  bronze: 'bg-bronze text-surface',
  neutral: 'bg-surface-2 text-muted',
} as const;

/** Sıra numarası; ilk üçte madalya renginde daire. */
export function RankMedal({ rank, highlight, className }: { rank: number; highlight?: boolean; className?: string }) {
  const tone = placeTone(rank);
  if (tone === 'neutral') {
    return (
      <span className={cn('num text-sm font-semibold', highlight ? 'text-brand' : 'text-muted', className)}>
        <span className="sr-only">Sıra </span>#{rank}
      </span>
    );
  }
  return (
    <span className={cn('num flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', MEDAL[tone], className)}>
      <span className="sr-only">Sıra </span>
      {rank}
    </span>
  );
}
