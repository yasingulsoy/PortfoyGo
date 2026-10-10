'use client';

import { useId, useState, type ReactNode } from 'react';
import { AdjustmentsHorizontalIcon, ChevronUpIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD, trend } from '@portfoygo/shared/format';
import AnimatedNumber from '@portfoygo/shared/ui/AnimatedNumber';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { Delta } from '@portfoygo/shared/ui/Delta';
import Spinner from '@portfoygo/shared/ui/Spinner';
import type { ArenaMe, ArenaPosition, ArenaRoundInstrument } from '@/types';
import { SIDE_LABELS, formatPrice } from './model';

const usd = (n: number) => formatUSD(n);
const signedUsd = (n: number) => `${n > 0.004 ? '+' : ''}${formatUSD(n)}`;

export function PnlText({ value, className }: { value: number; className?: string }) {
  const t = trend(value * 100);
  return <span className={cn('num font-semibold', t === 'up' ? 'text-up' : t === 'down' ? 'text-down' : 'text-muted', className)}>{signedUsd(value)}</span>;
}

export function SideBadge({ side }: { side: ArenaPosition['side'] }) {
  return <Badge tone={side === 'long' ? 'up' : 'down'}>{SIDE_LABELS[side]}</Badge>;
}

interface Props {
  me: ArenaMe;
  open: ArenaPosition[];
  instruments: ArenaRoundInstrument[];
  canTrade: boolean;
  closing: ReadonlySet<string>;
  closingAll: boolean;
  onClose: (p: ArenaPosition) => void;
  onCloseAll: () => void;
  onEditStops: (p: ArenaPosition) => void;
  /** Dar ekranda çubuğun üstünde gösterilen hızlı işlem düğmeleri */
  mobileActions?: ReactNode;
}

type ListMode = 'auto' | 'open' | 'closed';

/**
 * Yapışkan alt çubuk: nakit, özsermaye, getiri ve açık pozisyonlar (canlı K/Z, kapatma, SL/TP düzenleme).
 * Pozisyon listesi masaüstünde varsayılan açık, telefonda kapalıdır.
 */
export default function PnlBar({ me, open, instruments, canTrade, closing, closingAll, onClose, onCloseAll, onEditStops, mobileActions }: Props) {
  const listId = useId();
  const [mode, setMode] = useState<ListMode>('auto');
  const unrealized = open.reduce((s, p) => s + p.pnl, 0);
  const meta = (code: string) => instruments.find((i) => i.code === code) ?? { code, label: code, decimals: 2 };

  const toggle = () => {
    // "auto" iken görünürlük ekran genişliğine bağlı: tıklamada mevcut durumun tersine geç
    const visibleNow = mode === 'open' || (mode === 'auto' && window.matchMedia('(min-width: 1024px)').matches);
    setMode(visibleNow ? 'closed' : 'open');
  };
  const expanded = mode === 'open';

  return (
    <div className="safe-bottom sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface shadow-pop md:-mx-6">
      {mobileActions && <div className="px-4 pt-3 lg:hidden">{mobileActions}</div>}

      <div
        id={listId}
        className={cn(
          'max-h-[38vh] overflow-y-auto border-b border-line lg:max-h-56',
          mode === 'auto' ? 'hidden lg:block' : expanded ? 'block' : 'hidden',
          open.length === 0 && 'lg:hidden',
        )}
      >
        {open.length > 0 && (
          <ul className="divide-y divide-line">
            {open.map((p) => {
              const m = meta(p.instrument);
              const busy = closing.has(p.id) || closingAll;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 md:px-6">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <SideBadge side={p.side} />
                    <span className="truncate text-sm font-semibold text-fg">{m.label}</span>
                    <span className="num hidden text-xs text-muted sm:inline">{formatUSD(p.amount)}</span>
                  </div>
                  <div className="num hidden text-xs text-muted md:block">
                    {formatPrice(p.entry_price, m.decimals)} → <span className="text-fg">{formatPrice(p.current_price, m.decimals)}</span>
                  </div>
                  <div className="num hidden text-xs text-muted lg:block">
                    SL {p.stop_loss != null ? formatPrice(p.stop_loss, m.decimals) : '—'} · TP {p.take_profit != null ? formatPrice(p.take_profit, m.decimals) : '—'}
                  </div>
                  <div className="flex items-center gap-2">
                    <PnlText value={p.pnl} className="text-sm" />
                    <Delta value={p.pnl_pct} variant="text" className="hidden text-xs sm:inline-flex" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onEditStops(p)}
                      disabled={!canTrade || busy}
                      aria-label={`${m.label} pozisyonunun zarar durdur / kâr al seviyelerini düzenle`}
                      title="SL / TP düzenle"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:pointer-events-none disabled:opacity-50"
                    >
                      <AdjustmentsHorizontalIcon className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">SL/TP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onClose(p)}
                      disabled={!canTrade || busy}
                      aria-label={`${m.label} ${SIDE_LABELS[p.side].toLowerCase()} pozisyonunu kapat`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-3 px-2.5 text-xs font-semibold text-fg transition-colors hover:bg-line disabled:pointer-events-none disabled:opacity-50"
                    >
                      {busy ? <Spinner className="h-3.5 w-3.5" /> : <XMarkIcon className="h-4 w-4" aria-hidden="true" />}
                      Kapat
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 sm:gap-6 md:px-6 lg:py-3">
        <dl className="flex min-w-0 flex-1 items-center gap-4 sm:gap-8">
          <div className="hidden min-w-0 sm:block">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Nakit</dt>
            <dd className="num truncate text-sm font-semibold text-fg">{formatUSD(me.cash)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Özsermaye</dt>
            <dd className="whitespace-nowrap text-base font-semibold text-fg sm:text-lg">
              <AnimatedNumber value={me.equity} format={usd} duration={400} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Getiri</dt>
            <dd className="mt-0.5">
              <Delta value={me.return_pct} />
            </dd>
          </div>
          <div className="hidden min-w-0 md:block">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">Açık K/Z</dt>
            <dd>
              <PnlText value={unrealized} className="text-sm" />
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={mode === 'auto' ? undefined : expanded}
          aria-controls={listId}
          disabled={open.length === 0}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
        >
          <span className="num">
            <span className="hidden sm:inline">Açık pozisyonlar </span>
            <span className="sm:hidden">Poz. </span>({open.length})
          </span>
          <ChevronUpIcon className={cn('h-4 w-4 transition-transform', (expanded || mode === 'auto') && 'lg:rotate-180', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCloseAll}
          disabled={!canTrade || open.length === 0 || closingAll}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-fg px-3 text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Tüm pozisyonları kapat (kısayol X)"
        >
          {closingAll && <Spinner className="h-3.5 w-3.5" />}
          <span className="sm:hidden">Tümü</span>
          <span className="hidden sm:inline">Tümünü kapat</span>
        </button>
      </div>
    </div>
  );
}
