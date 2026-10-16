'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { arcPath, donutSegments, roundPercents } from '@/components/advisor/model';
import type { DonutSlice } from './model';

const SIZE = 160;
const C = SIZE / 2;

type Mode = 'asset' | 'class';

interface Props {
  /** Varlık bazında dilimler (yüzde) — bkz. model.assetSlices */
  byAsset: DonutSlice[];
  /** Sınıf bazında dilimler (yüzde) — bkz. model.classSlices */
  byClass: DonutSlice[];
  /** Halkanın ortası */
  centerValue?: ReactNode;
  centerLabel?: ReactNode;
  title?: string;
  description?: string;
  defaultMode?: Mode;
  className?: string;
}

/**
 * Dağılım halkası: varlık bazında ↔ varlık sınıfı bazında anahtarlı. Saf SVG (tema token'ları), veri çekmez.
 * Model Portföy ve Portföy Ligi ortak kullanır.
 */
export default function AllocationDonut({
  byAsset,
  byClass,
  centerValue,
  centerLabel,
  title = 'Dağılım',
  description = 'Güncel ağırlıklar',
  defaultMode = 'asset',
  className,
}: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const slices = (mode === 'asset' ? byAsset : byClass).filter((s) => s.value > 0);
  const shown = roundPercents(slices.map((s) => s.value), 1);
  const segments = donutSegments(slices.map((s) => s.value), slices.length > 1 ? 1.6 : 0);
  const summary = slices.map((s, i) => `${s.label} %${shown[i].toLocaleString('tr-TR')}`).join(', ');

  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <CardHeader
        title={title}
        description={description}
        action={
          <Tabs
            label="Dağılım görünümü"
            value={mode}
            onChange={setMode}
            items={[
              { value: 'asset', label: 'Varlık' },
              { value: 'class', label: 'Sınıf' },
            ]}
          />
        }
      />
      <div className="flex flex-col items-center gap-6 px-5 pb-5 sm:px-6 sm:pb-6 md:flex-row md:items-start">
        <figure className="relative shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-44 w-44" role="img" aria-label={`Dağılım: ${summary || 'boş'}`}>
            <circle cx={C} cy={C} r={70} fill="none" stroke="var(--surface-3)" strokeWidth={24} />
            {segments.map((s) => (
              <path key={slices[s.index].key} d={arcPath(C, C, 82, 58, s.start, s.end)} fill={slices[s.index].color}>
                <title>{`${slices[s.index].label}: %${shown[s.index].toLocaleString('tr-TR')}`}</title>
              </path>
            ))}
          </svg>
          {(centerValue || centerLabel) && (
            <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              {centerValue && <span className="num text-lg font-semibold leading-tight text-fg">{centerValue}</span>}
              {centerLabel && <span className="mt-0.5 text-[11px] leading-tight text-muted">{centerLabel}</span>}
            </figcaption>
          )}
        </figure>

        <ul className="grid w-full min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-sm min-[440px]:grid-cols-2 md:grid-cols-1 md:pt-2">
          {slices.map((s, i) => (
            <li key={s.key} className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-fg">{s.label}</span>
                {s.sub && s.sub !== s.label && <span className="ml-1.5 text-xs text-subtle">{s.sub}</span>}
              </span>
              <span className="num shrink-0 font-semibold text-fg">%{shown[i].toLocaleString('tr-TR')}</span>
            </li>
          ))}
          {slices.length === 0 && <li className="text-muted">Henüz dağılım yok.</li>}
        </ul>
      </div>
    </Card>
  );
}
