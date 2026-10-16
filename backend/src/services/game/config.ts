/**
 * Oyun ekonomisi ayarları — TEK düzenlenebilir dosya.
 *
 * Jeton (coins) ve XP yalnızca oyun içi değerlerdir: gerçek para ile satın alınamaz, gerçek paraya
 * çevrilemez. Şans çarkı tamamen ücretsizdir (günde 1 ücretsiz + oyunla kazanılan ek haklar);
 * olasılıklar (weight = yüzde) API'de açıkça gösterilir.
 */

// ---------------------------------------------------------------------------
// Seviyeler
// ---------------------------------------------------------------------------

export const LEVELS = {
  /** Seviye n → n+1 için gereken XP = round(base · n^exponent) (kümülatif toplanır) */
  base: 100,
  exponent: 1.5,
  maxLevel: 100,
  /** Her yeni seviyede verilen jeton */
  levelUpCoins: 50,
} as const;

/** Seviye n'den n+1'e geçmek için gereken XP */
export function xpForLevel(level: number): number {
  return Math.round(LEVELS.base * Math.pow(level, LEVELS.exponent));
}

/** Seviye n'e ulaşmak için gereken toplam XP (seviye 1 = 0) */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, LEVELS.maxLevel); l += 1) total += xpForLevel(l);
  return total;
}

export interface LevelInfo {
  level: number;
  xp_in_level: number;
  /** Bu seviyeyi bitirmek için gereken XP (maks. seviyede 0) */
  needed: number;
  /** 0–100 */
  pct: number;
}

export function levelInfo(xpRaw: number): LevelInfo {
  const xp = Math.max(0, Math.floor(Number(xpRaw) || 0));
  let floor = 0;
  for (let level = 1; level < LEVELS.maxLevel; level += 1) {
    const needed = xpForLevel(level);
    if (xp < floor + needed) {
      const inLevel = xp - floor;
      return { level, xp_in_level: inLevel, needed, pct: Math.min(100, Math.floor((inLevel / needed) * 100)) };
    }
    floor += needed;
  }
  return { level: LEVELS.maxLevel, xp_in_level: xp - floor, needed: 0, pct: 100 };
}

// ---------------------------------------------------------------------------
// Arena reytingi ve kademeler
// ---------------------------------------------------------------------------

export const RATING = {
  initial: 1000,
  /** Reyting bunun altına düşmez */
  floor: 100,
  /** İnsan rakibe karşı düello */
  duelK: 32,
  /** Meydan okuma: ikili ELO, K = challengeK / (n − 1), toplam değişim ±challengeCap ile sınırlı */
  challengeK: 16,
  challengeCap: 40,
} as const;

export const TIERS = [
  { id: 'bronze', label: 'Bronz', min: 0 },
  { id: 'silver', label: 'Gümüş', min: 1100 },
  { id: 'gold', label: 'Altın', min: 1250 },
  { id: 'platinum', label: 'Platin', min: 1400 },
  { id: 'diamond', label: 'Elmas', min: 1600 },
] as const;

export type TierId = (typeof TIERS)[number]['id'];

export interface TierInfo {
  id: TierId;
  label: string;
  min: number;
  next_min: number | null;
}

export function tierFor(rating: number): TierInfo {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i += 1) if (rating >= TIERS[i].min) idx = i;
  const t = TIERS[idx];
  return { id: t.id, label: t.label, min: t.min, next_min: idx + 1 < TIERS.length ? TIERS[idx + 1].min : null };
}

