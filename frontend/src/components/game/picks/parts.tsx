'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { LockClosedIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import GamePanel from '@/components/game/ui/GamePanel';
import { ShieldIcon } from '@/components/game/ui/icons';
import { PCT_TONE_CLASS, pctTone, signedPct } from '@/components/game/model';
import { formatDurationWords } from '@/components/game/quests/time';
import { useNow } from '@/hooks/useNow';
import type { AssetType, PickDirection, PicksPhase, PicksWeek } from '@/types';
import { DIRECTION_LABELS, atDayTime, formatPicksCountdown, formatShortDay, formatShortDayTime } from './model';
import styles from './picks.module.css';

/* Haftalık Seçim ekranlarının küçük ortak parçaları. */

const ASSET_TONE: Record<AssetType, { face: string; edge: string; ink: string; label: string }> = {
  stock: { face: '--g-blue', edge: '--g-blue-edge', ink: '--g-on-color', label: 'Hisse' },
  crypto: { face: '--g-orange', edge: '--g-orange-edge', ink: '--g-on-color', label: 'Kripto' },
  currency: { face: '--g-teal', edge: '--g-teal-edge', ink: '--g-on-color', label: 'Döviz' },
  commodity: { face: '--g-gold', edge: '--g-gold-edge', ink: '--g-gold-ink', label: 'Emtia' },
};

export const assetTypeLabel = (t: AssetType) => ASSET_TONE[t]?.label ?? 'Varlık';

/** Varlık rozeti: türe göre renkli yuvarlak kare + sembolün baş harfleri. */
export function AssetBadge({ type, symbol, size = 40, className }: { type: AssetType; symbol: string; size?: number; className?: string }) {
  const t = ASSET_TONE[type] ?? ASSET_TONE.stock;
  const text = symbol.replace(/[^A-Z0-9ÇĞİÖŞÜ]/gi, '').slice(0, type === 'currency' ? 3 : 4) || '?';
  return (
    <span
      aria-hidden="true"
      className={cn('g-font inline-flex shrink-0 items-center justify-center rounded-[30%] border-2 font-extrabold leading-none', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * (text.length > 3 ? 0.26 : 0.32))),
        background: `var(${t.face})`,
        borderColor: `var(${t.edge})`,
        color: `var(${t.ink})`,
        boxShadow: `0 3px 0 var(${t.edge})`,
      }}
    >
      {text}
    </span>
  );
}

/** "▲ Yükselir" / "▼ Düşer" hapı */
export function DirectionPill({ direction, size = 'md', className }: { direction: PickDirection; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const up = direction === 'up';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-extrabold leading-none',
        up ? 'bg-(--g-up-soft) text-(--g-up)' : 'bg-(--g-down-soft) text-(--g-down)',
        size === 'sm' && 'px-2 py-1 text-[11px]',
        size === 'md' && 'px-2.5 py-1.5 text-xs',
        size === 'lg' && 'px-3.5 py-2 text-base',
        className,
      )}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {DIRECTION_LABELS[direction]}
    </span>
  );
}

/** Renkli getiri metni */
export function ReturnText({ value, className, digits = 2 }: { value: number | null | undefined; className?: string; digits?: number }) {
  return <span className={cn('g-num font-extrabold', PCT_TONE_CLASS[pctTone(value, digits)], className)}>{signedPct(value, digits)}</span>;
}

/** Canlı nokta (hareket azaltmada sabit) */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn(styles.liveDot, className)} />;
}

/**
 * Sunucu saatine göre saniyelik geri sayım. Görsel metin her saniye değişir ama ekran okuyucuya
 * duyurulmaz; erişilebilir metin hedef saati söyler. Süre dolunca `onDone` bir kez çağrılır.
 */
