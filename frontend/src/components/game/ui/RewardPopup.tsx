'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import Confetti from './Confetti';
import GameButton from './GameButton';
import GameDialog from './GameDialog';
import { CoinIcon, GiftIcon, StarIcon, WheelIcon } from './icons';
import { playSound } from './sound';

export type RewardKind = 'coins' | 'xp' | 'item' | 'spin';

export interface RewardItem {
  kind: RewardKind;
  amount?: number;
  label: string;
  /** Özel çizim (ör. kazanılan avatar) */
  art?: ReactNode;
}

interface Props {
  open: boolean;
  title: string;
  rewards: RewardItem[];
  onClose: () => void;
  subtitle?: ReactNode;
  /** Kapatma düğmesinin metni */
  cta?: string;
  children?: ReactNode;
}

const ICONS: Record<RewardKind, (size: number) => ReactNode> = {
  coins: (s) => <CoinIcon size={s} />,
  xp: (s) => <StarIcon size={s} />,
  item: (s) => <GiftIcon size={s} />,
  spin: (s) => <WheelIcon size={s} />,
};

/** Ödül penceresi: dönen ışınlar, sırayla zıplayan ödüller ve konfeti. */
export default function RewardPopup({ open, title, rewards, onClose, subtitle, cta = 'TOPLA!', children }: Props) {
  useEffect(() => {
    if (open) playSound(rewards.some((r) => r.kind === 'coins') ? 'coin' : 'win');
  }, [open, rewards]);

  return (
    <GameDialog open={open} onClose={onClose} title={title} accent="gold" rays overlay={open ? <Confetti /> : null}>
      {subtitle && <p className="-mt-1 mb-3 text-center text-sm font-bold text-(--g-ink-soft)">{subtitle}</p>}
      <ul className={cn('grid gap-3', rewards.length >= 3 ? 'grid-cols-3' : rewards.length === 2 ? 'grid-cols-2' : 'grid-cols-1')} aria-label="Kazanılan ödüller">
        {rewards.map((r, i) => (
          <li
            key={`${r.kind}-${i}`}
            className="g-panel-inset g-anim-pop flex flex-col items-center justify-center gap-1 px-2 py-3 text-center"
            style={{ animationDelay: `${150 + i * 160}ms` }}
          >
            <span className="g-anim-float inline-flex">{r.art ?? ICONS[r.kind](rewards.length >= 3 ? 44 : 56)}</span>
            {r.amount != null && <span className="g-title g-num text-2xl">+{Math.round(r.amount).toLocaleString('tr-TR')}</span>}
            <span className="text-xs font-extrabold uppercase tracking-wide text-(--g-ink-soft)">{r.label}</span>
          </li>
        ))}
      </ul>
      {children}
      <GameButton variant="green" size="lg" block className="mt-5" onClick={onClose} data-autofocus sound="coin">
        {cta}
      </GameButton>
      <p className="mt-3 text-center text-[11px] font-semibold text-(--g-ink-faint)">Jeton ve XP yalnızca oyun içindir; parayla alınıp satılamaz.</p>
    </GameDialog>
  );
}
