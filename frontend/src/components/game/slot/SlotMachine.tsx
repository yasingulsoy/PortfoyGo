'use client';

import { cn } from '@portfoygo/shared/format';
import type { SlotSymbolId } from '@/types';
import { formatSlotPct, SLOT_SYMBOL_LABELS, type SlotOutcome } from './model';
import { SlotSymbolArt } from './symbols';
import s from './slot.module.css';

/** Bir çevirmenin makara animasyonu (SlotScreen yönetir). */
export interface ReelAnim {
  id: number;
  /** Makara başına şerit: [önceki, …dolgu…, sonuç] */
  strips: SlotSymbolId[][];
  /** Makara başına duruş anı (ms) — sonuçtan bağımsız, soldan sağa */
  stopTimes: number[];
  /** Şeritler hareket ediyor mu (ilk karede false → geçiş başlar) */
  running: boolean;
  /** Makara durdu mu (soldan sağa) */
  stopped: boolean[];
}

/** Monoton yavaşlama (geri sekme / taşma yok: sonuç karesinin komşusu "neredeyse" görünmez) */
const EASE = 'cubic-bezier(0.15, 0.55, 0.25, 1)';

function Reel({
  symbol,
  strip,
  running,
  stopped,
  durationMs,
  reduced,
  winning,
}: {
  symbol: SlotSymbolId;
  strip: SlotSymbolId[] | null;
  running: boolean;
  stopped: boolean;
  durationMs: number;
  reduced: boolean;
  winning: boolean;
}) {
  const animating = !!strip && !stopped && !reduced;
  const len = strip?.length ?? 1;
  return (
    <div className={cn(s.window, winning && s.winning)}>
      {animating && strip ? (
        <div
          className={cn(s.strip, running && s.moving)}
          style={{
            height: `${len * 100}%`,
            transform: running ? `translateY(-${((len - 1) / len) * 100}%)` : 'translateY(0)',
            transition: running ? `transform ${durationMs}ms ${EASE}` : 'none',
          }}
        >
          {strip.map((sym, i) => (
            <div key={i} className={s.cell} style={{ height: `${100 / len}%` }}>
              <SlotSymbolArt id={sym} />
            </div>
          ))}
        </div>
      ) : (
        <div key={`${symbol}-${stopped ? 's' : 'i'}`} className={cn(s.cell, 'h-full', reduced && stopped && s.reveal)}>
          <SlotSymbolArt id={symbol} />
        </div>
      )}
    </div>
  );
}

interface Props {
  /** Makaralarda duran semboller (soldan sağa) */
  shown: SlotSymbolId[];
  anim: ReelAnim | null;
  reduced: boolean;
  /** Kazanan makaralar (yalnızca çevirme bitince) */
  highlight: boolean[];
  rtpPct: number;
  houseEdgePct: number;
  outcome: SlotOutcome | null;
  spinning: boolean;
}

/** Slot dolabı: üst pano (RTP / kasa avantajı), üç makara (tek ödeme çizgisi) ve sonuç şeridi. */
export default function SlotMachine({ shown, anim, reduced, highlight, rtpPct, houseEdgePct, outcome, spinning }: Props) {
  const symbolsText = shown.map((id) => SLOT_SYMBOL_LABELS[id]).join(', ');
  return (
    <div className="rounded-[28px] border-[3px] border-(--g-purple-edge) bg-(--g-purple) p-3 shadow-[0_6px_0_var(--g-purple-edge),0_14px_24px_var(--g-drop)] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-(--g-purple-edge) px-3 py-2 text-(--g-on-color)">
        <span className="g-title-sm text-sm sm:text-base">Olasılık dersi</span>
        <span className="g-num text-xs font-extrabold opacity-95 sm:text-sm">
          RTP {formatSlotPct(rtpPct, 2)} · Kasa avantajı {formatSlotPct(houseEdgePct, 2)}
        </span>
      </div>

      <div className="relative mt-3 rounded-2xl border-[3px] border-(--g-outline) bg-(--g-purple-edge) p-2 sm:p-3">
        <span aria-hidden="true" className={cn(s.payline, s.paylineLeft)} />
        <span aria-hidden="true" className={cn(s.payline, s.paylineRight)} />
        <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-hidden="true">
          {shown.map((sym, i) => (
            <Reel
              key={i}
              symbol={sym}
              strip={anim?.strips[i] ?? null}
              running={!!anim?.running}
              stopped={anim ? anim.stopped[i] : true}
              durationMs={anim?.stopTimes[i] ?? 0}
              reduced={reduced}
              winning={!spinning && !!highlight[i]}
            />
          ))}
        </div>
        <p className="sr-only">{spinning ? 'Makaralar dönüyor' : `Makaralar: ${symbolsText}`}</p>
      </div>

      <div
        className={cn(
          'mt-3 flex min-h-[3.5rem] flex-col items-center justify-center rounded-2xl border-[3px] px-3 py-1.5 text-center',
          !outcome || spinning
            ? 'border-(--g-purple-edge) bg-(--g-purple-edge) text-(--g-on-color)'
            : outcome.tone === 'win'
              ? 'border-(--g-green-edge) bg-(--g-up-soft) text-(--g-ink)'
              : 'border-(--g-panel-edge) bg-(--g-panel) text-(--g-ink)',
        )}
      >
        {spinning ? (
          <span className="g-title-sm text-base">Makaralar dönüyor…</span>
        ) : outcome ? (
          <>
            <span className={cn('g-font text-lg font-extrabold leading-tight', outcome.tone === 'win' ? 'text-(--g-up)' : outcome.tone === 'loss' ? 'text-(--g-down)' : '')}>
              {outcome.text}
            </span>
            <span className="text-xs font-bold text-(--g-ink-soft)">{outcome.detail}</span>
          </>
        ) : (
          <span className="text-sm font-bold opacity-95">Her makara bağımsız döner; sonuç sunucuda belirlenir.</span>
        )}
      </div>
    </div>
  );
}
