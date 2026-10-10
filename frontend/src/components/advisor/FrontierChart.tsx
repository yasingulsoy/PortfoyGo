import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import type { AdvisorFrontierPoint } from '@/types';
import { Explain } from './bits';
import { GLOSSARY, layoutFrontier, pct } from './model';

const BOX = { width: 320, height: 210, padLeft: 40, padRight: 14, padTop: 14, padBottom: 34 };

/** Etkin sınır (risk–getiri) mini grafiği; önerilen dağılım vurgulanır. */
export default function FrontierChart({ frontier, chosen, className }: { frontier: AdvisorFrontierPoint[]; chosen: AdvisorFrontierPoint; className?: string }) {
  const layout = layoutFrontier(frontier, chosen, BOX);
  const bottom = BOX.height - BOX.padBottom;
  const labelLeft = layout.chosen ? layout.chosen.x > BOX.width - 90 : false;

  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader title="Risk ve getiri dengesi" description="Etkin sınır üzerindeki yerin" />
      {layout.points.length < 2 ? (
        <EmptyState icon={<ChartBarIcon />} title="Etkin sınır hesaplanmadı" description="Bu öneride risk–getiri eğrisi yok." />
      ) : (
        <figure className="flex flex-1 flex-col px-3 pb-5 sm:px-4">
          <svg
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Etkin sınır grafiği. Önerin: volatilite ${pct(chosen.volatility)}, beklenen getiri ${pct(chosen.expected_return)}.`}
          >
            {layout.yTicks.map((t) => (
              <g key={`y${t.value}`}>
                <line x1={BOX.padLeft} x2={BOX.width - BOX.padRight} y1={t.y} y2={t.y} stroke="var(--line)" strokeDasharray="3 3" />
                <text x={BOX.padLeft - 6} y={t.y + 3} textAnchor="end" className="num fill-subtle text-[10px]">
                  {pct(t.value, { digits: 0 })}
                </text>
              </g>
            ))}
            {layout.xTicks.map((t) => (
              <text key={`x${t.value}`} x={t.x} y={bottom + 14} textAnchor="middle" className="num fill-subtle text-[10px]">
                {pct(t.value, { digits: 0 })}
              </text>
            ))}
            <line x1={BOX.padLeft} x2={BOX.width - BOX.padRight} y1={bottom} y2={bottom} stroke="var(--line-strong)" />
            <text x={(BOX.padLeft + BOX.width - BOX.padRight) / 2} y={BOX.height - 3} textAnchor="middle" className="fill-muted text-[10px]">
              Volatilite (risk) →
            </text>

            <path d={layout.path} fill="none" stroke="var(--line-strong)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {layout.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--subtle)" />
            ))}

            {layout.chosen && (
              <g>
                <circle cx={layout.chosen.x} cy={layout.chosen.y} r={11} fill="var(--brand)" opacity={0.15} />
                <circle cx={layout.chosen.x} cy={layout.chosen.y} r={5.5} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
                <text
                  x={layout.chosen.x + (labelLeft ? -12 : 12)}
                  y={layout.chosen.y + 4}
                  textAnchor={labelLeft ? 'end' : 'start'}
                  className="fill-fg text-[11px] font-semibold"
                >
                  Önerin
                </text>
              </g>
            )}
          </svg>
          <figcaption className="mt-2 space-y-3 px-2">
            <p className="num text-xs text-muted">
              Önerin: <span className="font-semibold text-fg">{pct(chosen.volatility)}</span> volatilite ile{' '}
              <span className="font-semibold text-fg">{pct(chosen.expected_return, { sign: true })}</span> beklenen yıllık getiri. Dikey eksen beklenen getiridir.
            </p>
            <Explain>
              <p>{GLOSSARY.frontier}</p>
              <p>Eğrinin solu daha sakin ama daha düşük getirili, sağı daha yüksek getiri beklentili ama daha dalgalı dağılımlardır.</p>
            </Explain>
          </figcaption>
        </figure>
      )}
    </Card>
  );
}