export function tierIndex(id: string): number {
  return TIERS.findIndex((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Ödüller (XP / jeton)
// ---------------------------------------------------------------------------

export interface Reward {
  coins: number;
  xp: number;
}

export const REWARDS = {
  /** Biten solo / senaryo turu; pozitif getiri için % puan başına profitXpPerPct, en fazla profitXpMax ek XP */
  round: { xp: 15, coins: 10, profitXpPerPct: 10, profitXpMax: 20 },
  duel: {
    win: { xp: 40, coins: 30 },
    loss: { xp: 15, coins: 5 },
    draw: { xp: 25, coins: 15 },
    /** Antrenman botuna karşı: reyting değişmez, yalnızca XP (jeton yok) */
    botCoins: false,
  },
  challenge: {
    participation: { xp: 50, coins: 20 },
    /** 1., 2., 3. sıraya EK ödül */
    top3: [
      { xp: 50, coins: 100 },
      { xp: 30, coins: 60 },
      { xp: 20, coins: 30 },
    ] as Reward[],
  },
  firstTradeOfDay: { xp: 10, coins: 0 },
  leagueJoin: { xp: 20, coins: 0 },
} as const;

/** Günlük seri: her İstanbul gününde en az bir arena turu ya da ana portföy işlemi */
export const STREAK = {
  /** Seri bu günün katlarına ulaştığında bonus (7, 14, 21 …) */
  bonusEvery: 7,
  bonusCoins: 100,
  bonusExtraSpins: 1,
} as const;

// ---------------------------------------------------------------------------
// Günlük görevler
// ---------------------------------------------------------------------------

export const QUEST_KEYS = [
  'arena_profit_round',
  'arena_use_sl',
  'arena_3_instruments',
  'duel_play',
  'duel_win',
  'main_buy',
  'challenge_join',
  'idle_collect',
] as const;

export type QuestKey = (typeof QUEST_KEYS)[number];

export interface QuestDef {
  key: QuestKey;
  title: string;
  description: string;
  target: number;
  reward: Reward;
}

export const QUEST_POOL: QuestDef[] = [
  { key: 'arena_profit_round', title: 'Kârlı tur', description: 'Bir Arena turunu kârla bitir', target: 1, reward: { coins: 50, xp: 40 } },
  { key: 'arena_use_sl', title: 'Zarar kes', description: 'Zarar kes (stop-loss) ile bir işlem kapat', target: 1, reward: { coins: 40, xp: 30 } },
  { key: 'arena_3_instruments', title: 'Çeşitlendir', description: "Arena'da 3 farklı enstrümanda işlem yap", target: 3, reward: { coins: 60, xp: 40 } },
  { key: 'duel_play', title: 'Düellocu', description: 'Bir düello oyna', target: 1, reward: { coins: 40, xp: 30 } },
  { key: 'duel_win', title: 'Düello zaferi', description: 'Bir düello kazan', target: 1, reward: { coins: 80, xp: 60 } },
  { key: 'main_buy', title: 'Yatırımcı', description: 'Ana portföyünde bir alım yap', target: 1, reward: { coins: 30, xp: 20 } },
  { key: 'challenge_join', title: 'Meydan okuma', description: 'Bir meydan okumaya katıl', target: 1, reward: { coins: 50, xp: 40 } },
  { key: 'idle_collect', title: 'İmparator', description: "İmparatorluk'tan gelir topla", target: 1, reward: { coins: 30, xp: 20 } },
];

export const QUESTS_PER_DAY = 3;

export function questDef(key: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.key === key);
}

// ---------------------------------------------------------------------------
// Şans çarkı (ücretsiz)
// ---------------------------------------------------------------------------

export type WheelKind = 'coins' | 'xp' | 'spin' | 'cosmetic';

export interface WheelSegment {
  id: string;
  label: string;
  kind: WheelKind;
  amount?: number;
  item_id?: string;
  /** Tam sayı ağırlık; toplam 100 → ağırlık = yüzde olasılık */
  weight: number;
}

/** Sıra = çarktaki dilim sırası (segment_index) */
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { id: 'coins-20', label: '20 Jeton', kind: 'coins', amount: 20, weight: 28 },
  { id: 'xp-30', label: '30 XP', kind: 'xp', amount: 30, weight: 20 },
  { id: 'coins-50', label: '50 Jeton', kind: 'coins', amount: 50, weight: 20 },
  { id: 'xp-80', label: '80 XP', kind: 'xp', amount: 80, weight: 10 },
  { id: 'coins-100', label: '100 Jeton', kind: 'coins', amount: 100, weight: 10 },
  { id: 'spin-1', label: '+1 Çevirme', kind: 'spin', amount: 1, weight: 6 },
  { id: 'coins-250', label: '250 Jeton', kind: 'coins', amount: 250, weight: 3 },
  { id: 'frame-wheel', label: 'Çark Çerçevesi', kind: 'cosmetic', item_id: 'frame-wheel', weight: 3 },
];

export const WHEEL = {
  /** Kozmetik zaten sahipliyse verilecek jeton */
  duplicateCoins: 150,
  /** Ek çevirme hakkı üst sınırı (biriktirme sınırı) */
  maxExtraSpins: 10,
  disclaimer:
    'Şans çarkı tamamen ücretsizdir: her gün 1 ücretsiz çevirme hakkın olur, ek haklar yalnızca oyun içinde kazanılır. ' +
    'Gerçek para ile çevirme hakkı satın alınamaz; ödüller yalnızca oyun içi jeton, XP ve kozmetiklerdir ve gerçek paraya çevrilemez. ' +
    'Her dilimin olasılığı yanında gösterilmiştir.',
} as const;

// ---------------------------------------------------------------------------
// Mağaza / kozmetikler
// ---------------------------------------------------------------------------

export type ItemKind = 'avatar' | 'frame' | 'title';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type ItemUnlock =
  | { type: 'default' }
  | { type: 'coins'; value: number }
  | { type: 'tier'; value: TierId }
  | { type: 'wheel' };

export interface ShopItemDef {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  unlock: ItemUnlock;
}

export const DEFAULT_AVATAR = 'avatar-1';

export const SHOP_ITEMS: ShopItemDef[] = [
  // Avatarlar
  { id: 'avatar-1', kind: 'avatar', name: 'Çaylak Boğa', rarity: 'common', unlock: { type: 'default' } },
  { id: 'avatar-2', kind: 'avatar', name: 'Temkinli Ayı', rarity: 'common', unlock: { type: 'default' } },
  { id: 'avatar-3', kind: 'avatar', name: 'Kurnaz Tilki', rarity: 'common', unlock: { type: 'default' } },
  { id: 'avatar-4', kind: 'avatar', name: 'Bilge Baykuş', rarity: 'common', unlock: { type: 'coins', value: 100 } },
  { id: 'avatar-5', kind: 'avatar', name: 'Sabırlı Kaplumbağa', rarity: 'common', unlock: { type: 'coins', value: 120 } },
  { id: 'avatar-6', kind: 'avatar', name: 'Hızlı Çita', rarity: 'common', unlock: { type: 'coins', value: 150 } },
  { id: 'avatar-7', kind: 'avatar', name: 'Kartal Göz', rarity: 'rare', unlock: { type: 'coins', value: 250 } },
  { id: 'avatar-8', kind: 'avatar', name: 'Yalnız Kurt', rarity: 'rare', unlock: { type: 'coins', value: 280 } },
  { id: 'avatar-9', kind: 'avatar', name: 'Aslan Yürek', rarity: 'rare', unlock: { type: 'coins', value: 300 } },
  { id: 'avatar-10', kind: 'avatar', name: 'Ejderha', rarity: 'epic', unlock: { type: 'coins', value: 450 } },
  { id: 'avatar-11', kind: 'avatar', name: 'Anka Kuşu', rarity: 'epic', unlock: { type: 'coins', value: 500 } },
  { id: 'avatar-12', kind: 'avatar', name: 'Altın Boğa', rarity: 'legendary', unlock: { type: 'coins', value: 600 } },
  // Çerçeveler
  { id: 'frame-bronze', kind: 'frame', name: 'Bronz Çerçeve', rarity: 'common', unlock: { type: 'tier', value: 'bronze' } },
  { id: 'frame-silver', kind: 'frame', name: 'Gümüş Çerçeve', rarity: 'rare', unlock: { type: 'tier', value: 'silver' } },
  { id: 'frame-gold', kind: 'frame', name: 'Altın Çerçeve', rarity: 'epic', unlock: { type: 'tier', value: 'gold' } },
  { id: 'frame-neon', kind: 'frame', name: 'Neon Çerçeve', rarity: 'epic', unlock: { type: 'coins', value: 400 } },
  { id: 'frame-wheel', kind: 'frame', name: 'Çark Çerçevesi', rarity: 'legendary', unlock: { type: 'wheel' } },
  // Unvanlar
  { id: 'title-boga', kind: 'title', name: 'Boğa', rarity: 'common', unlock: { type: 'coins', value: 200 } },
  { id: 'title-sogukkanli', kind: 'title', name: 'Soğukkanlı', rarity: 'common', unlock: { type: 'coins', value: 250 } },
  { id: 'title-ayi-avcisi', kind: 'title', name: 'Ayı Avcısı', rarity: 'rare', unlock: { type: 'coins', value: 300 } },
  { id: 'title-trend-avcisi', kind: 'title', name: 'Trend Avcısı', rarity: 'rare', unlock: { type: 'coins', value: 350 } },
  { id: 'title-zarar-kesen', kind: 'title', name: 'Zarar Kesen Usta', rarity: 'epic', unlock: { type: 'coins', value: 400 } },
  { id: 'title-piyasa-kurdu', kind: 'title', name: 'Piyasa Kurdu', rarity: 'legendary', unlock: { type: 'coins', value: 500 } },
];

export function shopItem(id: string): ShopItemDef | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// Sorumlu oyun
// ---------------------------------------------------------------------------

export const RESPONSIBLE = {
  dailyRoundLimit: { min: 5, max: 50 },
  reminderMinutes: [15, 30, 60] as const,
  breakDurations: { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 } as const,
  /** Art arda bu kadar kayıpta istemci nazik bir mola önerisi gösterebilir */
  lossStreakHint: 3,
} as const;

/** Defter (ledger) sebepleri — varchar(32) */
export const LEDGER_REASONS = {
  round: 'arena_round',
  duelWin: 'duel_win',
  duelLoss: 'duel_loss',
  duelDraw: 'duel_draw',
  challenge: 'challenge',
  challengeTop: 'challenge_top3',
  firstTrade: 'first_trade',
  leagueJoin: 'league_join',
  streakBonus: 'streak_bonus',
  levelUp: 'level_up',
  quest: 'quest',
  wheel: 'wheel',
  shop: 'shop_purchase',
} as const;

/**
 * Sayıya Türkçe yönelme (-e/-a) eki: 7 → "7'ye", 3 → "3'e", 10 → "10'a", 6 → "6'ya".
 * Okunuştaki son sözcüğün son ünlüsü + ünlüyle bitiyorsa kaynaştırma "y".
 */
export function dativeSuffix(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const ones = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
  const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
  let word: string;
  if (v === 0) word = 'sıfır';
  else if (v % 10 !== 0) word = ones[v % 10];
  else if (v % 100 !== 0) word = tens[(v / 10) % 10];
  else if (v % 1000 !== 0) word = 'yüz';
  else if (v % 1_000_000 !== 0) word = 'bin';
  else word = 'milyon';
  const vowels = word.match(/[aeıioöuü]/g) ?? ['e'];
  const last = vowels[vowels.length - 1];
  const back = 'aıou'.includes(last);
  const endsWithVowel = /[aeıioöuü]$/.test(word);
  return `'${endsWithVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
}

/** Bildirim bağlantıları (sitede göreli yol) */
export const LINKS = {
  profile: '/profile',
  arena: '/arena',
  quests: '/arena',
} as const;

// ---------------------------------------------------------------------------
// Slot Makinesi — "Olasılık dersi" (migration 026)
//
// Eğitsel olasılık oyunu: yalnızca oyun içi jetonla oynanır (jeton satın alınamaz, paraya çevrilemez).
// Her makara BAĞIMSIZ olarak ağırlığa göre (crypto.randomInt) seçilir; ödeme tablosu ilk eşleşen kuraldır.
// Olasılıklar, RTP ve kasa avantajı bu tablodan TAM sayım (8³ sonuç) ile hesaplanır ve oyuncuya aynen gösterilir
// (bkz. services/game/slot.ts → slotMath()). Ağırlık/çarpan değiştirirseniz RTP testi yeni değeri doğrular;
// hedef RTP'yi (targetRtpPct) de güncelleyin.
// ---------------------------------------------------------------------------

export const SLOT_SYMBOL_IDS = ['ayi', 'dolar', 'petrol', 'boga', 'altin', 'bitcoin', 'roket', 'yildiz'] as const;
export type SlotSymbolId = (typeof SLOT_SYMBOL_IDS)[number];

export const SLOT_SYMBOL_LABELS: Record<SlotSymbolId, string> = {
  ayi: 'Ayı',
  dolar: 'Dolar',
  petrol: 'Petrol varili',
  boga: 'Boğa',
  altin: 'Altın külçe',
  bitcoin: 'Bitcoin',
  roket: 'Roket',
  yildiz: 'Yıldız',
};

/** Makara başına tam sayı ağırlıklar (3 makara; toplam 20 → her sonuç 1/8000'in katı). */
const SLOT_REEL: Record<SlotSymbolId, number> = { ayi: 5, dolar: 4, petrol: 3, boga: 3, altin: 2, bitcoin: 1, roket: 1, yildiz: 1 };
export const SLOT_REEL_WEIGHTS: Record<SlotSymbolId, number>[] = [SLOT_REEL, SLOT_REEL, SLOT_REEL];

export type SlotRule =
  | { id: string; kind: 'three'; symbol: SlotSymbolId; multiplier: number }
  | { id: string; kind: 'pair'; multiplier: number }
  | { id: string; kind: 'none'; multiplier: 0 };

/** Ödeme tablosu (kazanç = bahis × çarpan). Sıra önemlidir: ilk eşleşen kural uygulanır; son kural "kazanç yok". */
export const SLOT_PAYTABLE: SlotRule[] = [
  { id: 'three-yildiz', kind: 'three', symbol: 'yildiz', multiplier: 100 },
  { id: 'three-roket', kind: 'three', symbol: 'roket', multiplier: 50 },
  { id: 'three-bitcoin', kind: 'three', symbol: 'bitcoin', multiplier: 30 },
  { id: 'three-altin', kind: 'three', symbol: 'altin', multiplier: 12 },
  { id: 'three-boga', kind: 'three', symbol: 'boga', multiplier: 6 },
  { id: 'three-petrol', kind: 'three', symbol: 'petrol', multiplier: 5 },
  { id: 'three-dolar', kind: 'three', symbol: 'dolar', multiplier: 4 },
  { id: 'three-ayi', kind: 'three', symbol: 'ayi', multiplier: 3 },
  { id: 'pair', kind: 'pair', multiplier: 2 },
  { id: 'none', kind: 'none', multiplier: 0 },
];

export const SLOT = {
  /** İzin verilen bahisler (jeton) */
  bets: [5, 10, 25] as readonly number[],
  /** İstanbul günü başına en fazla çevirme */
  maxSpinsPerDay: 100,
  /** İstanbul günü başına en fazla NET kayıp (jeton); bir bahis bu sınırı aşacaksa reddedilir */
  dailyLossCap: 250,
  /** İki çevirme arasında en az süre (sunucuda zorlanır → 429 SLOT_COOLDOWN) */
  minIntervalMs: 1500,
  /** Oturumda her N çevirmede bir durum özeti (onaylanmadan sonraki çevirme 409 SLOT_REALITY_CHECK) */
  realityCheckEvery: 25,
  /** Bu süreden uzun ara verilirse yeni oturum başlar */
  sessionGapMs: 30 * 60 * 1000,
  /** Tasarım hedefi; gerçek değer ödeme tablosundan hesaplanır (test eşitliği doğrular) */
  targetRtpPct: 95,
  /** Net kazanç ≥ bahis × bu katsayı ise istemci konfeti gösterebilir */
  celebrateNetMultiple: 5,
  /** game_ledger sebepleri (bahis: negatif jeton, kazanç: pozitif jeton; ref = ('slot', request_id)) */
  ledger: { bet: 'slot_bet', win: 'slot_win' },
  /** app_settings anahtarı (yönetici aç/kapat) */
  settingKey: 'slot_enabled',
  disclaimer:
    'Slot Makinesi bir olasılık dersidir: yalnızca oyun içi jetonla oynanır; jeton gerçek parayla satın alınamaz ve gerçek paraya çevrilemez. ' +
    'Her makara bağımsız döner; her sonucun olasılığı, geri ödeme oranı (RTP) ve kasa avantajı tabloda tam olarak gösterilir. ' +
    'Uzun vadede kasa her zaman kazanır.',
} as const;
