'use client';

import { useEffect, useRef } from 'react';
import { ArrowTrendingUpIcon, BoltIcon, Squares2X2Icon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { CoinIcon } from '@/components/game/ui/icons';
import { useLiveCash } from '@/hooks/useIdle';
import type { IdleState } from '@/types';
import { formatCoins, formatRate, spokenShort } from './model';

/** Büyük, kesintisiz artan bakiye sayacı (istemcide ara değerlenir; DOM'a doğrudan yazılır) + gelir/sn. */
export default function CashHeader({
  state,
  getCash,
  className,
}: {
  state: IdleState;
  getCash: (now?: number) => number;
  className?: string;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  // Ekran okuyucu için seyrek güncellenen değer
  const spoken = useLiveCash(getCash, 15_000);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      // ~12 fps yeterli; her karede biçimlendirme yapma
      if (t - last > 80) {
        last = t;
        const el = textRef.current;
        const text = formatCoins(getCash());
        if (el && el.textContent !== text) el.textContent = text;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getCash]);

  const bonus = state.prestige.bonus_pct;

  return (
    <section aria-label="Kasa" className={cn('flex flex-col items-center text-center', className)}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-(--g-on-color) opacity-90">İmparatorluk kasası</p>
      <div className="mt-1 flex max-w-full items-center gap-2">
        <CoinIcon size={44} className="g-anim-float" />
        <span
          ref={textRef}
          aria-hidden="true"
          className="g-title g-num min-w-0 truncate text-[44px] leading-none sm:text-[52px]"
        >
          {formatCoins(state.cash)}
        </span>
        <span className="sr-only">
          Bakiye yaklaşık {spokenShort(formatCoins(spoken || state.cash))}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <span className="g-hud g-num px-3 text-sm" title="Saniyelik gelir (tüm binalar, piyasa ve bonuslar dahil)">
          <BoltIcon className="h-4 w-4 text-(--g-gold-top)" aria-hidden="true" />
          {formatRate(state.income_per_sec)}
        </span>
        {bonus > 0 && (
          <span className="g-hud g-num px-3 text-sm" title="Halka arz paylarının kalıcı gelir bonusu">
            <ArrowTrendingUpIcon className="h-4 w-4 text-(--g-up)" aria-hidden="true" />+%{bonus.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} pay bonusu
          </span>
        )}
        {state.boosts?.diversification_active && (
          <span className="g-hud px-3 text-sm" title="En az 4 farklı bina türü: çeşitlendirme bonusu">
            <Squares2X2Icon className="h-4 w-4 text-(--g-teal-top)" aria-hidden="true" />Çeşitlendirme +%{state.boosts.diversification_pct.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11px] font-bold text-(--g-on-color) opacity-80">Sanal İmparatorluk Lirası · gerçek para değildir</p>
    </section>
  );
}
