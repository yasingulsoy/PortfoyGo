import type { GameReward, GameRewardKind, GameWheelSegment, GameWheelSpinResult, GameWheelState } from '@/types';

const KINDS: readonly GameRewardKind[] = ['coins', 'xp', 'spin', 'cosmetic'];

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const optNum = (v: unknown): number | null => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};

export function toWheelSegment(raw: any, i = 0): GameWheelSegment {
  const kind = KINDS.includes(raw?.kind) ? (raw.kind as GameRewardKind) : 'coins';
  return {
    id: String(raw?.id ?? `seg-${i}`),
    label: String(raw?.label ?? ''),
    kind,
    amount: optNum(raw?.amount),
    item_id: typeof raw?.item_id === 'string' && raw.item_id ? raw.item_id : null,
    probability_pct: Math.max(0, num(raw?.probability_pct)),
  };
}

export function toWheelState(raw: any): GameWheelState {
  const segments = Array.isArray(raw?.segments) ? raw.segments.map(toWheelSegment) : [];
  return {
    segments,
    free_available: raw?.free_available === true,
    extra_spins: Math.max(0, Math.floor(num(raw?.extra_spins))),
    next_free_at: typeof raw?.next_free_at === 'string' && raw.next_free_at ? raw.next_free_at : null,
    disclaimer: typeof raw?.disclaimer === 'string' && raw.disclaimer ? raw.disclaimer : null,
  };
}

export function toGameReward(raw: any): GameReward {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out: GameReward = {};
  const coins = optNum(r.coins);
  const xp = optNum(r.xp);
  const spin = optNum(r.extra_spin);
  const conv = optNum(r.converted_coins);
  if (coins) out.coins = coins;
  if (xp) out.xp = xp;
  if (spin) out.extra_spin = spin;
  if (typeof r.item_id === 'string' && r.item_id) out.item_id = r.item_id;
  if (conv) out.converted_coins = conv;
  return out;
}

export function toSpinResult(raw: any, segments: GameWheelSegment[] = []): GameWheelSpinResult {
  const segment = raw?.segment ? toWheelSegment(raw.segment) : null;
  let index = Math.floor(num(raw?.segment_index, -1));
  // Dizin geçersizse dilimi kimliğinden bul
  if ((index < 0 || index >= segments.length) && segment) index = segments.findIndex((s) => s.id === segment.id);
  return {
    segment_index: Math.max(0, index),
    segment: segment ?? segments[Math.max(0, index)] ?? toWheelSegment({}),
    reward: toGameReward(raw?.reward),
  };
}

/* ------------------------------------------------------------------ */
/* Çark geometrisi                                                     */
/* ------------------------------------------------------------------ */

/** Dilim açısı (derece) */
export const sliceAngle = (count: number) => 360 / Math.max(1, count);

/** Dilim merkezinin çark üzerindeki açısı (derece; 0 = üst, saat yönünde). */
export const segmentCenterAngle = (index: number, count: number) => sliceAngle(count) * index + sliceAngle(count) / 2;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Göstergenin (üstte, 0°) `index` numaralı dilimin üzerinde durması için çarkın döneceği
 * mutlak açı. Her zaman `current + turns * 360`'tan büyüktür (saat yönünde, en az `turns` tur).
 * `jitter` (-1..1), dilim içinde rastgele bir noktaya denk gelmek için (kenarlara %35 pay bırakılır).
 */
export function spinTargetRotation(current: number, index: number, count: number, turns = 6, jitter = 0): number {
  const slice = sliceAngle(count);
  const offset = Math.max(-1, Math.min(1, jitter)) * slice * 0.35;
  const desired = mod(360 - segmentCenterAngle(index, count) - offset, 360);
  const base = current + Math.max(0, Math.floor(turns)) * 360;
  const delta = mod(desired - mod(base, 360), 360);
  return base + delta;
}

/** Çark bu açıdayken göstergenin altındaki dilim. */
export function segmentAtRotation(rotation: number, count: number): number {
  const pointerOnWheel = mod(360 - mod(rotation, 360), 360);
  return Math.min(count - 1, Math.floor(pointerOnWheel / sliceAngle(count)));
}

/** Ödülün kısa metni: "+50 jeton · +20 XP" */
export function rewardSummary(reward: GameReward, itemName?: string | null): string {
  const parts: string[] = [];
  if (reward.coins) parts.push(`+${reward.coins} jeton`);
  if (reward.xp) parts.push(`+${reward.xp} XP`);
  if (reward.extra_spin) parts.push(`+${reward.extra_spin} ekstra çevirme`);
  if (reward.item_id) parts.push(itemName ? `Yeni eşya: ${itemName}` : 'Yeni kozmetik eşya');
  if (reward.converted_coins) parts.push(`Zaten sahiptin: +${reward.converted_coins} jeton`);
  return parts.join(' · ') || 'Ödül';
}

/** Olasılık yüzdesi metni: 12.5 → "%12,5" */
export function formatPct(pct: number): string {
  const v = Math.round(pct * 10) / 10;
  return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

/* ------------------------------------------------------------------ */
/* Dilim görünümü                                                      */
/* ------------------------------------------------------------------ */

export interface SliceColor {
  /** game.css değişken adları */
  face: string;
  top: string;
  edge: string;
  ink: string;
}

/** Dilim renkleri (sırayla; komşu dilimler farklı renkte). */
export const WHEEL_PALETTE: SliceColor[] = [
  { face: '--g-red', top: '--g-red-top', edge: '--g-red-edge', ink: '--g-on-color' },
  { face: '--g-gold', top: '--g-gold-top', edge: '--g-gold-edge', ink: '--g-gold-ink' },
  { face: '--g-green', top: '--g-green-top', edge: '--g-green-edge', ink: '--g-on-color' },
  { face: '--g-blue', top: '--g-blue-top', edge: '--g-blue-edge', ink: '--g-on-color' },
  { face: '--g-purple', top: '--g-purple-top', edge: '--g-purple-edge', ink: '--g-on-color' },
  { face: '--g-teal', top: '--g-teal-top', edge: '--g-teal-edge', ink: '--g-on-color' },
  { face: '--g-orange', top: '--g-orange-top', edge: '--g-orange-edge', ink: '--g-on-color' },
  { face: '--g-pink', top: '--g-pink-top', edge: '--g-pink-edge', ink: '--g-on-color' },
];

export const sliceColor = (index: number): SliceColor => WHEEL_PALETTE[((index % WHEEL_PALETTE.length) + WHEEL_PALETTE.length) % WHEEL_PALETTE.length];

/** Dilim üzerindeki kısa yazı: büyük satır (miktar) + küçük satır (tür). */
export function segmentFace(seg: Pick<GameWheelSegment, 'kind' | 'amount' | 'label'>): { big: string; small: string } {
  const amount = seg.amount ?? null;
  switch (seg.kind) {
    case 'coins':
      return { big: amount !== null ? String(amount) : '?', small: 'JETON' };
    case 'xp':
      return { big: amount !== null ? String(amount) : '?', small: 'XP' };
    case 'spin':
      return { big: `+${amount ?? 1}`, small: 'ÇEVİRME' };
    default:
      return { big: 'NADİR', small: /çerçeve/i.test(seg.label) ? 'ÇERÇEVE' : 'EŞYA' };
  }
}
