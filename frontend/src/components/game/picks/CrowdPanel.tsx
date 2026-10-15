'use client';

import { cn } from '@portfoygo/shared/format';
import GamePanel from '@/components/game/ui/GamePanel';
import type { PicksWeek } from '@/types';
import { bullishPct, compareBars, crowdTopAssets, sortStandings, splitWidths } from './model';
import { AssetBadge, ReturnText } from './parts';
import styles from './picks.module.css';

const fmtPct = (v: number) => `%${Math.round(v).toLocaleString('tr-TR')}`;

/** Yükselir / düşer bölünmüş çubuk */
export function SplitBar({ up, down, className, label }: { up: number; down: number; className?: string; label: string }) {
  const w = splitWidths(up, down);
  return (
    <div role="img" aria-label={label} className={cn('flex h-3 w-full overflow-hidden rounded-full border-2 border-(--g-panel-3) bg-(--g-panel-2)', className)}>
      <span className={cn(styles.bar, 'h-full bg-(--g-up)')} style={{ width: `${w.up}%` }} />
      <span className={cn(styles.bar, 'h-full bg-(--g-down)')} style={{ width: `${w.down}%` }} />
    </div>
  );
}

/** "Kitlenin Seçimi": genel yükseliş beklentisi + en çok seçilen varlıklar ve yön dağılımı. */
export function CrowdPanel({ week, showReturns, className }: { week: PicksWeek; showReturns?: boolean; className?: string }) {
  const bull = bullishPct(week);
  const top = crowdTopAssets(week, 5);
  const participants = week.crowd?.participants || week.participants;

  return (
    <GamePanel title="Kitlenin Seçimi" accent="teal" className={className}>
      {bull == null ? (
        <p className="text-sm font-bold text-(--g-ink-soft)">Bu hafta henüz seçim yok.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <p className="text-(--g-up)">
              <span className="g-font g-num block text-3xl font-extrabold leading-none">{fmtPct(bull)}</span>
              <span className="text-xs font-extrabold">
                <span aria-hidden="true">▲ </span>Yükselir
              </span>
            </p>
            <p className="text-center text-xs font-extrabold text-(--g-ink-soft)">
              <span className="g-num">{participants.toLocaleString('tr-TR')}</span> katılımcı
            </p>
            <p className="text-right text-(--g-down)">
              <span className="g-font g-num block text-3xl font-extrabold leading-none">{fmtPct(100 - bull)}</span>
              <span className="text-xs font-extrabold">
                Düşer<span aria-hidden="true"> ▼</span>
              </span>
            </p>
          </div>
          <SplitBar up={bull} down={100 - bull} className="mt-2 h-5" label={`Kitlenin ${fmtPct(bull)} kısmı yükselir, ${fmtPct(100 - bull)} kısmı düşer dedi`} />
        </>
      )}

      {top.length > 0 && (
        <>
          <h3 className="mb-2 mt-4 text-sm font-extrabold uppercase tracking-wide text-(--g-ink-soft)">En çok seçilenler</h3>
          <ol className="space-y-2.5">
            {top.map((a, i) => (
              <li key={`${a.asset_type}:${a.symbol}`} className="flex items-center gap-2.5">
                <span aria-hidden="true" className="g-font g-num w-4 shrink-0 text-center text-sm font-extrabold text-(--g-ink-soft)">
                  {i + 1}
                </span>
                <AssetBadge type={a.asset_type} symbol={a.symbol} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-extrabold">
                      {a.symbol} <span className="font-bold text-(--g-ink-soft)">· {a.name}</span>
                    </p>
                    <p className="shrink-0 text-xs font-extrabold">
                      <span className="g-num">{a.picks}</span> seçim
                    </p>
                  </div>
                  <SplitBar up={a.up} down={a.down} className="mt-1" label={`${a.symbol}: ${a.up} yükselir, ${a.down} düşer`} />
                  <p className="mt-0.5 flex justify-between text-[11px] font-extrabold">
                    <span className="text-(--g-up)">
                      <span aria-hidden="true">▲</span> {a.up}
                    </span>
                    <span className="text-(--g-down)">
                      {a.down} <span aria-hidden="true">▼</span>
                    </span>
                  </p>
                  {showReturns && (a.change_pct != null || a.avg_return_pct != null) && (
                    <p className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[11px] font-bold text-(--g-ink-soft)">
                      <span>
                        Varlık <ReturnText value={a.change_pct} />
                      </span>
                      <span>
                        Seçenler <ReturnText value={a.avg_return_pct} />
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </GamePanel>
  );
}

/** "Kitle portföyü" – "Sen" – "Lider" getiri karşılaştırması (sıfır merkezli çubuklar). */
export function ComparePanel({ week, className }: { week: PicksWeek; className?: string }) {
  const leader = sortStandings(week.picks).find((p) => p.status !== 'void') ?? null;
  const rows = compareBars([
    { key: 'crowd', label: 'Kitle portföyü', value: week.crowd?.crowd_return_pct },
    { key: 'me', label: 'Sen', value: week.my_pick && week.my_pick.status !== 'void' ? week.my_pick.return_pct : null },
    { key: 'leader', label: leader ? `Lider · ${leader.username}` : 'Lider', value: leader?.return_pct },
  ]);
  const tone = { up: 'bg-(--g-up)', down: 'bg-(--g-down)', flat: 'bg-(--g-ink-faint)' } as const;

  return (
    <GamePanel title="Kitle mi, sen mi?" accent="orange" className={className}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2">
            <span className={cn('truncate text-sm font-extrabold', r.key === 'me' && 'text-(--g-blue)')}>{r.label}</span>
            <span aria-hidden="true" className="relative h-5 rounded-full bg-(--g-panel-2)">
              <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-(--g-panel-3)" />
              {r.value != null && (
                <span
                  className={cn(styles.bar, 'absolute inset-y-0.5 rounded-full', tone[r.tone], r.value >= 0 ? 'left-1/2' : 'right-1/2')}
                  style={{ width: `${Math.max(r.width / 2, r.value === 0 ? 0 : 2)}%` }}
                />
              )}
            </span>
            <span className="w-[4.75rem] text-right text-sm">
              {r.value == null ? (
                <>
                  <span aria-hidden="true" className="font-extrabold text-(--g-ink-faint)">
                    —
                  </span>
                  <span className="sr-only">veri yok</span>
                </>
              ) : (
                <ReturnText value={r.value} />
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-semibold text-(--g-ink-soft)">
        Kitle portföyü tüm seçimlerin eşit ağırlıklı birleşimidir; her seçim kendi yönüne göre (yükselir / düşer) hesaplanır.
      </p>
    </GamePanel>
  );
}
