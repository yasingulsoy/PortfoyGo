'use client';

import { useState } from 'react';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { AMOUNT_PRESETS, STOP_PRESETS, formatPrice, livePnl, SIDE_LABELS } from '@/components/arena/model';
import { effectiveAmount, type TradeSettingsValue } from '@/components/arena/TradePanel';
import { GameButton, GameSpinner } from '@/components/game/ui';
import type { ArenaMe, ArenaPosition, ArenaQuote, ArenaRoundInstrument, ArenaSide } from '@/types';

/* ------------------------------------------------------------------ */
/* Tutar çipleri + koruma (SL / TP)                                    */
/* ------------------------------------------------------------------ */

export function AmountChips({ value, onChange, cash, disabled }: { value: TradeSettingsValue; onChange: (v: TradeSettingsValue) => void; cash: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const amount = effectiveAmount(value, cash);
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">İşlem tutarı</legend>
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="text-xs font-extrabold uppercase tracking-wide text-(--g-ink-soft)">Tutar</span>
        <span className="g-num text-xs font-bold text-(--g-ink-soft)">Nakit {formatUSD(cash)}</span>
      </div>
      <div role="radiogroup" aria-label="Tutar" className="grid grid-cols-5 gap-1.5">
        {AMOUNT_PRESETS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={value.amount === a} data-active={value.amount === a} onClick={() => onChange({ ...value, amount: a, customText: '' })} className="g-chip g-num h-9 px-1 text-[13px]">
            ${a.toLocaleString('tr-TR')}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={value.amount === 'all'} data-active={value.amount === 'all'} onClick={() => onChange({ ...value, amount: 'all', customText: '' })} className="g-chip h-9 px-1 text-[13px]">
          Tümü
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="g-focus mt-2 inline-flex items-center gap-1 rounded-lg text-xs font-extrabold text-(--g-ink-soft)"
      >
        🛡️ Koruma {value.slPct || value.tpPct ? `(SL ${value.slPct ? `%${value.slPct}` : '—'} · TP ${value.tpPct ? `%${value.tpPct}` : '—'})` : '(kapalı)'}
        <ChevronDownIcon className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StopRow label="Zarar durdur" value={value.slPct} onChange={(slPct) => onChange({ ...value, slPct })} />
          <StopRow label="Kâr al" value={value.tpPct} onChange={(tpPct) => onChange({ ...value, tpPct })} />
        </div>
      )}
      {amount > cash + 1e-9 && <p className="mt-1 text-xs font-bold text-(--g-down)">Tutar nakitten fazla.</p>}
    </fieldset>
  );
}

function StopRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-extrabold text-(--g-ink-soft)">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1">
        <button type="button" role="radio" aria-checked={value == null} data-active={value == null} onClick={() => onChange(null)} className="g-chip h-8 text-xs">
          Kapalı
        </button>
        {STOP_PRESETS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={value === p} data-active={value === p} onClick={() => onChange(p)} className="g-chip g-num h-8 text-xs">
            %{p.toLocaleString('tr-TR')}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AL / SAT                                                             */
/* ------------------------------------------------------------------ */

export function BuySellButtons({
  quote,
  decimals,
  label,
  disabled,
  submitting,
  onTrade,
  note,
}: {
  quote: ArenaQuote | undefined;
  decimals: number;
  label: string;
  disabled: boolean;
  submitting: ArenaSide | null;
  onTrade: (side: ArenaSide) => void;
  note?: string | null;
}) {
  const locked = disabled || submitting != null || !quote;
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-3">
        <GameButton
          variant="green"
          size="xl"
          block
          disabled={locked}
          loading={submitting === 'long'}
          sound="buy"
          onClick={() => onTrade('long')}
          aria-label={`${label} al, fiyat ${formatPrice(quote?.ask, decimals)} (kısayol B)`}
          className="!h-[72px] flex-col !gap-0 text-[26px]"
        >
          <span className="block">AL ▲</span>
          <span className="g-num block text-xs font-bold opacity-95">{formatPrice(quote?.ask, decimals)}</span>
        </GameButton>
        <GameButton
          variant="red"
          size="xl"
          block
          disabled={locked}
          loading={submitting === 'short'}
          sound="sell"
          onClick={() => onTrade('short')}
          aria-label={`${label} sat (açığa), fiyat ${formatPrice(quote?.bid, decimals)} (kısayol S)`}
          className="!h-[72px] flex-col !gap-0 text-[26px]"
        >
          <span className="block">SAT ▼</span>
          <span className="g-num block text-xs font-bold opacity-95">{formatPrice(quote?.bid, decimals)}</span>
        </GameButton>
      </div>
      {note && <p className="g-title-sm mt-2 text-center text-sm">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pozisyonlar                                                          */
/* ------------------------------------------------------------------ */

export function PnlValue({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('g-num font-extrabold', value > 0.004 ? 'text-(--g-up)' : value < -0.004 ? 'text-(--g-down)' : 'text-(--g-ink-soft)', className)}>
      {value > 0.004 ? '+' : ''}
      {formatUSD(value)}
    </span>
  );
}

export function PositionsPanel({
  me,
  open,
  closed,
  instruments,
  quotes,
  canTrade,
  closing,
  closingAll,
  onClose,
  onCloseAll,
  className,
}: {
  me: ArenaMe;
  open: ArenaPosition[];
  closed: ArenaPosition[];
  instruments: ArenaRoundInstrument[];
  quotes: Record<string, ArenaQuote>;
  canTrade: boolean;
  closing: ReadonlySet<string>;
  closingAll: boolean;
  onClose: (p: ArenaPosition) => void;
  onCloseAll: () => void;
  className?: string;
}) {
  const meta = (code: string) => instruments.find((i) => i.code === code) ?? { code, label: code, decimals: 2 };
  const unrealized = open.reduce((s, p) => s + (livePnl(p, quotes[p.instrument])?.pnl ?? p.pnl), 0);
  const realized = closed.reduce((s, p) => s + p.pnl, 0);
  return (
    <section aria-label="Pozisyonlar" className={cn('g-panel p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="g-ribbon g-ribbon--blue text-sm">Pozisyonlar ({open.length})</h2>
        <GameButton variant="plain" size="sm" disabled={!canTrade || open.length === 0 || closingAll} loading={closingAll} onClick={onCloseAll} aria-label="Tüm pozisyonları kapat (kısayol X)">
          Tümünü kapat
        </GameButton>
      </div>
      <dl className="mb-2 grid grid-cols-3 gap-2 text-center">
        <div className="g-panel-inset px-1 py-1.5">
          <dt className="text-[10px] font-extrabold uppercase text-(--g-ink-soft)">Özsermaye</dt>
          <dd className="g-num text-sm font-extrabold">{formatUSD(me.equity)}</dd>
        </div>
        <div className="g-panel-inset px-1 py-1.5">
          <dt className="text-[10px] font-extrabold uppercase text-(--g-ink-soft)">Açık K/Z</dt>
          <dd className="text-sm">
            <PnlValue value={unrealized} />
          </dd>
        </div>
        <div className="g-panel-inset px-1 py-1.5">
          <dt className="text-[10px] font-extrabold uppercase text-(--g-ink-soft)">Kapanan</dt>
          <dd className="text-sm">
            <PnlValue value={realized} />
          </dd>
        </div>
      </dl>
      {open.length === 0 ? (
        <p className="py-2 text-center text-sm font-bold text-(--g-ink-soft)">Açık pozisyon yok. AL ya da SAT ile başla!</p>
      ) : (
        <ul className="space-y-1.5">
          {open.map((p) => {
            const m = meta(p.instrument);
            const busy = closing.has(p.id) || closingAll;
            return (
              <li key={p.id} className="g-anim-pop flex items-center gap-2 rounded-2xl bg-(--g-panel-2) px-2.5 py-1.5">
                <span
                  className={cn(
                    'shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold text-(--g-on-color)',
                    p.side === 'long' ? 'bg-(--g-green)' : 'bg-(--g-red)',
                  )}
                >
                  {SIDE_LABELS[p.side].toLocaleUpperCase('tr')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{m.label}</span>
                  <span className="g-num block truncate font-sans text-[11px] text-(--g-ink-soft)">
                    {formatUSD(p.amount)} · {formatPrice(p.entry_price, m.decimals)} → {formatPrice(p.current_price, m.decimals)}
                  </span>
                </span>
                <PnlValue value={p.pnl} className="text-sm" />
                <button
                  type="button"
                  onClick={() => onClose(p)}
                  disabled={!canTrade || busy}
                  aria-label={`${m.label} ${SIDE_LABELS[p.side].toLowerCase()} pozisyonunu kapat`}
                  className="g-chip h-8 w-8 shrink-0 p-0"
                >
                  {busy ? <GameSpinner /> : <XMarkIcon className="h-4 w-4" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
