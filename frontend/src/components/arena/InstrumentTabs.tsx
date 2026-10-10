'use client';

import { cn } from '@portfoygo/shared/format';
import { Delta } from '@portfoygo/shared/ui/Delta';
import PriceTick from '@/components/market/PriceTick';
import type { ArenaQuote, ArenaRoundInstrument } from '@/types';
import { formatPrice } from './model';

interface Props {
  instruments: ArenaRoundInstrument[];
  quotes: Record<string, ArenaQuote>;
  selected: string;
  onSelect: (code: string) => void;
}

/**
 * Tur enstrümanları: etiket, canlı orta fiyat (değişimde kısa vurgu) ve tur başından bu yana değişim.
 * Dar ekranda yatay kayan şerit; 1–4 tuşlarıyla da seçilir.
 */
export default function InstrumentTabs({ instruments, quotes, selected, onSelect }: Props) {
  return (
    <div role="group" aria-label="Enstrüman seç" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 xl:auto-cols-fr xl:grid-flow-col">
      {instruments.map((ins, i) => {
        const q = quotes[ins.code];
        const active = ins.code === selected;
        return (
          <button
            key={ins.code}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(ins.code)}
            className={cn(
              'group relative flex min-w-[9.5rem] shrink-0 flex-col items-start gap-1 rounded-2xl border px-3.5 py-3 text-left transition-colors sm:min-w-0 sm:px-4',
              active ? 'border-brand bg-brand-soft/60 ring-1 ring-inset ring-brand' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className={cn('truncate text-sm font-semibold', active ? 'text-brand' : 'text-fg')}>{ins.label}</span>
              <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 font-sans text-[10px] text-subtle sm:inline">{i + 1}</kbd>
            </span>
            <span className="flex w-full flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <PriceTick value={q?.mid ?? null} className="text-base font-semibold text-fg sm:text-lg">
                {formatPrice(q?.mid, ins.decimals)}
              </PriceTick>
              <Delta value={q?.change_pct_since_start ?? 0} variant="text" className="text-xs" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
