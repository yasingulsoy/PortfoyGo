'use client';

import { useId } from 'react';
import { cn, formatUSD } from '@portfoygo/shared/format';
import Spinner from '@portfoygo/shared/ui/Spinner';
import type { ArenaQuote, ArenaSide } from '@/types';
import { AMOUNT_PRESETS, STOP_PRESETS, formatPrice, stopPrice } from './model';

export type AmountChoice = number | 'all';

export interface TradeSettingsValue {
  amount: AmountChoice;
  /** Elle girilen tutar metni (boşsa hazır seçenek kullanılıyor) */
  customText: string;
  slPct: number | null;
  tpPct: number | null;
}

export const DEFAULT_TRADE_SETTINGS: TradeSettingsValue = { amount: 500, customText: '', slPct: null, tpPct: null };

/** Geçerli işlem tutarı (USD). "Tümü" = kullanılabilir nakdin tamamı (aşağı yuvarlanır). */
export function effectiveAmount(v: TradeSettingsValue, cash: number): number {
  if (v.amount === 'all') return Math.max(0, Math.floor(cash));
  return v.amount;
}

const chip = (active: boolean) =>
  cn(
    'num inline-flex h-10 shrink-0 items-center justify-center rounded-xl border px-3.5 text-sm font-medium transition-colors',
    active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2',
  );

const miniChip = (active: boolean) =>
  cn(
    'num inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-2.5 text-xs font-medium transition-colors',
    active ? 'bg-surface text-fg shadow-card ring-1 ring-inset ring-line-strong' : 'text-muted hover:text-fg',
  );

interface SettingsProps {
  value: TradeSettingsValue;
  onChange: (v: TradeSettingsValue) => void;
  cash: number;
  quote: ArenaQuote | undefined;
  decimals: number;
  disabled?: boolean;
}

