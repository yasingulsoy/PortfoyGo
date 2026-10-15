'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { cn } from '@portfoygo/shared/format';
import { CoinIcon } from '@/components/game/ui/icons';
import { useReducedMotion } from '@/components/game/ui/hooks';
import { playSound } from '@/components/game/ui/sound';
import type { IdleBuilding } from '@/types';
import { BuildingArtNested } from './BuildingArt';
import { formatCoins, skylineLevel } from './model';
import styles from './idle.module.css';

/** Sahnedeki yerleşim: arka sıra (büyük) ve ön sıra (küçük) */
const SLOTS: Record<string, { x: number; base: number; row: 'back' | 'front' }> = {
  altin: { x: 92, base: 168, row: 'back' },
  holding: { x: 200, base: 162, row: 'back' },
  hisse: { x: 308, base: 168, row: 'back' },
  kumbara: { x: 58, base: 214, row: 'front' },
  doviz: { x: 158, base: 216, row: 'front' },
  kripto: { x: 262, base: 216, row: 'front' },
};

const MAX_POPS = 14;

interface Pop {
  id: number;
  x: number;
  y: number;
  text: string;
  drift: number;
}

/**
 * Dokunulabilir şehir sahnesi: sahip olunan binalar büyüdükçe silüet yükselir.
 * Dokunuş → jeton patlaması (+₺) ve sunucuya toplu gönderilecek dokunuş.
 */
