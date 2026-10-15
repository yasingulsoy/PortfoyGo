import type { GameLeaderboard, GameLeaderboardRow, GameLedgerPage } from '@/types';

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function toLeaderboardRow(raw: any, i = 0): GameLeaderboardRow {
  const level = num(raw?.level, NaN);
  return {
    rank: Math.max(1, Math.floor(num(raw?.rank, i + 1))),
    username: String(raw?.username ?? 'Oyuncu'),
    avatar_id: str(raw?.avatar_id),
    frame_id: str(raw?.frame_id),
    value: num(raw?.value),
    tier: str(raw?.tier) ?? (raw?.tier && typeof raw.tier === 'object' ? str(raw.tier.id) : null),
    level: Number.isFinite(level) ? level : null,
  };
}

export function toGameLeaderboard(raw: any): GameLeaderboard {
  const items = Array.isArray(raw?.items) ? raw.items.map(toLeaderboardRow) : [];
  const me = raw?.me && typeof raw.me === 'object' ? raw.me : null;
  // Sıralamaya girmemiş (ör. hiç oynamamış) kullanıcının sırası null gelir
  const meRank = me ? Number(me.rank) : NaN;
  return { items, me: me ? { ...toLeaderboardRow(me), rank: Number.isFinite(meRank) && meRank > 0 ? Math.floor(meRank) : null } : null };
}

export function toLedgerPage(raw: any): GameLedgerPage {
  const items = Array.isArray(raw?.items)
    ? raw.items.map((r: any) => ({
        coins: num(r?.coins),
        xp: num(r?.xp),
        reason: String(r?.reason ?? ''),
        created_at: String(r?.created_at ?? ''),
      }))
    : [];
  return { items, total: Math.max(items.length, Math.floor(num(raw?.total))) };
}

/* ------------------------------------------------------------------ */
/* Kademeler                                                           */
/* ------------------------------------------------------------------ */

export type TierId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface TierStep {
  id: TierId;
  label: string;
  /** Bu kademenin başladığı puan */
  min: number;
}

/** Varsayılan kademe eşikleri (sunucu profilde eşik gönderirse onlar kullanılır). */
export const DEFAULT_TIERS: TierStep[] = [
  { id: 'bronze', label: 'Bronz', min: 0 },
  { id: 'silver', label: 'Gümüş', min: 1100 },
  { id: 'gold', label: 'Altın', min: 1250 },
  { id: 'platinum', label: 'Platin', min: 1400 },
  { id: 'diamond', label: 'Elmas', min: 1600 },
];

const TIER_IDS: readonly TierId[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

/** Sunucudan gelen eşik listesini okur ([{id|tier, min|min_rating}] veya {bronze: 0, ...}); geçersizse varsayılan. */
export function toTierSteps(raw: any): TierStep[] {
  let list: { id: string; min: number }[] = [];
  if (Array.isArray(raw)) list = raw.map((t) => ({ id: String(t?.id ?? t?.tier ?? '').toLowerCase(), min: num(t?.min ?? t?.min_rating ?? t?.threshold, NaN) }));
  else if (raw && typeof raw === 'object') list = Object.entries(raw).map(([id, v]) => ({ id: id.toLowerCase(), min: num(v, NaN) }));
  const steps = list
    .filter((t): t is { id: TierId; min: number } => (TIER_IDS as readonly string[]).includes(t.id) && Number.isFinite(t.min))
    .map((t) => ({ id: t.id, min: t.min, label: DEFAULT_TIERS.find((d) => d.id === t.id)!.label }))
    .sort((a, b) => a.min - b.min);
  return steps.length >= 2 ? steps : DEFAULT_TIERS;
}

/** Puanın bulunduğu kademe ve bir sonrakine ilerleme. */
export function tierProgress(rating: number, steps: TierStep[] = DEFAULT_TIERS) {
  let idx = 0;
  steps.forEach((s, i) => {
    if (rating >= s.min) idx = i;
  });
  const current = steps[idx];
  const next = steps[idx + 1] ?? null;
  const pct = next ? Math.max(0, Math.min(100, Math.round(((rating - current.min) / Math.max(1, next.min - current.min)) * 100))) : 100;
  return { index: idx, current, next, pct, toNext: next ? Math.max(0, next.min - rating) : 0 };
}

/** Kürsü sırası: 2 · 1 · 3 (ortada birinci) */
export function podiumOrder<T extends { rank: number }>(rows: T[]): T[] {
  const top = [...rows].sort((a, b) => a.rank - b.rank).slice(0, 3);
  return [top[1], top[0], top[2]].filter(Boolean) as T[];
}
