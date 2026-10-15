'use client';

import { useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { GameSpinner } from '@/components/game/ui/GameButton';
import type { IdleBuilding, IdleBuyQuantity } from '@/types';
import BuildingArt from './BuildingArt';
import MarketChip from './MarketChip';
import { buyOption, formatCoins, formatRate, milestoneProgress, spokenShort } from './model';

const QUANTITIES: IdleBuyQuantity[] = [1, 10, 'max'];

/** Kilitli binanın açılma eşiği (sunucu: toplam kazanç ≥ temel fiyat × 0,25) */
const UNLOCK_FRACTION = 0.25;

/**
 * Bina kartı: çizim, adet, gelir, piyasa bağı, ×2 eşiğine ilerleme ve x1 / x10 / MAX satın alma çipleri.
 * Kilitliyken "?" silüeti ve açılma ilerlemesi.
 */
export default function BuildingCard({
  building: b,
  cash,
  totalEarned,
  busyKey,
  onBuy,
}: {
  building: IdleBuilding;
  /** İstemcide ara değerlenen bakiye */
  cash: number;
  totalEarned: number;
  busyKey: string | null;
  onBuy: (qty: IdleBuyQuantity) => void;
}) {
  // Satın alınca çizim zıplasın (anahtar değişir → animasyon yeniden başlar)
  const [bounce, setBounce] = useState(0);
  const [prevOwned, setPrevOwned] = useState(b.owned);
  if (b.owned !== prevOwned) {
    setPrevOwned(b.owned);
    if (b.owned > prevOwned) setBounce((n) => n + 1);
  }

  if (!b.unlocked) {
    const target = b.next_cost * UNLOCK_FRACTION;
    const pct = target > 0 ? Math.min(100, (totalEarned / target) * 100) : 0;
    return (
      <li className="g-panel flex items-center gap-3 p-3 opacity-90">
        <BuildingArt artKey={b.art_key} locked size={64} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-base font-extrabold">
            <LockClosedIcon className="h-4 w-4 text-(--g-ink-faint)" aria-hidden="true" />
            <span>Gizli bina</span>
          </p>
          <p className="text-xs font-semibold text-(--g-ink-soft)">Toplam kazancın {formatCoins(target, 'ceil')} olunca açılır.</p>
          <div className="g-progress mt-2 h-3" role="progressbar" aria-label="Açılma ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <div className="g-progress-fill" style={{ width: `${pct}%`, ['--p-color' as string]: 'var(--g-teal)' }} />
          </div>
        </div>
      </li>
    );
  }

  const ms = milestoneProgress(b.owned, b.milestone_next);

  return (
    <li className="g-panel p-3">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <span key={bounce} className={cn('inline-flex', bounce > 0 && 'g-anim-pop')}>
            <BuildingArt artKey={b.art_key} size={72} />
          </span>
          <span className="g-badge-dot g-num absolute -bottom-1 -right-1" aria-label={`${b.owned} adet`}>
            {b.owned.toLocaleString('tr-TR')}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold leading-tight">{b.name}</h3>
          <p className="line-clamp-2 text-xs font-semibold text-(--g-ink-soft)">{b.description}</p>
          <p className="g-num mt-1 text-sm font-extrabold text-(--g-green-edge)">
            {b.owned > 0 ? formatRate(b.income_total) : `${formatRate(b.income_each)} (her biri)`}
            {b.owned > 0 && <span className="ml-1 text-xs font-bold text-(--g-ink-faint)">· her biri {formatCoins(b.income_each)}/sn</span>}
          </p>
          {b.market && (
            <div className="mt-1.5">
              <MarketChip market={b.market} buildingName={b.name} />
            </div>
          )}
        </div>
      </div>

      {/* ×2 eşiği */}
      {ms.next != null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold text-(--g-ink-soft)">
            <span>Sonraki ×2 gelir</span>
            <span className="g-num">
              {b.owned}/{ms.next}
            </span>
          </div>
          <div className="g-progress h-3" role="progressbar" aria-label={`${b.name}: ${ms.next} adette gelir ikiye katlanır`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ms.pct)}>
            <div className="g-progress-fill" style={{ width: `${ms.pct}%`, ['--p-color' as string]: 'var(--g-gold)' }} />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-extrabold text-(--g-gold-edge)">Tüm ×2 eşikleri tamam!</p>
      )}

      {/* Satın alma çipleri */}
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={`${b.name} satın al`}>
        {QUANTITIES.map((q) => {
          const opt = buyOption(b, q, cash);
          const key = `buy:${b.id}:${q}`;
          const loading = busyKey === key;
          const disabled = !opt.affordable || (busyKey != null && busyKey.startsWith('buy:'));
          return (
            <button
              key={String(q)}
              type="button"
              onClick={() => onBuy(q)}
              disabled={disabled}
              aria-busy={loading || undefined}
              aria-label={opt.aria}
              className={cn('g-btn g-btn--sm h-auto min-h-[46px] flex-col gap-0.5 px-1 py-1.5', opt.affordable ? 'g-btn--green' : 'g-btn--plain')}
            >
              {loading ? (
                <GameSpinner />
              ) : (
                <>
                  <span className="text-[13px] leading-none">{opt.label}</span>
                  <span className="g-num max-w-full truncate text-[11px] leading-none opacity-95">{opt.price}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <p className="sr-only">
        Sonraki {b.name}: {spokenShort(formatCoins(b.next_cost, 'ceil'))}.
      </p>
    </li>
  );
}
