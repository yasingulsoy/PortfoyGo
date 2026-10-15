/** Kutlama penceresi gösterilecek bildirim türleri ve "bir kez göster" kaydı (saf yardımcılar). */

export const CELEBRATION_TYPES = new Set(['game.level_up', 'game.tier_up']);

const KEY = 'pg:game-celebrated';
const MAX = 40;

export function isCelebration(n: { type: string; read_at?: string | null }): boolean {
  return CELEBRATION_TYPES.has(n.type) && !n.read_at;
}

/** Kimliği "kutlandı" olarak işaretler; daha önce kutlandıysa false döner (sekmeler arası, localStorage). */
export function markCelebrated(
  id: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof window !== 'undefined' ? window.localStorage : null,
): boolean {
  if (!id) return false;
  try {
    const list: string[] = JSON.parse(storage?.getItem(KEY) ?? '[]');
    if (Array.isArray(list) && list.includes(id)) return false;
    const next = [...(Array.isArray(list) ? list : []), id].slice(-MAX);
    storage?.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

export interface CelebrationCopy {
  title: string;
  subtitle: string;
  level: number | null;
  tier: string | null;
  coins: number;
  href: string;
}

/** Bildirim verisinden pencere metni. */
export function celebrationCopy(n: { type: string; title: string; data: Record<string, unknown> | null }): CelebrationCopy {
  const d = n.data ?? {};
  const coins = Math.max(0, Number(d.coins) || 0);
  if (n.type === 'game.tier_up') {
    const tier = typeof d.tier === 'string' ? d.tier : null;
    return { title: 'Kademe atladın!', subtitle: n.title || 'Yeni kademeye yükseldin!', level: null, tier, coins, href: '/oyun/siralama' };
  }
  const level = Number.isFinite(Number(d.level)) ? Number(d.level) : null;
  return {
    title: 'Seviye atladın!',
    subtitle: n.title || (level ? `Seviye ${level}'e ulaştın!` : 'Yeni seviyeye ulaştın!'),
    level,
    tier: null,
    coins,
    href: '/oyun',
  };
}
