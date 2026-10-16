'use client';

import { cn } from '@portfoygo/shared/format';
import GamePanel from '@/components/game/ui/GamePanel';
import type { SlotInfo } from '@/types';
import { comboSymbols, formatMultiplier, formatOdds, formatSlotPct, paytableTotals, SLOT_SYMBOL_LABELS } from './model';
import { SlotSymbolArt } from './symbols';

/** Olasılık tablosu: her kombinasyonun çarpanı ve TAM olasılığı; RTP ve kasa avantajı aynı tablodan. Her zaman görünür. */
export default function SlotPaytable({ info, loading, className }: { info: SlotInfo | undefined; loading: boolean; className?: string }) {
  const rows = info?.paytable ?? [];
  const totals = paytableTotals(rows);
  const reel = info?.reel_weights[0] ?? [];
  const sameReels = !!info && info.reel_weights.every((r) => JSON.stringify(r) === JSON.stringify(reel));

  return (
    <GamePanel title="Olasılık tablosu" accent="purple" className={className}>
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <caption className="sr-only">Kombinasyonlar, kazanç çarpanları ve tam olasılıkları</caption>
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-(--g-ink-soft)">
            <th scope="col" className="pb-1 font-extrabold">
              Sonuç
            </th>
            <th scope="col" className="pb-1 text-right font-extrabold">
              Çarpan
            </th>
            <th scope="col" className="pb-1 text-right font-extrabold">
              Olasılık
            </th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0
            ? Array.from({ length: 10 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={3}>
                    <div className="h-8 animate-pulse rounded-lg bg-(--g-panel-2) motion-reduce:animate-none" />
                  </td>
                </tr>
              ))
            : rows.map((r) => {
                const syms = comboSymbols(r);
                return (
                  <tr key={r.id} className={cn(r.kind === 'none' ? 'text-(--g-ink-soft)' : '', 'bg-(--g-panel-2)')}>
                    <th scope="row" className="rounded-l-xl py-1 pl-2 text-left font-bold">
                      {syms ? (
                        <span className="flex items-center gap-0.5">
                          {syms.map((id, i) => (
                            <SlotSymbolArt key={i} id={id} size={22} />
                          ))}
                          <span className="sr-only">{r.combo}</span>
                        </span>
                      ) : (
                        <span className="block py-0.5 text-xs leading-tight">{r.combo}</span>
                      )}
                    </th>
                    <td className="g-num py-1 pr-2 text-right font-extrabold">{formatMultiplier(r.multiplier)}</td>
                    <td className="rounded-r-xl py-1 pr-2 text-right">
                      <span className="g-num block font-extrabold leading-tight">{formatSlotPct(r.probability_pct)}</span>
                      <span className="g-num block text-[10px] font-bold leading-tight text-(--g-ink-faint)">{formatOdds(r.ways, r.total_ways)}</span>
                    </td>
                  </tr>
                );
              })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="text-(--g-ink-soft)">
              <th scope="row" colSpan={2} className="pl-2 pt-1 text-left text-xs font-extrabold uppercase">
                Toplam
              </th>
              <td className="g-num pr-2 pt-1 text-right text-xs font-extrabold">{formatSlotPct(totals.probability_pct, 2)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      {info && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="g-panel-inset px-1 py-2">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-(--g-ink-soft)">Geri ödeme (RTP)</dt>
            <dd className="g-title-sm g-num text-lg text-(--g-ink)">{formatSlotPct(info.rtp_pct, 2)}</dd>
          </div>
          <div className="g-panel-inset px-1 py-2">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-(--g-ink-soft)">Kasa avantajı</dt>
            <dd className="g-title-sm g-num text-lg text-(--g-down)">{formatSlotPct(info.house_edge_pct, 2)}</dd>
          </div>
          <div className="g-panel-inset px-1 py-2">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-(--g-ink-soft)">Kazanma sıklığı</dt>
            <dd className="g-title-sm g-num text-lg text-(--g-ink)">{formatSlotPct(info.hit_rate_pct, 2)}</dd>
          </div>
        </dl>
      )}

      {info && (
        <p className="mt-3 text-xs font-semibold leading-relaxed text-(--g-ink-soft)">
          Kazanç = bahis × çarpan. Her satırda olasılık × çarpan toplanınca {formatSlotPct(totals.rtp_pct, 2)} çıkar: 100 jetonluk bahsin uzun vadede ortalama{' '}
          {Math.round(info.rtp_pct).toLocaleString('tr-TR')} jetonu geri döner. “İki aynı sembol” üçlüleri kapsamaz.
        </p>
      )}

      {info && reel.length > 0 && (
        <details className="g-panel-inset mt-3 px-3 py-2 text-xs">
          <summary className="g-focus cursor-pointer rounded font-extrabold">Makara ağırlıkları{sameReels ? ' (üç makara aynı)' : ''}</summary>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {reel.map((w) => (
              <li key={w.symbol} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 font-bold">
                  <SlotSymbolArt id={w.symbol} size={18} />
                  <span className="truncate">{SLOT_SYMBOL_LABELS[w.symbol]}</span>
                </span>
                <span className="g-num shrink-0 font-extrabold">
                  {w.weight}/{w.total}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-semibold text-(--g-ink-soft)">Her makara bu ağırlıklarla, diğerlerinden bağımsız olarak seçilir. Olasılıklar bu ağırlıkların çarpımıdır.</p>
        </details>
      )}
    </GamePanel>
  );
}
