import type { ReactNode } from 'react';
import { cn, formatRelative } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import type { AdvisorProfileDef, AdvisorProfileResult } from '@/types';
import RiskGauge from './RiskGauge';
import { InfoTip } from './bits';
import { GLOSSARY, pct, profileIndex } from './model';

/** Risk profili özeti: yarım daire gösterge, etiket, açıklama ve volatilite bandı. */
export default function ProfileCard({
  result,
  profiles,
  eyebrow = 'Risk profilin',
  actions,
  headingRef,
  className,
}: {
  result: AdvisorProfileResult;
  profiles: AdvisorProfileDef[];
  eyebrow?: string;
  actions?: ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
  className?: string;
}) {
  const { profile } = result;
  const ratio = result.max_score > 0 ? result.score / result.max_score : 0;
  const index = profileIndex(profiles, profile.id, ratio);
  const count = Math.max(profiles.length || 5, index + 1);
  const [lo, hi] = profile.vol_band;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-col items-center gap-6 p-5 sm:p-6 md:flex-row md:items-center md:gap-8">
        <div className="flex w-full shrink-0 flex-col items-center md:w-64">
          <RiskGauge index={index} count={count} label={profile.label} />
          <ol className="mt-3 flex w-full max-w-[16rem] justify-between text-[11px] text-subtle" aria-label="Profil seviyeleri">
            {profiles.map((p, i) => (
              <li key={p.id} className={cn('min-w-0 flex-1 truncate text-center', i === index && 'font-semibold text-fg')} title={p.label}>
                {i === index ? <span className="sr-only">Senin profilin: </span> : null}
                {i + 1}
              </li>
            ))}
          </ol>
        </div>

        <div className="min-w-0 flex-1 text-center md:text-left">
          <p className="text-sm font-medium text-muted">{eyebrow}</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold text-fg outline-none">
            {profile.label}
          </h2>
          {profile.description && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{profile.description}</p>}

          <dl className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm md:justify-start">
            <div>
              <dt className="inline-flex items-center gap-1 text-xs text-muted">
                Hedef volatilite bandı
                <InfoTip label="Volatilite" align="start">
                  {GLOSSARY.volatility}
                </InfoTip>
              </dt>
              <dd className="num mt-0.5 font-semibold text-fg">
                {pct(lo, { digits: 0 })} – {pct(hi, { digits: 0 })} <span className="font-normal text-muted">/ yıl</span>
              </dd>
            </div>
            {result.max_score > 0 && (
              <div>
                <dt className="text-xs text-muted">Anket puanı</dt>
                <dd className="num mt-0.5 font-semibold text-fg">
                  {result.score} <span className="font-normal text-muted">/ {result.max_score}</span>
                </dd>
              </div>
            )}
            {result.created_at && (
              <div>
                <dt className="text-xs text-muted">Belirlenme</dt>
                <dd className="mt-0.5 font-semibold text-fg">{formatRelative(result.created_at)}</dd>
              </div>
            )}
          </dl>

          {actions && <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">{actions}</div>}
        </div>
      </div>
    </Card>
  );
}