export function PicksCountdown({
  target,
  offsetMs,
  label,
  onDone,
  size = 'lg',
  className,
}: {
  target: string | null;
  offsetMs: number;
  label: string;
  onDone?: () => void;
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const now = useNow(1000) + offsetMs;
  const t = target ? Date.parse(target) : NaN;
  const left = Number.isFinite(t) ? Math.max(0, t - now) : 0;
  const fired = useRef<string | null>(null);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!target || !Number.isFinite(t) || left > 0 || fired.current === target) return;
    fired.current = target;
    doneRef.current?.();
  }, [left, target, t]);

  if (size === 'sm') {
    return (
      <span className={cn('g-num tabular-nums', className)}>
        <span aria-hidden="true">{formatPicksCountdown(left)}</span>
        <span className="sr-only">{left > 0 ? `${formatDurationWords(left)} kaldı` : 'süre doldu'}</span>
      </span>
    );
  }
  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <p className="g-title-sm text-[17px]">
        {label}
        <span className="sr-only">: {left > 0 ? `${formatDurationWords(left)} (${atDayTime(target)})` : 'süre doldu'}</span>
      </p>
      <p className="g-title g-num mt-1 text-[40px] leading-none tracking-wide sm:text-[46px]" aria-hidden="true">
        {formatPicksCountdown(left)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STEP_INDEX: Record<PicksPhase, number> = { upcoming: -1, submit: 0, revealed: 1, live: 2, settling: 3, finished: 4 };

/** Haftanın akışı: Seçim → Açılış → Yarış → Sonuç (İstanbul saati) */
export function PhaseTimeline({ week, className }: { week: Pick<PicksWeek, 'phase' | 'opens_at' | 'reveal_at' | 'starts_at' | 'ends_at'>; className?: string }) {
  const current = STEP_INDEX[week.phase];
  const steps = [
    { title: 'Gizli seçim', when: `${formatShortDay(week.opens_at)} – ${formatShortDayTime(week.reveal_at)}` },
    { title: 'Açılış', when: formatShortDayTime(week.reveal_at) },
    { title: 'Yarış', when: `${formatShortDay(week.starts_at)} – ${formatShortDay(week.ends_at, -1)}` },
    { title: 'Sonuç', when: `${formatShortDay(week.ends_at)} · ödüller` },
  ];
  return (
    <ol className={cn('grid grid-cols-4 gap-1.5', className)} aria-label="Haftanın akışı">
      {steps.map((s, i) => {
        const done = i < current;
        const here = i === current;
        return (
          <li key={s.title} className="flex min-w-0 flex-col items-center gap-1 text-center" aria-current={here ? 'step' : undefined}>
            <span
              aria-hidden="true"
              className={cn(
                'g-font flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-extrabold',
                here
                  ? 'border-(--g-gold-edge) bg-(--g-gold) text-(--g-gold-ink) shadow-[0_3px_0_var(--g-gold-edge)]'
                  : done
                    ? 'border-(--g-green-edge) bg-(--g-green) text-(--g-on-color)'
                    : 'border-(--g-glass-edge) bg-(--g-glass) text-(--g-on-color)',
              )}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className="g-title-sm block max-w-full text-[13px] leading-tight">{s.title}</span>
            <span className="block max-w-full text-[10.5px] font-bold leading-tight text-(--g-on-color) opacity-90">
              {s.when}
              {here && <span className="sr-only"> (şu an)</span>}
              {done && <span className="sr-only"> (tamamlandı)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

/**
 * "Gizli zarf": arkada mühürlü zarf yığını, önde benim zarfım. `sealing` anında kapak kapanır ve
 * mühür basılır (hareket azaltmada animasyonsuz).
 */
export function SealedEnvelope({ sealing, mine, className }: { sealing?: boolean; mine?: boolean; className?: string }) {
  const edge = 'var(--g-outline)';
  return (
    <div className={cn('relative mx-auto w-full max-w-[220px]', sealing && styles.sealing, className)}>
      <span className={styles.glow} aria-hidden="true" />
      <svg viewBox="0 0 200 150" className={cn(styles.envelope, !sealing && 'g-anim-float')} aria-hidden="true" focusable="false">
        {/* Arkadaki zarflar */}
        <g transform="rotate(-9 100 90)">
          <rect x={26} y={44} width={148} height={92} rx={10} fill="var(--g-c-bg-5)" stroke={edge} strokeWidth={3} />
        </g>
        <g transform="rotate(7 100 90)">
          <rect x={26} y={44} width={148} height={92} rx={10} fill="var(--g-c-bg-2)" stroke={edge} strokeWidth={3} />
        </g>
        {/* Mektup (mühürlerken içeri kayar) */}
        <g className={styles.letter}>
          <rect x={46} y={58} width={108} height={70} rx={6} fill="var(--g-c-white)" stroke={edge} strokeWidth={2.5} />
          <path d="M60 74h56M60 86h76M60 98h40" stroke="var(--g-c-grey)" strokeWidth={4} strokeLinecap="round" />
          <path d="M128 92l8-10 8 10" fill="none" stroke="var(--g-up)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {/* Gövde */}
        <path d="M30 52h140v78a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8z" fill="var(--g-c-cream)" stroke={edge} strokeWidth={3} strokeLinejoin="round" />
        <path d="M32 136l58-44M168 136l-58-44" stroke="var(--g-c-tan)" strokeWidth={3} strokeLinecap="round" />
        {/* Kapak (kapalı: aşağı bakar) */}
        <path className={styles.flap} d="M30 52h140l-62 50a12 12 0 0 1-16 0z" fill="var(--g-c-sand)" stroke={edge} strokeWidth={3} strokeLinejoin="round" />
        {/* Balmumu mühür + kilit */}
        <g className={styles.seal}>
          <circle cx={100} cy={100} r={19} fill="var(--g-red)" stroke="var(--g-red-edge)" strokeWidth={3} />
          <circle cx={100} cy={100} r={13} fill="none" stroke="var(--g-red-top)" strokeWidth={2} opacity={0.8} />
          <path d="M94 99v-4a6 6 0 0 1 12 0v4" fill="none" stroke="var(--g-on-color)" strokeWidth={3} strokeLinecap="round" />
          <rect x={91} y={98} width={18} height={12} rx={3} fill="var(--g-on-color)" />
          <circle cx={100} cy={104} r={2} fill="var(--g-red-edge)" />
        </g>
        {mine && (
          <g>
            <circle cx={166} cy={50} r={14} fill="var(--g-green)" stroke="var(--g-green-edge)" strokeWidth={3} />
            <path d="M159 50l5 5 9-10" fill="none" stroke="var(--g-on-color)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>
    </div>
  );
}

/** Oyun Merkezi kutusu için küçük zarf çizimi */
export function PicksArt() {
  const edge = 'var(--g-outline)';
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect x={4} y={12} width={30} height={21} rx={4} fill="var(--g-c-bg-5)" stroke={edge} strokeWidth={2} transform="rotate(-8 19 22)" />
      <rect x={6} y={13} width={30} height={21} rx={4} fill="var(--g-c-cream)" stroke={edge} strokeWidth={2} />
      <path d="M6.5 14.5L21 25l14.5-10.5" fill="var(--g-c-sand)" stroke={edge} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={21} cy={25} r={5} fill="var(--g-red)" stroke="var(--g-red-edge)" strokeWidth={1.6} />
      <path d="M19 25.5l1.4 1.4 2.6-3" fill="none" stroke="var(--g-on-color)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 9l3-4 3 4" fill="none" stroke="var(--g-up)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/** "Neden gizli?" — bağımsız karar, sonra paylaşım (Kitlelerin Bilgeliği) */
export function WhyHiddenPanel({ revealText, className }: { revealText: string; className?: string }) {
  const items: { icon: ReactNode; title: string; text: string }[] = [
    {
      icon: <LockClosedIcon className="h-5 w-5" aria-hidden="true" />,
      title: 'Önce tek başına karar ver',
      text: 'Kimsenin seçimini görmeden düşündüğünde kalabalığın peşinden sürüklenmezsin; kararın gerçekten senin olur.',
    },
    {
      icon: <span aria-hidden="true" className="text-base font-black">∑</span>,
      title: 'Bağımsız tahminler birbirini dengeler',
      text: 'Herkes kendi bilgisiyle seçince hatalar farklı yönlere dağılır. Hepsini eşit ağırlıkla birleştiren “kitle portföyü” bu yüzden çoğu hafta katılımcıların büyük kısmından iyi sonuç verir.',
    },
    {
      icon: <span aria-hidden="true" className="text-base font-black">💬</span>,
      title: 'Paylaşım sonra gelir',
      text: `Zarflar ${revealText} açılır: o andan itibaren herkesin seçimini ve notunu görüp tartışabilirsin.`,
    },
  ];
  return (
    <GamePanel title="Neden gizli?" accent="purple" className={className}>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 border-(--g-purple-edge) bg-(--g-purple) text-(--g-on-color)">
              {it.icon}
            </span>
            <span className="min-w-0 text-sm">
              <strong className="block font-extrabold">{it.title}</strong>
              <span className="font-semibold text-(--g-ink-soft)">{it.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </GamePanel>
  );
}

/** Sayfa altı: sanal yarışma notu */
export function PicksFooterNote() {
  return (
    <p className="g-glass mx-auto mt-8 flex w-fit max-w-full items-center gap-2 rounded-full px-4 py-2 text-center text-xs font-extrabold text-(--g-on-color)">
      <ShieldIcon size={18} />
      Sanal yarışma · Yatırım tavsiyesi değildir · Ödüller yalnızca oyun içindir
    </p>
  );
}
