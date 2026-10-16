'use client';

import { useId, useMemo, useState } from 'react';
import { BanknotesIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD } from '@portfoygo/shared/format';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import AssetPicker, { type AssetSearchFn } from './AssetPicker';
import {
  ASSET_TYPE_LABEL,
  assetKey,
  clampWeight,
  equalizeRows,
  fmtPct,
  parseDecimal,
  remainderToCash,
  round2,
  scaleToHundred,
  sumWeights,
  weightStatus,
} from './model';
import type { WeightRow } from './types';

interface Props {
  rows: WeightRow[];
  cashWeight: number;
  onChange: (rows: WeightRow[], cashWeight: number) => void;
  /** Varlık arama işlevi (veri çekme dışarıdan) */
  search: AssetSearchFn;
  /** Toplam portföy değeri (USD) — satırın tutar karşılığını göstermek için */
  equity?: number;
  /** Güncel ağırlıklar (`type:SYMBOL` → yüzde; '__cash' nakit) — yeniden dengelemede hedefin yanında gösterilir */
  current?: Map<string, number>;
  maxAssets?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Hedef ağırlık düzenleyicisi: varlık arama (tür çipleri), satır başına kaydırıcı + sayı girişi, nakit payı ve
 * canlı toplam göstergesi (%100 olmalı). Yardımcılar: eşit dağıt, kalanı nakde, %100'e ölçekle.
 * Durumsuzdur (controlled): değerler `rows` / `cashWeight`, değişiklikler `onChange`.
 */
export default function WeightsEditor({ rows, cashWeight, onChange, search, equity, current, maxAssets = 20, disabled, className }: Props) {
  const sum = sumWeights(rows, cashWeight);
  const status = weightStatus(sum);
  const selected = useMemo(() => new Set(rows.map((r) => assetKey(r.asset_type, r.symbol))), [rows]);
  const full = rows.length >= maxAssets;
  const statusId = useId();

  const setRow = (i: number, weight: number) => onChange(rows.map((r, idx) => (idx === i ? { ...r, weight: clampWeight(weight) } : r)), cashWeight);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i), cashWeight);

  return (
    <div className={cn('min-w-0 space-y-4', className)}>
      {/* Toplam göstergesi */}
      <div className="rounded-xl border border-line bg-surface-2 p-3" aria-live="polite" id={statusId}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            Toplam{' '}
            <span className={cn('num font-semibold', status === 'ok' ? 'text-up' : status === 'under' ? 'text-gold' : 'text-down')}>
              %{sum.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
            </span>
            <span className="ml-1.5 text-xs">
              {status === 'ok' ? '· hazır' : status === 'under' ? `· %${round2(100 - sum).toLocaleString('tr-TR')} eksik` : `· %${round2(sum - 100).toLocaleString('tr-TR')} fazla`}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ToolButton disabled={disabled || rows.length === 0} onClick={() => onChange(equalizeRows(rows, cashWeight), cashWeight)}>
              Eşit dağıt
            </ToolButton>
            <ToolButton disabled={disabled || status === 'ok'} onClick={() => onChange(rows, remainderToCash(rows))}>
              Kalanı nakde
            </ToolButton>
            <ToolButton
              disabled={disabled || status === 'ok' || sum <= 0}
              onClick={() => {
                const s = scaleToHundred(rows, cashWeight);
                onChange(s.rows, s.cash_weight);
              }}
            >
              %100&apos;e ölçekle
            </ToolButton>
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', status === 'ok' ? 'bg-up' : status === 'under' ? 'bg-gold' : 'bg-down')}
            style={{ width: `${Math.min(100, sum)}%` }}
          />
        </div>
      </div>

      {/* Satırlar */}
      <ul className="space-y-2" aria-describedby={statusId}>
        {rows.map((r, i) => (
          <WeightLine
            key={assetKey(r.asset_type, r.symbol)}
            label={r.symbol}
            sub={`${ASSET_TYPE_LABEL[r.asset_type]} · ${r.name}`}
            icon={<AssetAvatar symbol={r.symbol} type={r.asset_type} size={32} />}
            weight={r.weight}
            currentWeight={current?.get(assetKey(r.asset_type, r.symbol))}
            showCurrent={!!current}
            amount={equity ? (equity * r.weight) / 100 : undefined}
            onWeight={(w) => setRow(i, w)}
            onRemove={() => removeRow(i)}
            disabled={disabled}
          />
        ))}
        <WeightLine
          label="Nakit"
          sub="USD · getirisi yok, değeri sabit"
          icon={
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted" aria-hidden="true">
              <BanknotesIcon className="h-4 w-4" />
            </span>
          }
          weight={cashWeight}
          currentWeight={current?.get('__cash')}
          showCurrent={!!current}
          amount={equity ? (equity * cashWeight) / 100 : undefined}
          onWeight={(w) => onChange(rows, clampWeight(w))}
          disabled={disabled}
        />
      </ul>

      {/* Varlık ekle */}
      <div>
        <p className="mb-2 text-sm font-medium text-fg">
          Varlık ekle <span className="text-xs font-normal text-subtle">({rows.length}/{maxAssets})</span>
        </p>
        <AssetPicker
          search={search}
          selectedKeys={selected}
          disabled={disabled || full}
          onPick={(it) =>
            onChange([...rows, { asset_type: it.asset_type, symbol: it.symbol, name: it.name, weight: 0, price_usd: it.price_usd }], cashWeight)
          }
        />
        {full && <p className="mt-1.5 text-xs text-gold">En fazla {maxAssets} varlık seçilebilir.</p>}
      </div>
    </div>
  );
}

function ToolButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-8 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-fg transition-colors hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function WeightLine({
  label,
  sub,
  icon,
  weight,
  currentWeight,
  showCurrent,
  amount,
  onWeight,
  onRemove,
  disabled,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  weight: number;
  currentWeight?: number;
  showCurrent?: boolean;
  amount?: number;
  onWeight: (w: number) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(weight).replace('.', ',');
  const commit = (raw: string) => {
    const n = parseDecimal(raw);
    if (Number.isFinite(n)) onWeight(n);
    setText(null);
  };
  const sliderId = useId();

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{label}</p>
          <p className="truncate text-xs text-muted">{sub}</p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`${label} kaldır`}
            className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-down disabled:opacity-40"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <label htmlFor={sliderId} className="sr-only">
          {label} ağırlığı (kaydırıcı)
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={weight}
          disabled={disabled}
          onChange={(e) => onWeight(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-brand disabled:cursor-default"
        />
        <div className="relative w-24 shrink-0">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${label} ağırlığı (yüzde)`}
            value={shown}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            }}
            className="num h-9 w-full rounded-lg border border-line bg-transparent pl-7 pr-2 text-right text-sm text-fg focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
          />
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-subtle">%</span>
        </div>
      </div>
      {(amount !== undefined || showCurrent) && (
        <p className="num mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-subtle">
          {amount !== undefined && <span>≈ {formatUSD(amount)}</span>}
          {showCurrent && <span>Şu an {fmtPct(currentWeight ?? 0, { digits: 1 })}</span>}
        </p>
      )}
    </li>
  );
}
