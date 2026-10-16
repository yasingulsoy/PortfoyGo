import { LockClosedIcon, ScaleIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { formatLeagueDate } from '@/lib/competition';
import { fairnessItems } from '@/lib/portfolioLeagues';
import type { PortfolioLeagueRules } from '@/types/portfolioLeague';

/** "Bu ligde herkes aynı başlangıç sermayesi, ölçüm dönemi ve işlem maliyetiyle yarışır" + gerçek sayılar. */
export default function FairnessBox({ rules, className, action }: { rules: PortfolioLeagueRules; className?: string; action?: React.ReactNode }) {
  const items = fairnessItems(rules, (iso) => formatLeagueDate(iso));
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
            <ScaleIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">Adil yarış kuralları</h2>
            <p className="mt-0.5 text-sm text-muted">
              Bu ligde herkes aynı başlangıç sermayesi, ölçüm dönemi ve işlem maliyetiyle yarışır.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rules.locked && (
            <Badge>
              <LockClosedIcon className="h-3 w-3" aria-hidden="true" /> Kurallar sabit
            </Badge>
          )}
          {action}
        </div>
      </div>
      <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 bg-surface px-5 py-3.5 sm:px-6 lg:px-4">
            <dt className="text-xs text-muted">{it.label}</dt>
            <dd className="num mt-1 break-words text-sm font-semibold text-fg">{it.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted sm:px-6">
        Portföyler sanal USD’dir; ana TL bakiyen etkilenmez. Lig başladıktan sonra kurallar değiştirilemez. Başlamadan ve bittikten sonra
        işlem yapılamaz; bitişte portföyler dondurulur ve sonuçlar saklanır.
      </p>
    </Card>
  );
}