/** Tutar çipleri, özel tutar ve isteğe bağlı zarar durdur / kâr al (yüzde uzaklık). */
export function TradeSettings({ value, onChange, cash, quote, decimals, disabled }: SettingsProps) {
  const inputId = useId();
  const amount = effectiveAmount(value, cash);
  const tooMuch = amount > cash + 1e-9;

  const preview = (side: ArenaSide) => {
    if (!quote || (!value.slPct && !value.tpPct)) return null;
    const ref = side === 'long' ? quote.ask : quote.bid;
    const parts = [
      value.slPct ? `SL ${formatPrice(stopPrice(side, 'sl', ref, value.slPct, decimals), decimals)}` : null,
      value.tpPct ? `TP ${formatPrice(stopPrice(side, 'tp', ref, value.tpPct, decimals), decimals)}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="sr-only">İşlem ayarları</legend>
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            Tutar
          </label>
          <span className="num text-xs text-muted">Kullanılabilir {formatUSD(cash)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Hazır tutarlar" className="contents">
            {AMOUNT_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={value.amount === a && !value.customText}
                onClick={() => onChange({ ...value, amount: a, customText: '' })}
                className={chip(value.amount === a && !value.customText)}
              >
                ${a.toLocaleString('en-US')}
              </button>
            ))}
            <button type="button" aria-pressed={value.amount === 'all'} onClick={() => onChange({ ...value, amount: 'all', customText: '' })} className={chip(value.amount === 'all')}>
              Tümü
            </button>
          </div>
          <div className="relative w-28 shrink-0">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle" aria-hidden="true">
              $
            </span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Özel"
              value={value.customText}
              onChange={(e) => {
                const text = e.target.value.replace(/[^\d.,]/g, '').slice(0, 9);
                const n = Number(text.replace(',', '.'));
                onChange({ ...value, customText: text, amount: text ? (Number.isFinite(n) ? n : 0) : 500 });
              }}
              aria-invalid={tooMuch || undefined}
              aria-describedby={tooMuch ? `${inputId}-err` : undefined}
              className={cn(
                'num h-10 w-full rounded-xl border bg-transparent pl-7 pr-3 text-sm text-fg shadow-card placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10',
                value.customText ? 'border-brand' : 'border-line',
                tooMuch && 'border-down',
              )}
            />
          </div>
        </div>
        {tooMuch && (
          <p id={`${inputId}-err`} className="mt-1.5 text-xs text-down">
            Tutar kullanılabilir nakitten fazla.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StopPicker label="Zarar durdur" hint="Fiyat aleyhine bu kadar giderse kapat" value={value.slPct} onChange={(slPct) => onChange({ ...value, slPct })} />
        <StopPicker label="Kâr al" hint="Fiyat lehine bu kadar giderse kapat" value={value.tpPct} onChange={(tpPct) => onChange({ ...value, tpPct })} />
      </div>
      {(value.slPct || value.tpPct) && quote && (
        <p className="num text-xs text-muted">
          <span className="font-medium text-up">Al:</span> {preview('long')} <span className="mx-1 text-subtle">|</span>
          <span className="font-medium text-down">Sat:</span> {preview('short')}
        </p>
      )}
    </fieldset>
  );
}

function StopPicker({ label, hint, value, onChange }: { label: string; hint: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
        {label}
        <span className="truncate text-[11px] font-normal text-subtle">{hint}</span>
      </p>
      <div role="group" aria-label={label} className="flex w-full items-center gap-0.5 rounded-xl bg-surface-3 p-0.5">
        <button type="button" aria-pressed={value == null} onClick={() => onChange(null)} className={cn(miniChip(value == null), 'flex-1')}>
          Kapalı
        </button>
        {STOP_PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)} className={cn(miniChip(value === p), 'flex-1')}>
            %{p.toLocaleString('tr-TR')}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ButtonsProps {
  quote: ArenaQuote | undefined;
  decimals: number;
  label: string;
  disabled: boolean;
  /** Gönderilmekte olan yön (her iki düğme de kilitlenir) */
  submitting: ArenaSide | null;
  onTrade: (side: ArenaSide) => void;
  /** Düğmelerin altında gösterilecek durum metni (ör. "Tur başlamadı") */
  note?: string | null;
  compact?: boolean;
}

/** İki büyük düğme: AL ▲ (ask fiyatından) ve SAT ▼ (bid fiyatından, açığa satış). */
export function TradeButtons({ quote, decimals, label, disabled, submitting, onTrade, note, compact }: ButtonsProps) {
  const locked = disabled || submitting != null || !quote;
  const big = compact ? 'h-14 text-base' : 'h-20 text-xl';
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onTrade('long')}
          disabled={locked}
          aria-label={`${label} al, fiyat ${formatPrice(quote?.ask, decimals)} (kısayol B)`}
          className={cn(
            'flex flex-col items-center justify-center rounded-2xl bg-up font-semibold text-white shadow-card transition-[filter,transform] hover:brightness-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100',
            big,
          )}
        >
          <span className="flex items-center gap-2">
            {submitting === 'long' && <Spinner className="h-4 w-4" />}
            AL <span aria-hidden="true">▲</span>
          </span>
          <span className="num text-xs font-medium opacity-90 sm:text-sm">{formatPrice(quote?.ask, decimals)}</span>
        </button>
        <button
          type="button"
          onClick={() => onTrade('short')}
          disabled={locked}
          aria-label={`${label} sat (açığa), fiyat ${formatPrice(quote?.bid, decimals)} (kısayol S)`}
          className={cn(
            'flex flex-col items-center justify-center rounded-2xl bg-down font-semibold text-white shadow-card transition-[filter,transform] hover:brightness-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100',
            big,
          )}
        >
          <span className="flex items-center gap-2">
            {submitting === 'short' && <Spinner className="h-4 w-4" />}
            SAT <span aria-hidden="true">▼</span>
          </span>
          <span className="num text-xs font-medium opacity-90 sm:text-sm">{formatPrice(quote?.bid, decimals)}</span>
        </button>
      </div>
      {note && <p className="mt-2 text-center text-xs text-muted">{note}</p>}
    </div>
  );
}
