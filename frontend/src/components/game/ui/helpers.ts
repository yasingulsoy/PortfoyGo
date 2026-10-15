// Oyun arayüz kiti: saf yardımcılar (avatar / çerçeve / kademe eşlemeleri). React içermez; birim testli.

/** Avatar sayısı (avatar-1 … avatar-12) */
export const AVATAR_COUNT = 12;
export const AVATAR_IDS = Array.from({ length: AVATAR_COUNT }, (_, i) => `avatar-${i + 1}`);

/** Avatar adları — backend kataloğuyla aynı (services/game/config.ts) */
export const AVATAR_NAMES: Record<string, string> = {
  'avatar-1': 'Çaylak Boğa',
  'avatar-2': 'Temkinli Ayı',
  'avatar-3': 'Kurnaz Tilki',
  'avatar-4': 'Bilge Baykuş',
  'avatar-5': 'Sabırlı Kaplumbağa',
  'avatar-6': 'Hızlı Çita',
  'avatar-7': 'Kartal Göz',
  'avatar-8': 'Yalnız Kurt',
  'avatar-9': 'Aslan Yürek',
  'avatar-10': 'Ejderha',
  'avatar-11': 'Anka Kuşu',
  'avatar-12': 'Altın Boğa',
};

export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Katalogdaki nadirlik (çizimin süsü buna göre artar) */
export const AVATAR_RARITY: Record<string, AvatarRarity> = {
  'avatar-1': 'common',
  'avatar-2': 'common',
  'avatar-3': 'common',
  'avatar-4': 'common',
  'avatar-5': 'common',
  'avatar-6': 'common',
  'avatar-7': 'rare',
  'avatar-8': 'rare',
  'avatar-9': 'rare',
  'avatar-10': 'epic',
  'avatar-11': 'epic',
  'avatar-12': 'legendary',
};

/** Basit, kararlı dize özeti (aynı kullanıcı adı → hep aynı avatar). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Avatar kimliğini 1..12 sıra numarasına çevirir. 'avatar-3', 'avatar_3', 'AVATAR3', '3' ve 3 kabul edilir.
 * Tanınmazsa `seed` (ör. kullanıcı adı) ile kararlı bir avatar seçilir; seed de yoksa 1.
 */
export function avatarIndex(id: unknown, seed?: string | null): number {
  let n = NaN;
  if (typeof id === 'number') n = id;
  else if (typeof id === 'string') {
    const m = /^(?:avatar[-_ ]?)?(\d{1,2})$/i.exec(id.trim());
    if (m) n = Number(m[1]);
  }
  if (Number.isInteger(n) && n >= 1 && n <= AVATAR_COUNT) return n;
  if (seed) return (hashString(seed) % AVATAR_COUNT) + 1;
  return 1;
}

export function normalizeAvatarId(id: unknown, seed?: string | null): string {
  return `avatar-${avatarIndex(id, seed)}`;
}

export const FRAME_STYLES = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'neon', 'wheel'] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export const FRAME_NAMES: Record<FrameStyle, string> = {
  bronze: 'Bronz çerçeve',
  silver: 'Gümüş çerçeve',
  gold: 'Altın çerçeve',
  platinum: 'Platin çerçeve',
  diamond: 'Elmas çerçeve',
  neon: 'Neon çerçeve',
  wheel: 'Çark çerçevesi',
};

/** Çerçeve kimliği → stil ('frame-gold', 'gold', 'frame_gold_ring' …). Tanınmazsa null (çerçevesiz). */
export function frameStyle(id: unknown): FrameStyle | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  const s = id.toLowerCase();
  // "spin"/"cark" çark çerçevesi; diğerleri adıyla
  if (/wheel|spin|cark|çark/.test(s)) return 'wheel';
  for (const f of FRAME_STYLES) if (s.includes(f)) return f;
  if (/elmas/.test(s)) return 'diamond';
  if (/altin|altın/.test(s)) return 'gold';
  if (/gumus|gümüş/.test(s)) return 'silver';
  if (/bronz/.test(s)) return 'bronze';
  if (/platin/.test(s)) return 'platinum';
  return null;
}

export const TIER_TONES = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'] as const;
export type TierTone = (typeof TIER_TONES)[number];

/** Kademe kimliği / etiketi → renk tonu. */
export function tierTone(tier: unknown): TierTone {
  const raw = typeof tier === 'string' ? tier : tier && typeof tier === 'object' ? String((tier as any).id ?? (tier as any).label ?? '') : '';
  const s = raw.toLowerCase();
  if (/master|usta|legend|efsane|champion|şampiyon|sampiyon/.test(s)) return 'master';
  if (/diamond|elmas/.test(s)) return 'diamond';
  if (/platin/.test(s)) return 'platinum';
  if (/gold|altın|altin/.test(s)) return 'gold';
  if (/silver|gümüş|gumus/.test(s)) return 'silver';
  if (/bronze|bronz/.test(s)) return 'bronze';
  return 'rookie';
}

export const TIER_LABELS: Record<TierTone, string> = {
  rookie: 'Çaylak',
  bronze: 'Bronz',
  silver: 'Gümüş',
  gold: 'Altın',
  platinum: 'Platin',
  diamond: 'Elmas',
  master: 'Usta',
};

/** Jeton sayısı kısaltma: 1.250 → "1.250", 12.400 → "12,4B", 1.200.000 → "1,2M" */
export function compactCoins(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 10_000) return `${(n / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}B`;
  return Math.round(n).toLocaleString('tr-TR');
}
