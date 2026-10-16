'use client';

import { useId, useMemo, useState } from 'react';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { CLASS_META, CLASS_ORDER, fmtPct, shockImpact, type ShockPosition, type ShockTarget } from './model';
import type { AssetClass } from './types';

export interface WhatIfPosition extends ShockPosition {
  label: string;
}

interface Props {
  positions: WhatIfPosition[];
  cashUsd: number;
  className?: string;
}

const PRESETS = [-50, -20, -10, 10, 20, 50];

/**
 * "Ne olursa?" şok simülatörü (tamamen istemci tarafı, anında): bir varlık ya da sınıf seçilir, fiyat değişimi
 * −%50…+%50 kaydırılır → yeni portföy değeri ve toplam etki. Kural: etki ≈ ağırlık × değişim.
 */
export default function WhatIfSimulator({ positions, cashUsd, className }: Props) {
  const classes = useMemo(() => CLASS_ORDER.filter((c) => c !== 'nakit' && positions.some((p) => p.asset_class === c && p.value_usd > 0)), [positions]);
  const [targetId, setTargetId] = useState<string>(() => (classes[0] ? `class:${classes[0]}` : positions[0] ? `asset:${positions[0].key}` : ''));
  const [change, setChange] = useState(-20);
  const sliderId = useId();
  const selectId = useId();

  const validTarget =
    (targetId.startsWith('class:') && classes.includes(targetId.slice(6) as AssetClass)) ||
    (targetId.startsWith('asset:') && positions.some((p) => p.key === targetId.slice(6)));
  const effectiveId = validTarget ? targetId : classes[0] ? `class:${classes[0]}` : positions[0] ? `asset:${positions[0].key}` : '';
  const target: ShockTarget | null = effectiveId.startsWith('class:')
    ? { kind: 'class', asset_class: effectiveId.slice(6) as AssetClass }
    : effectiveId.startsWith('asset:')
      ? { kind: 'asset', key: effectiveId.slice(6) }
      : null;
  const equity = cashUsd + positions.reduce((s, p) => s + p.value_usd, 0);
  const r = target ? shockImpact(positions, cashUsd, target, change) : null;
  const targetLabel = !target ? '' : target.kind === 'class' ? CLASS_META[target.asset_class].label : positions.find((p) => p.key === target.key)?.label ?? '';

  if (positions.length === 0) {
    return <p className={cn('text-sm text-muted', className)}>Portföy tamamen nakit: fiyat değişimleri değerini etkilemez.</p>;
  }

  return (
    <div className={cn('min-w-0 space-y-4', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={selectId} className="mb-1.5 block text-xs font-medium text-muted">
            Ne değişsin?
          </label>
          <select
            id={selectId}
            value={effectiveId}
            onChange={(e) => setTargetId(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
          >
            <optgroup label="Varlık sınıfı">
              {classes.map((c) => (
                <option key={c} value={`class:${c}`}>
                  Tüm {CLASS_META[c].label.toLocaleLowerCase('tr-TR')}
                </option>
              ))}
            </optgroup>
            <optgroup label="Tek varlık">
              {positions.map((p) => (
                <option key={p.key} value={`asset:${p.key}`}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label htmlFor={sliderId} className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
            Fiyat değişimi <span className={cn('num text-sm font-semibold', change >= 0 ? 'text-up' : 'text-down')}>{fmtPct(change, { sign: true, digits: 0 })}</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={-50}
            max={50}
            step={1}
            value={change}
            onChange={(e) => setChange(Number(e.target.value))}
            className="h-10 w-full cursor-pointer accent-brand"
            aria-valuetext={`${change} yüzde`}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hazır senaryolar">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={change === p}
            onClick={() => setChange(p)}
            className={cn(
              'num h-7 rounded-full border px-2.5 text-xs font-medium transition-colors',
              change === p ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-fg',
            )}
          >
            {fmtPct(p, { sign: true, digits: 0 })}
          </button>
        ))}
      </div>

      {r && (
        <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
          <div className="rounded-xl border border-line p-3">
            <p className="text-xs text-muted">Yeni portföy değeri</p>
            <p className="num mt-1 text-lg font-semibold text-fg">{formatUSD(r.new_equity_usd)}</p>
            <p className="num text-[11px] text-subtle">Şu an {formatUSD(equity)}</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="text-xs text-muted">Toplam etki</p>
            <p className={cn('num mt-1 text-lg font-semibold', r.impact_pct > 0 ? 'text-up' : r.impact_pct < 0 ? 'text-down' : 'text-fg')}>
              {fmtPct(r.impact_pct, { sign: true, digits: 2 })}
            </p>
            <p className={cn('num text-[11px]', r.delta_usd >= 0 ? 'text-up' : 'text-down')}>{formatUSD(r.delta_usd)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            <p className="font-medium text-fg">Ağırlık × değişim</p>
            <p className="num mt-1">
              {fmtPct(r.weight_pct)} × {fmtPct(change, { sign: true, digits: 0 })} ≈ {fmtPct(r.impact_pct, { sign: true, digits: 2 })}
            </p>
            <p className="mt-1">
              {targetLabel} portföyün {fmtPct(r.weight_pct)}&apos;i; değişimin yalnızca bu kadarı toplama yansır.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
