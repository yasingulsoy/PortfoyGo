'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Segmented } from '@/components/advisor/bits';
import type { BaseCurrency, LabInstrument, LabMeta, ScenarioInput, ScenarioMode } from '@/lib/globalLab';
import { ASSET_CLASSES, CLASS_LABELS, HORIZON_OPTIONS, equalWeights, isComplete, normalizeWeights, parseDecimal, round1, weightTotal } from './model';

export interface BuilderRow {
  uid: string;
  /** Hücre anahtarı (cells) ya da araç kimliği (instruments) */
  ref: string;
  weight: string;
}

export interface BuilderState {
  mode: ScenarioMode;
  base: BaseCurrency;
  horizon: number;
  amount: string;
  rows: BuilderRow[];
}

let seq = 0;
export const uid = () => `r${++seq}`;

export const fmtWeight = (n: number) => (Number.isFinite(n) ? round1(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '');

export function defaultState(): BuilderState {
  return {
    mode: 'cells',
    base: 'TRY',
    horizon: 10,
    amount: '100.000',
    rows: [
      { uid: uid(), ref: 'hisse|Küresel', weight: '50' },
      { uid: uid(), ref: 'tahvil|Küresel', weight: '30' },
      { uid: uid(), ref: 'emtia|Küresel', weight: '10' },
      { uid: uid(), ref: 'nakit|Türkiye', weight: '10' },
    ],
  };
}

export function toInput(s: BuilderState): { input: ScenarioInput | null; error: string | null } {
  const amount = parseDecimal(s.amount);
  if (!Number.isFinite(amount) || amount < 1000) return { input: null, error: 'Tutar en az 1.000 olmalı' };
  const rows = s.rows.filter((r) => r.ref);
  if (rows.length === 0) return { input: null, error: 'En az bir satır seç' };
  if (new Set(rows.map((r) => r.ref)).size !== rows.length) return { input: null, error: 'Aynı seçim birden fazla satırda var' };
  const weights = rows.map((r) => parseDecimal(r.weight));
  if (weights.some((w) => !Number.isFinite(w) || w <= 0 || w > 100)) return { input: null, error: 'Her ağırlık 0 ile 100 arasında olmalı' };
  if (!isComplete(weights)) return { input: null, error: `Ağırlıkların toplamı %100 olmalı (şu an %${weightTotal(weights).toLocaleString('tr-TR')})` };
  const base = { base_currency: s.base, horizon_years: s.horizon, amount };
  return {
    input:
      s.mode === 'cells'
        ? { mode: 'cells', ...base, allocations: rows.map((r, i) => ({ key: r.ref, weight: weights[i] })) }
        : { mode: 'instruments', ...base, allocations: rows.map((r, i) => ({ instrument_id: r.ref, weight: weights[i] })) },
    error: null,
  };
}

/** Senaryo kurucu: hücre (sınıf × bölge) veya katalog aracı satırları, baz para birimi, vade ve tutar. */
export default function ScenarioBuilder({
  meta,
  instruments,
  state,
  onChange,
  onAnalyze,
  busy,
  actions,
  readOnly,
}: {
  meta: LabMeta | undefined;
  instruments: LabInstrument[];
  state: BuilderState;
  onChange: (s: BuilderState) => void;
  onAnalyze?: () => void;
  busy?: boolean;
  actions?: ReactNode;
  readOnly?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const cells = useMemo(() => meta?.assumptions.cells ?? [], [meta]);
  const maxRows = meta?.limits.scenarioRowsMax ?? 20;
  const weights = state.rows.map((r) => parseDecimal(r.weight));
  const total = weightTotal(weights.map((w) => (Number.isFinite(w) ? w : 0)));
  const { error } = toInput(state);

  const cellOptions = useMemo(
    () =>
      ASSET_CLASSES.map((c) => ({
        group: CLASS_LABELS[c],
        options: cells.filter((x) => x.asset_class === c).map((x) => ({ value: x.key, label: `${x.region} · E %${x.expected_return_pct.toLocaleString('tr-TR')} · σ %${x.volatility_pct.toLocaleString('tr-TR')}` })),
      })).filter((g) => g.options.length > 0),
    [cells]
  );
  const instrumentOptions = useMemo(
    () =>
      ASSET_CLASSES.map((c) => ({
        group: CLASS_LABELS[c],
        options: instruments.filter((i) => i.asset_class === c).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name} (${i.region})` })),
      })).filter((g) => g.options.length > 0),
    [instruments]
  );
  const groups = state.mode === 'cells' ? cellOptions : instrumentOptions;

  const set = (patch: Partial<BuilderState>) => onChange({ ...state, ...patch });
  const setRow = (u: string, patch: Partial<BuilderRow>) => set({ rows: state.rows.map((r) => (r.uid === u ? { ...r, ...patch } : r)) });
  const switchMode = (mode: ScenarioMode) => {
    if (mode === state.mode) return;
    set({ mode, rows: [{ uid: uid(), ref: '', weight: '100' }] });
  };
  const applyWeights = (ws: number[]) => set({ rows: state.rows.map((r, i) => ({ ...r, weight: fmtWeight(ws[i]) })) });

  const control =
    'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10 disabled:opacity-60';

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title="Dağılımı kur" description="Bölge × varlık sınıfı ya da katalog araçlarıyla; ağırlıklar toplamı %100" icon={<AdjustmentsHorizontalIcon />} />
      <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Segmented<ScenarioMode>
            label="Dağılım türü"
            value={state.mode}
            onChange={readOnly ? () => undefined : switchMode}
            options={[
              { value: 'cells', label: 'Sınıf × bölge' },
              { value: 'instruments', label: 'Katalog araçları' },
            ]}
          />
          <Segmented<BaseCurrency>
            label="Baz para birimi"
            value={state.base}
            onChange={readOnly ? () => undefined : (base) => set({ base })}
            options={[
              { value: 'TRY', label: 'TL' },
              { value: 'USD', label: 'USD' },
            ]}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg/80">Vade</span>
            <select value={state.horizon} disabled={readOnly} onChange={(e) => set({ horizon: Number(e.target.value) })} className={control}>
              {HORIZON_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} yıl
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-fg/80">Başlangıç tutarı ({state.base === 'TRY' ? '₺' : '$'})</span>
            <input
              inputMode="decimal"
              value={state.amount}
              disabled={readOnly}
              onChange={(e) => set({ amount: e.target.value })}
              className={cn(control, 'num')}
              aria-describedby="lab-amount-hint"
            />
            <span id="lab-amount-hint" className="sr-only">
              En az 1.000
            </span>
          </label>
        </div>

        <fieldset className="space-y-2" disabled={readOnly}>
          <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-medium text-fg/80">
            <span>{state.mode === 'cells' ? 'Hücreler' : 'Araçlar'}</span>
            <span className={cn('num text-xs font-semibold', Math.abs(total - 100) <= 0.05 ? 'text-up' : 'text-gold')} aria-live="polite">
              Toplam %{total.toLocaleString('tr-TR')}
            </span>
          </legend>
          {state.rows.map((r, idx) => (
            <div key={r.uid} className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{`${idx + 1}. satır seçimi`}</span>
                <select value={r.ref} onChange={(e) => setRow(r.uid, { ref: e.target.value })} className={control}>
                  <option value="">{state.mode === 'cells' ? 'Hücre seç…' : 'Araç seç…'}</option>
                  {groups.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => (
                        <option key={o.value} value={o.value} disabled={o.value !== r.ref && state.rows.some((x) => x.ref === o.value)}>
                          {state.mode === 'cells' ? `${g.group} · ${o.label}` : o.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="w-24 shrink-0">
                <span className="sr-only">{`${idx + 1}. satır ağırlığı (%)`}</span>
                <span className="relative block">
                  <input
                    inputMode="decimal"
                    value={r.weight}
                    onChange={(e) => setRow(r.uid, { weight: e.target.value })}
                    onBlur={() => setTouched(true)}
                    className={cn(control, 'num pr-7 text-right')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle" aria-hidden="true">
                    %
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => set({ rows: state.rows.filter((x) => x.uid !== r.uid) })}
                disabled={state.rows.length <= 1}
                aria-label={`${idx + 1}. satırı sil`}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40"
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {!readOnly && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={state.rows.length >= maxRows}
                onClick={() => set({ rows: [...state.rows, { uid: uid(), ref: '', weight: '0' }] })}
                icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
              >
                Satır ekle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyWeights(equalWeights(state.rows.length))}>
                Eşit dağıt
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyWeights(normalizeWeights(weights))}>
                %100&apos;e ölçekle
              </Button>
            </div>
          )}
        </fieldset>

        {touched && error && !readOnly && <Alert tone="error">{error}</Alert>}
        {state.mode === 'instruments' && (
          <p className="text-xs leading-relaxed text-subtle">
            Her araç kendi sınıf × bölge varsayımıyla temsil edilir; aynı hücredeki araçlar birlikte hesaplanır. Hücresi olmayan araçlarda aynı sınıfın
            Küresel varsayımı kullanılır.
          </p>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              onClick={() => {
                setTouched(true);
                if (!error) onAnalyze?.();
              }}
              loading={busy}
            >
              Analiz et
            </Button>
            {actions}
          </div>
        )}
      </div>
    </Card>
  );
}
