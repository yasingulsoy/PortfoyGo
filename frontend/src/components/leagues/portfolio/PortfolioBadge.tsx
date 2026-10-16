import { BriefcaseIcon } from '@heroicons/react/20/solid';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { formatCapital, formatCommission } from '@/lib/portfolioLeagues';

/** Lig listesi / keşfet / davet önizlemesi: "Portföy ligi" rozeti (kurallar biliniyorsa ipucunda) */
export default function PortfolioBadge({
  rules,
  className,
}: {
  rules?: { starting_capital_usd: number; commission_bps: number; participation: 'solo' | 'team' } | null;
  className?: string;
}) {
  const hint = rules
    ? `${formatCapital(rules.starting_capital_usd)} · ${formatCommission(rules.commission_bps)} işlem maliyeti · ${rules.participation === 'team' ? 'takım' : 'bireysel'}`
    : 'Herkes aynı sermayeli sanal USD portföyle yarışır';
  return (
    <span title={hint} className={className}>
      <Badge tone="brand">
        <BriefcaseIcon className="h-3 w-3" aria-hidden="true" />
        Portföy ligi
        <span className="sr-only">: {hint}</span>
      </Badge>
    </span>
  );
}