export default function CityScene({
  buildings,
  onTap,
  tapValue,
}: {
  buildings: IdleBuilding[];
  /** Kabul edilirse kazanılan tutar, sınır aşıldıysa null */
  onTap: () => number | null;
  tapValue: number;
}) {
  const reduced = useReducedMotion();
  const [pops, setPops] = useState<Pop[]>([]);
  const [taps, setTaps] = useState(0);
  const [slow, setSlow] = useState(false);
  const seq = useRef(0);
  const sceneRef = useRef<SVGGElement>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = new Map(buildings.map((b) => [b.art_key || b.id, b]));
  const totalOwned = buildings.reduce((s, b) => s + b.owned, 0);

  const handleTap = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Klavye ile tetiklenirse (detail 0) ortadan çık
    const x = e.detail === 0 || !rect.width ? 50 : ((e.clientX - rect.left) / rect.width) * 100;
    const y = e.detail === 0 || !rect.height ? 45 : ((e.clientY - rect.top) / rect.height) * 100;
    const gained = onTap();
    if (gained == null) {
      setSlow(true);
      if (slowTimer.current) clearTimeout(slowTimer.current);
      slowTimer.current = setTimeout(() => setSlow(false), 1200);
      return;
    }
    playSound('coin');
    setTaps((n) => n + 1);
    const id = ++seq.current;
    const pop: Pop = { id, x, y, text: `+${formatCoins(gained)}`, drift: Math.round((Math.random() - 0.5) * 40) };
    setPops((list) => [...list.slice(-(MAX_POPS - 1)), pop]);
    setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), 950);
    if (!reduced && sceneRef.current?.animate) {
      sceneRef.current.animate(
        [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.025, 0.975)' }, { transform: 'scale(1, 1)' }],
        { duration: 160, easing: 'ease-out' },
      );
    }
  };

  const order = ['altin', 'holding', 'hisse', 'kumbara', 'doviz', 'kripto'];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleTap}
        className="g-focus relative block w-full touch-manipulation select-none overflow-hidden rounded-[28px] border-[3px] border-(--g-panel-edge) bg-(--g-glass) shadow-[0_6px_0_var(--g-panel-shadow)] active:translate-y-[1px]"
        aria-label={`Şehrine dokun: her dokunuş ${formatCoins(tapValue)} kazandırır`}
        aria-describedby="idle-tap-hint"
      >
        <svg viewBox="0 0 400 240" className="block h-auto w-full" aria-hidden="true">
          {/* bulutlar */}
          <g className={styles.cloud} opacity={0.9}>
            <ellipse cx={40} cy={40} rx={26} ry={10} fill="var(--g-cloud)" />
            <ellipse cx={58} cy={34} rx={16} ry={10} fill="var(--g-cloud)" />
          </g>
          <g className={styles.cloud} style={{ animationDelay: '-22s' }} opacity={0.7}>
            <ellipse cx={30} cy={70} rx={22} ry={8} fill="var(--g-cloud)" />
            <ellipse cx={44} cy={64} rx={13} ry={8} fill="var(--g-cloud)" />
          </g>
          {/* güneş (açık tema) / ay ve yıldızlar (koyu tema) */}
          <g className="dark:hidden">
            <circle cx={350} cy={42} r={20} fill="var(--g-c-yellow)" opacity={0.9} />
            <circle cx={350} cy={42} r={28} fill="var(--g-c-yellow)" opacity={0.25} />
          </g>
          <g className="hidden dark:inline">
            <circle cx={350} cy={40} r={17} fill="var(--g-c-cream)" />
            <circle cx={358} cy={34} r={15} fill="var(--g-sky-mid)" />
            {[
              [40, 24],
              [96, 50],
              [150, 18],
              [230, 40],
              [290, 22],
              [384, 80],
            ].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="var(--g-star)" />
            ))}
          </g>
          <g ref={sceneRef} style={{ transformOrigin: '50% 100%', transformBox: 'fill-box' }}>
            {/* tepeler */}
            <path d="M0 176 Q70 120 150 168 Q230 110 310 160 Q360 136 400 150 V240 H0 Z" fill="var(--g-c-green-dark)" opacity={0.55} />
            {/* zemin + yol */}
            <path d="M0 180 Q200 166 400 180 V240 H0 Z" fill="var(--g-c-green)" />
            <path d="M0 226 Q200 214 400 226 V240 H0 Z" fill="var(--g-c-grey-dark)" opacity={0.85} />
            <path d="M20 231 H60 M100 229 H140 M180 228 H220 M260 229 H300 M340 231 H380" stroke="var(--g-c-white)" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
            {/* binalar */}
            {order.map((key) => {
              const slot = SLOTS[key];
              const b = byId.get(key);
              if (!slot || !b) return null;
              const level = skylineLevel(b.owned);
              const back = slot.row === 'back';
              if (level === 0) {
                if (!b.unlocked) return null;
                // Boş arsa: "satılık" tabelası
                return (
                  <g key={key} opacity={0.8}>
                    <rect x={slot.x - 22} y={slot.base - 8} width={44} height={8} rx={3} fill="var(--g-c-tan)" />
                    <rect x={slot.x - 2} y={slot.base - 30} width={4} height={24} fill="var(--g-c-brown)" />
                    <rect x={slot.x - 16} y={slot.base - 40} width={32} height={14} rx={3} fill="var(--g-c-white)" stroke="var(--g-c-brown)" strokeWidth={2} />
                    <text x={slot.x} y={slot.base - 30} textAnchor="middle" fontSize={8} fontWeight={800} fill="var(--g-c-ink)">
                      SATILIK
                    </text>
                  </g>
                );
              }
              const size = back ? 62 + level * 13 : 54 + level * 11;
              const x = slot.x - size / 2;
              const y = slot.base - size * 0.93;
              return (
                <g key={`${key}-${level}`} className={styles.grow}>
                  <BuildingArtNested artKey={key} x={x} y={y} size={size} />
                  {/* adet balonu */}
                  <g transform={`translate(${slot.x + size * 0.32} ${y + size * 0.12})`}>
                    <rect x={-14} y={-9} width={28} height={16} rx={8} fill="var(--g-hud)" stroke="var(--g-on-color)" strokeWidth={1.5} />
                    <text x={0} y={3} textAnchor="middle" fontSize={9.5} fontWeight={900} fill="var(--g-on-color)">
                      ×{b.owned > 999 ? '999+' : b.owned}
                    </text>
                  </g>
                </g>
              );
            })}
            {/* ağaçlar */}
            {[18, 112, 210, 312, 382].map((tx, i) => (
              <g key={tx} transform={`translate(${tx} ${i % 2 ? 214 : 210})`}>
                <rect x={-2} y={-2} width={4} height={10} fill="var(--g-c-brown)" />
                <circle cx={0} cy={-8} r={8} fill="var(--g-c-green-dark)" />
              </g>
            ))}
          </g>
        </svg>

        {/* Jeton patlamaları */}
        {pops.map((p) => (
          <span
            key={p.id}
            className={cn(styles.pop, 'g-title-sm g-num flex items-center gap-1 text-lg')}
            style={{ left: `${p.x}%`, top: `${p.y}%`, ['--drift' as string]: `${p.drift}px` }}
            aria-hidden="true"
          >
            <CoinIcon size={22} />
            {p.text}
          </span>
        ))}

        {/* İpucu balonu */}
        {(taps === 0 || totalOwned === 0) && (
          <span
            className={cn(
              'pointer-events-none absolute left-1/2 top-3 rounded-full border-2 border-(--g-gold-edge) bg-(--g-gold) px-3 py-1 text-sm font-extrabold text-(--g-gold-ink) shadow-[0_3px_0_var(--g-gold-edge)]',
              styles.hint,
            )}
            aria-hidden="true"
          >
            {totalOwned === 0 ? 'Dokun, ilk Kumbaranı al!' : 'Dokun, kazan!'}
          </span>
        )}
        {slow && (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-(--g-hud) px-3 py-1 text-xs font-bold text-(--g-on-color)" role="status">
            Biraz yavaş! Saniyede en fazla 10 dokunuş.
          </span>
        )}
      </button>
      <p id="idle-tap-hint" className="sr-only">
        Dokunuş kazancı sunucuya her saniye toplu gönderilir. Binalar sen dokunmasan da kazanmaya devam eder.
      </p>
    </div>
  );
}
