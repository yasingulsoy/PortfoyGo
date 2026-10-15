import { cn } from '@portfoygo/shared/format';
import { TIER_LABELS, tierTone } from './helpers';

interface Props {
  /** Kademe nesnesi ({id,label}) ya da kimlik */
  tier: { id?: string; label?: string } | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Kademe rozeti: kalkan simgesi + ad. Renk kademe kimliğinden (bronz, gümüş, altın …). */
export default function TierBadge({ tier, size = 'md', className }: Props) {
  const tone = tierTone(tier);
  const label = (typeof tier === 'object' && tier?.label) || (typeof tier === 'string' && tier) || TIER_LABELS[tone];
  const face = `var(--g-tier-${tone})`;
  const edge = `var(--g-tier-${tone}-edge)`;
  const h = size === 'sm' ? 'h-6 text-[12px]' : size === 'lg' ? 'h-9 text-base' : 'h-7 text-[13px]';
  const icon = size === 'sm' ? 18 : size === 'lg' ? 28 : 22;
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1 rounded-full border-2 pl-0.5 pr-2.5 font-extrabold leading-none', h, className)}
      style={{ background: face, borderColor: edge, boxShadow: `0 2px 0 ${edge}` }}
      data-tier={tone}
    >
      <svg viewBox="0 0 24 24" width={icon} height={icon} aria-hidden="true" className="shrink-0">
        <path d="M12 2l8 3v6c0 5.2-3.4 9.1-8 11-4.6-1.9-8-5.8-8-11V5z" fill={face} stroke={edge} strokeWidth={2} strokeLinejoin="round" />
        <path d="M12 7l1.5 3 3.3.4-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.4z" fill="var(--g-on-color)" />
      </svg>
      <span className="truncate text-(--g-on-color)" style={{ textShadow: `0 1.5px 0 ${edge}` }}>
        {label}
      </span>
    </span>
  );
}
