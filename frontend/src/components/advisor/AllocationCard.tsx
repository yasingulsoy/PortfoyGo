import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import type { AdvisorAllocation } from '@/types';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { InfoTip } from './bits';
import { GLOSSARY, arcPath, classColor, donutSegments, pct, roundPercents } from './model';

const SIZE = 160;
const C = SIZE / 2;

/** Önerilen dağılım: düz SVG halka grafik + sınıf tablosu (ağırlık, beklenen getiri, volatilite, enstrümanlar). */
export default function AllocationCard({ allocation, expectedReturn, className }: { allocation: AdvisorAllocation[]; expectedReturn: number; className?: string }) {
  const rows = allocation.filter((a) => a.weight > 0).sort((a, b) => b.weight - a.weight);
  const shown = roundPercents(rows.map((r) => r.weight));
  const segments = donutSegments(rows.map((r) => r.weight), 1.6);
  const summary = rows.map((r, i) => `${r.label} %${shown[i]}`).join(', ');

  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <CardHeader title="Önerilen dağılım" description="Varlık sınıflarına göre ağırlıklar" />
      <div className="flex flex-col items-center gap-6 px-5 pb-2 sm:px-6 lg:flex-row lg:items-start">
        <figure className="relative shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-44 w-44" role="img" aria-label={`Önerilen dağılım: ${summary}`}>
            <circle cx={C} cy={C} r={70} fill="none" stroke="var(--surface-3)" strokeWidth={24} />
            {segments.map((s) => (
              <path key={rows[s.index].class} d={arcPath(C, C, 82, 58, s.start, s.end)} fill={classColor(rows[s.index].class, s.index)}>
                <title>{`${rows[s.index].label}: %${shown[s.index]}`}</title>
              </path>
            ))}
          </svg>
          <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="num text-xl font-semibold text-fg">{pct(expectedReturn, { sign: true })}</span>
            <span className="text-[11px] leading-tight text-muted">beklenen
              <br />
              yıllık getiri
            </span>
          </figcaption>
        </figure>

        <ul className="grid w-full grid-cols-1 gap-x-4 gap-y-2 text-sm min-[440px]:grid-cols-2 lg:grid-cols-1 lg:pt-2">
          {rows.map((r, i) => (
            <li key={r.class} className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classColor(r.class, i) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-muted">{r.label}</span>
              <span className="num shrink-0 font-semibold text-fg">%{shown[i]}</span>
            </li>
          ))}
        </ul>
      </div>

      <DataTable label="Önerilen dağılımın ayrıntıları" className="pb-3 pt-4">
        <THead>
          <Th>Sınıf</Th>
          <Th align="right">Ağırlık</Th>
          <Th align="right" className="hidden sm:table-cell">
            <span className="inline-flex items-center gap-1">
              Getiri
              <InfoTip label="Beklenen getiri" align="end" side="bottom">
                {GLOSSARY.expected_return}
              </InfoTip>
            </span>
          </Th>
          <Th align="right" className="hidden sm:table-cell">
            <span className="inline-flex items-center gap-1">
              Volatilite
              <InfoTip label="Volatilite" align="end" side="bottom">
                {GLOSSARY.volatility}
              </InfoTip>
            </span>
          </Th>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <Tr key={r.class}>
              <Td>
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: classColor(r.class, i) }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{r.label}</p>
                    {r.instruments.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`${r.label} enstrümanları`}>
                        {r.instruments.map((ins) => (
                          <li
                            key={`${ins.asset_type}:${ins.symbol}`}
                            title={ins.name}
                            className="num inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted"
                          >
                            {ins.symbol}
                            {r.instruments.length > 1 && <span className="text-subtle">%{Math.round(ins.weight * 100)}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      r.class === 'cash_try' && <p className="mt-0.5 text-xs text-subtle">Nakit olarak kalır</p>
                    )}
                    <p className="num mt-1 text-xs text-muted sm:hidden">
                      Getiri {pct(r.expected_return)} · Volatilite {pct(r.volatility)}
                    </p>
                  </div>
                </div>
              </Td>
              <Td align="right" className="num whitespace-nowrap font-semibold text-fg">
                %{shown[i]}
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
                {pct(r.expected_return)}
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
                {pct(r.volatility)}
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>
    </Card>
  );
}
