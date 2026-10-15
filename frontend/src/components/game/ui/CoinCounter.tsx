'use client';

import { useState, type ReactNode } from 'react';
import AnimatedNumber from '@portfoygo/shared/ui/AnimatedNumber';
import { cn } from '@portfoygo/shared/format';
import { CoinIcon, TrophyIcon } from './icons';
import { compactCoins } from './helpers';

interface HudCounterProps {
  icon: ReactNode;
  value: number;
  /** Ekran okuyucu etiketi (ör. "Jeton") */
  label: string;
  animate?: boolean;
  format?: (n: number) => string;
  className?: string;
}

/** Üst çubuktaki koyu kapsül sayaç (simge + animasyonlu sayı). Değer artınca kısa bir "pop". */
export function HudCounter({ icon, value, label, animate = true, format = compactCoins, className }: HudCounterProps) {
  // Önceki değere göre artış: render sırasında durum ayarlama (effect gerektirmez)
  const [prev, setPrev] = useState(value);
  const [bump, setBump] = useState(0);
  if (value !== prev) {
    setPrev(value);
    if (animate && value > prev) setBump((b) => b + 1);
  }

  return (
    <span className={cn('g-hud g-num', className)} aria-label={`${label}: ${Math.round(value).toLocaleString('tr-TR')}`} role="status">
      <span key={bump} className={cn('inline-flex', bump > 0 && 'g-anim-pop')}>
        {icon}
      </span>
      <span aria-hidden="true" className="min-w-[2ch] text-[15px] leading-none">
        {animate ? <AnimatedNumber value={value} format={format} duration={700} /> : format(value)}
      </span>
    </span>
  );
}

/** Jeton sayacı */
export function CoinCounter({ value, animate = true, className }: { value: number; animate?: boolean; className?: string }) {
  return <HudCounter icon={<CoinIcon size={26} />} value={value} label="Jeton" animate={animate} className={className} />;
}

/** Puan (rating) sayacı */
export function RatingCounter({ value, animate = true, className }: { value: number; animate?: boolean; className?: string }) {
  return <HudCounter icon={<TrophyIcon size={24} />} value={value} label="Puan" animate={animate} format={(n) => Math.round(n).toLocaleString('tr-TR')} className={className} />;
}

export default CoinCounter;
