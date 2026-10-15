import type { GameRarity, GameShopItem, GameShopKind, GameUnlockType } from '@/types';

const KINDS: readonly GameShopKind[] = ['avatar', 'frame', 'title'];
const RARITIES: readonly GameRarity[] = ['common', 'rare', 'epic', 'legendary'];
const UNLOCKS: readonly GameUnlockType[] = ['coins', 'tier', 'wheel', 'default'];

export const SHOP_TABS: { kind: GameShopKind; label: string }[] = [
  { kind: 'avatar', label: 'Avatarlar' },
  { kind: 'frame', label: 'Çerçeveler' },
  { kind: 'title', label: 'Unvanlar' },
];

/** Bilinmeyen değerler "common" sayılır. */
export function toRarity(v: unknown): GameRarity {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  return (RARITIES as readonly string[]).includes(s) ? (s as GameRarity) : 'common';
}

export interface RarityMeta {
  label: string;
  /** Sıralama ağırlığı (0 = sıradan) */
  order: number;
  /** game.css renk değişkenleri (yüz / kenar) */
  face: string;
  edge: string;
  /** Kart çevresinde parıltı */
  glow: boolean;
}

export const RARITY_META: Record<GameRarity, RarityMeta> = {
  common: { label: 'Sıradan', order: 0, face: '--g-tier-silver', edge: '--g-tier-silver-edge', glow: false },
  rare: { label: 'Nadir', order: 1, face: '--g-blue', edge: '--g-blue-edge', glow: true },
  epic: { label: 'Destansı', order: 2, face: '--g-purple', edge: '--g-purple-edge', glow: true },
  legendary: { label: 'Efsanevi', order: 3, face: '--g-gold', edge: '--g-gold-edge', glow: true },
};

export const rarityMeta = (v: unknown): RarityMeta => RARITY_META[toRarity(v)];

export function toShopItem(raw: any): GameShopItem {
  const unlockType = UNLOCKS.includes(raw?.unlock?.type) ? (raw.unlock.type as GameUnlockType) : raw?.price_coins != null ? 'coins' : 'default';
  const price = Number(raw?.price_coins);
  const uv = raw?.unlock?.value;
  return {
    id: String(raw?.id ?? ''),
    kind: KINDS.includes(raw?.kind) ? (raw.kind as GameShopKind) : 'avatar',
    name: String(raw?.name ?? ''),
    price_coins: raw?.price_coins == null || !Number.isFinite(price) ? null : Math.max(0, price),
    rarity: toRarity(raw?.rarity),
    owned: raw?.owned === true,
    equipped: raw?.equipped === true,
    unlock: { type: unlockType, value: typeof uv === 'string' || typeof uv === 'number' ? uv : null },
  };
}

export function toShopItems(raw: any): GameShopItem[] {
  const list = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  return list.map(toShopItem).filter((i: GameShopItem) => i.id);
}

/** Satın alma durumu (kartta hangi eylemin gösterileceği) */
export type ShopItemState = 'equipped' | 'owned' | 'buyable' | 'too-expensive' | 'locked';

export function shopItemState(item: GameShopItem, coins: number | null): ShopItemState {
  if (item.equipped) return 'equipped';
  if (item.owned) return 'owned';
  if (item.unlock.type === 'coins' || (item.unlock.type === 'default' && item.price_coins !== null)) {
    if (item.price_coins === null) return 'locked';
    return coins !== null && coins < item.price_coins ? 'too-expensive' : 'buyable';
  }
  return 'locked';
}

const TIER_LABELS: Record<string, string> = {
  bronze: 'Bronz',
  silver: 'Gümüş',
  gold: 'Altın',
  platinum: 'Platin',
  diamond: 'Elmas',
};

export const tierLabel = (v: unknown): string => {
  const s = String(v ?? '').toLowerCase();
  return TIER_LABELS[s] ?? (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : '');
};

/** Kilitli eşyanın nasıl açılacağı */
export function unlockHint(item: GameShopItem): string {
  switch (item.unlock.type) {
    case 'tier':
      return item.unlock.value ? `${tierLabel(item.unlock.value)} kademesine ulaşınca açılır` : 'Kademe atlayınca açılır';
    case 'wheel':
      return 'Günlük Çark’tan kazanılır';
    case 'default':
      return 'Başlangıç eşyası';
    default:
      return item.price_coins !== null ? `${item.price_coins} jeton` : 'Yakında';
  }
}

/** Sekme içi sıralama: kuşanılan → sahip olunan → fiyat/nadirlik */
export function sortShopItems(items: GameShopItem[]): GameShopItem[] {
  const group = (i: GameShopItem) => (i.equipped ? 0 : i.owned ? 1 : i.unlock.type === 'coins' ? 2 : 3);
  return [...items].sort(
    (a, b) =>
      group(a) - group(b) ||
      RARITY_META[a.rarity].order - RARITY_META[b.rarity].order ||
      (a.price_coins ?? Infinity) - (b.price_coins ?? Infinity) ||
      a.name.localeCompare(b.name, 'tr'),
  );
}
