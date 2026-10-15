'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GameButton from '@/components/game/ui/GameButton';
import { CoinIcon } from '@/components/game/ui/icons';
import type { GameShopItem } from '@/types';
import { RARITY_META, shopItemState, unlockHint, type ShopItemState } from './model';
import styles from './shop.module.css';

/** Unvan rozeti (mağaza ve önizlemede) */
export function TitleBadge({ name, rarity, className }: { name: string; rarity: GameShopItem['rarity']; className?: string }) {
  const r = RARITY_META[rarity];
  return (
    <span
      className={cn('g-ribbon max-w-full truncate text-sm', className)}
      style={{ '--r-face': `var(${r.face})`, '--r-edge': `var(${r.edge})` } as CSSProperties}
    >
      {name}
    </span>
  );
}

export function ItemArt({ item, avatarId, frameId, size = 72 }: { item: GameShopItem; avatarId: string | null; frameId: string | null; size?: number }) {
  if (item.kind === 'avatar') return <Avatar avatarId={item.id} frameId={frameId} size={size} />;
  if (item.kind === 'frame') return <Avatar avatarId={avatarId} frameId={item.id} size={size} />;
  return (
    <span className="flex h-[72px] w-full items-center justify-center px-1">
      <TitleBadge name={item.name} rarity={item.rarity} />
    </span>
  );
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

const KIND_LABEL: Record<GameShopItem['kind'], string> = { avatar: 'avatar', frame: 'çerçeve', title: 'unvan' };

export function ShopItemCard({
  item,
  coins,
  selected,
  busy,
  avatarId,
  frameId,
  onPreview,
  onBuy,
  onEquip,
  onUnequip,
}: {
  item: GameShopItem;
  coins: number | null;
  selected: boolean;
  busy: boolean;
  avatarId: string | null;
  frameId: string | null;
  onPreview: (item: GameShopItem) => void;
  onBuy: (item: GameShopItem) => void;
  onEquip: (item: GameShopItem) => void;
  onUnequip: (item: GameShopItem) => void;
}) {
  const r = RARITY_META[item.rarity];
  const state: ShopItemState = shopItemState(item, coins);
  const locked = state === 'locked';
  const missing = state === 'too-expensive' && item.price_coins !== null && coins !== null ? item.price_coins - coins : 0;

  let action: ReactNode;
  switch (state) {
    case 'equipped':
      action =
        item.kind === 'avatar' ? (
          <span className="g-chip h-9 w-full px-2 text-sm text-(--g-up)">Kuşanıldı</span>
        ) : (
          <GameButton variant="plain" size="sm" block loading={busy} onClick={() => onUnequip(item)} aria-label={`${item.name} ${KIND_LABEL[item.kind]} çıkar`}>
            Çıkar
          </GameButton>
        );
      break;
    case 'owned':
      action = (
        <GameButton variant="green" size="sm" block loading={busy} onClick={() => onEquip(item)} aria-label={`${item.name} ${KIND_LABEL[item.kind]} kuşan`}>
          Kuşan
        </GameButton>
      );
      break;
    case 'buyable':
    case 'too-expensive':
      action = (
        <GameButton
          variant="gold"
          size="sm"
          block
          loading={busy}
          disabled={state === 'too-expensive'}
          onClick={() => onBuy(item)}
          icon={<CoinIcon size={18} />}
          aria-label={`${item.name} satın al, ${item.price_coins} jeton`}
        >
          <span className="g-num">{item.price_coins}</span>
        </GameButton>
      );
      if (missing > 0)
        action = (
          <div className="flex flex-col gap-1">
            {action}
            <span className="text-center text-[11px] font-extrabold text-(--g-ink-soft)">{missing} jeton daha gerekli</span>
          </div>
        );
      break;
    default:
      action = (
        <span className="flex min-h-9 items-center justify-center gap-1 rounded-xl bg-(--g-panel-2) px-2 py-1 text-center text-[11px] font-extrabold leading-tight text-(--g-ink-soft)">
          <LockGlyph />
          {unlockHint(item)}
        </span>
      );
  }

  return (
    <li
      className={cn('g-panel flex min-w-0 flex-col gap-2 p-2.5', styles.card, r.glow && styles.glow, selected && styles.selected)}
      style={{ '--r-face': `var(${r.face})`, '--r-edge': `var(${r.edge})` } as CSSProperties}
    >
      <button
        type="button"
        onClick={() => onPreview(item)}
        aria-pressed={selected}
        aria-label={`${item.name} (${r.label} ${KIND_LABEL[item.kind]}) önizle`}
        className={cn(
          'g-focus relative flex flex-col items-center gap-1.5 rounded-2xl bg-(--g-panel-2) px-1 pb-2 pt-5',
          item.rarity === 'legendary' && styles.shine,
        )}
      >
        <span
          className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-(--g-on-color)"
          style={{ background: `var(${r.face})`, boxShadow: `0 2px 0 var(${r.edge})`, textShadow: `0 1px 0 var(${r.edge})` }}
        >
          {r.label}
        </span>
        {state === 'equipped' && (
          <span
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-(--g-green-edge) bg-(--g-green) text-(--g-on-color)"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
        )}
        <span className={cn('flex items-center justify-center', locked && 'opacity-60 grayscale')}>
          <ItemArt item={item} avatarId={avatarId} frameId={frameId} />
        </span>
        <span className="line-clamp-2 min-h-[2.5em] text-center text-sm font-extrabold leading-tight">{item.name}</span>
      </button>
      {action}
    </li>
  );
}
