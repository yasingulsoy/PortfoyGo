/**
 * Yatırım İmparatorluğu (idle / tycoon) — TEK düzenlenebilir denge dosyası.
 *
 * Binalar saniyede "İmparatorluk Lirası" (yumuşak para birimi, gerçek para DEĞİL) üretir.
 * Piyasaya bağlı binaların geliri, gerçek piyasa hareketiyle (price_history günlük kovaları)
 * günlük olarak çarpılır; bkz. market.ts. Tüm hesaplar sunucudadır (math.ts, saf fonksiyonlar).
 *
 * Sayılar API'de JS number (double) olarak gönderilir: oyun için yeterli hassasiyet (~15 hane);
 * veritabanında NUMERIC(40,4) olarak saklanır (bkz. migrations/016_idle.sql).
 */

import type { AssetType } from '../../types';

// ---------------------------------------------------------------------------
// Binalar
// ---------------------------------------------------------------------------

export const BUILDING_IDS = ['kumbara', 'doviz', 'altin', 'hisse', 'kripto', 'holding'] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

/**
 * Piyasa bağı: tek varlık (sembol listesi = yedek sırası), eşit ağırlıklı sepet veya tüm bağların ortalaması.
 * k: günlük değişime duyarlılık (çarpan = sınırla(1 + k × değişim, 0,6, 1,8)); subject: cümledeki özne.
 */
export type MarketLink =
  | { kind: 'asset'; asset_type: AssetType; symbols: string[]; label: string; subject: string; k: number }
  | { kind: 'basket'; asset_type: 'stock'; label: string; subject: string; k: number }
  | { kind: 'composite'; label: string; subject: string; k: number };

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  base_cost: number;
  /** Bina başına temel gelir (İL / sn) */
  base_income: number;
  market: MarketLink | null;
  /** İstemcideki görsel anahtarı */
  art_key: string;
}

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'kumbara',
    name: 'Kumbara',
    description: 'Mevduat gibi: küçük ama hiç durmayan, piyasadan bağımsız birikim.',
    base_cost: 15,
    base_income: 0.5,
    market: null,
    art_key: 'kumbara',
  },
  {
    id: 'doviz',
    name: 'Döviz Bürosu',
    description: 'Dolar/TL kuru yükseldiği gün daha çok kazanır, düştüğü gün daha az.',
    base_cost: 120,
    base_income: 4,
    market: { kind: 'asset', asset_type: 'currency', symbols: ['USD'], label: 'Dolar/TL', subject: 'dolar', k: 8 },
    art_key: 'doviz',
  },
  {
    id: 'altin',
    name: 'Altın Madeni',
    description: 'Altın fiyatına bağlı; çoğu zaman güvenli liman, bazen sert dalgalanır.',
    base_cost: 1_400,
    base_income: 35,
    market: { kind: 'asset', asset_type: 'commodity', symbols: ['GOLD', 'GAU'], label: 'Altın', subject: 'altın', k: 6 },
    art_key: 'altin',
  },
  {
    id: 'hisse',
    name: 'Hisse Fabrikası',
    description: 'Eşit ağırlıklı bir hisse sepetinin günlük hareketiyle çalışır.',
    base_cost: 18_000,
    base_income: 380,
    market: { kind: 'basket', asset_type: 'stock', label: 'Hisse sepeti (eşit ağırlık)', subject: 'hisse sepeti', k: 5 },
    art_key: 'hisse',
  },
  {
    id: 'kripto',
    name: 'Kripto Çiftliği',
    description: 'Bitcoin’e bağlı: yüksek getiri potansiyeli, yüksek oynaklık.',
    base_cost: 240_000,
    base_income: 4_600,
    market: { kind: 'asset', asset_type: 'crypto', symbols: ['BTC'], label: 'Bitcoin', subject: 'Bitcoin', k: 3 },
    art_key: 'kripto',
  },
  {
    id: 'holding',
    name: 'Holding Kulesi',
    description: 'Tüm piyasaların ortalamasıyla çalışır: çeşitlendirme dalgalanmayı yumuşatır.',
    base_cost: 3_500_000,
    base_income: 60_000,
    market: { kind: 'composite', label: 'Tüm piyasalar (ortalama)', subject: 'piyasalar ortalamada', k: 4 },
    art_key: 'holding',
  },
];

export const BUILDING_BY_ID: Record<BuildingId, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<
  BuildingId,
  BuildingDef
>;

/** Her sahip olunan bina bir sonrakinin fiyatını ×1,15 yapar */
export const COST_GROWTH = 1.15;
/** Bu adetlere ulaşınca binanın geliri ×2 (kümülatif) */
export const OWNED_MILESTONES = [25, 50, 100, 200] as const;
export const OWNED_MILESTONE_FACTOR = 2;
/** Tek seferde (ör. "max") alınabilecek en fazla bina */
export const MAX_BUY_PER_REQUEST = 1_000;
/** Bina, toplam kazanç temel fiyatının bu oranına ulaşınca (veya sahip olunca) görünür */
export const UNLOCK_FRACTION = 0.25;

// ---------------------------------------------------------------------------
// Yükseltmeler
// ---------------------------------------------------------------------------

/**
 * Bina başına 3 yükseltme (her biri o binanın geliri ×2). Fiyat = temel fiyat × 50 × costFactor
 * (yani temel fiyatın 500×, 5.000×, 50.000×'i). Bir önceki kademe + yeterli bina adedi gerekir.
 */
export const BUILDING_UPGRADE_TIERS = [
  { tier: 1, cost_factor: 10, requires_owned: 10 },
  { tier: 2, cost_factor: 100, requires_owned: 25 },
  { tier: 3, cost_factor: 1_000, requires_owned: 50 },
] as const;
export const BUILDING_UPGRADE_BASE_MULTIPLE = 50;
export const BUILDING_UPGRADE_FACTOR = 2;

/** Bina yükseltmelerinin adları (kademe sırasıyla) */
export const BUILDING_UPGRADE_NAMES: Record<BuildingId, [string, string, string]> = {
  kumbara: ['Vadeli Hesap', 'Faizin Faizi', 'Bileşik Getiri Kasası'],
  doviz: ['Kur Takip Ekranı', 'Çapraz Kur Masası', 'Hazine Yönetimi'],
  altin: ['Gram Altın Tezgâhı', 'Külçe Kasası', 'Rafineri'],
  hisse: ['Temettü Politikası', 'Endeks Fonu', 'Halka Açık Dev'],
  kripto: ['Soğuk Cüzdan', 'Madencilik Havuzu', 'Doğrulayıcı Düğüm'],
  holding: ['Yönetim Kurulu', 'Varlık Dağılımı Komitesi', 'Küresel Portföy'],
};

export const GLOBAL_UPGRADE_IDS = ['bilesik_faiz', 'cesitlendirme', 'gece_vardiyasi'] as const;
export type GlobalUpgradeId = (typeof GLOBAL_UPGRADE_IDS)[number];

export interface GlobalUpgradeDef {
  id: GlobalUpgradeId;
  name: string;
  description: string;
  cost: number;
  /** Görünür/satın alınabilir olması için gereken toplam kazanç */
  requires_total_earned?: number;
  /** Gereken en az farklı bina türü */
  requires_types?: number;
  requirement_text: string;
}

export const GLOBAL_UPGRADES: readonly GlobalUpgradeDef[] = [
  {
    id: 'bilesik_faiz',
    name: 'Bileşik Faiz Kitabı',
    description: 'Tüm gelir +%10. Kazancın kazanç doğurur: bileşik büyümenin sırrı zamandır.',
    cost: 2_500,
    requires_total_earned: 500,
    requirement_text: 'Toplam 500 İL kazan',
  },
  {
    id: 'cesitlendirme',
    name: 'Çeşitlendirme Ustası',
    description: 'En az 4 farklı bina türüne sahipken tüm gelir +%25. Tek sepete tüm yumurtalar konmaz.',
    cost: 40_000,
    requires_types: 4,
    requirement_text: '4 farklı bina türüne sahip ol',
  },
  {
    id: 'gece_vardiyasi',
    name: 'Gece Vardiyası',
    description: 'Çevrimdışı kazanç sınırı 8 saatten 12 saate çıkar.',
    cost: 150_000,
    requires_total_earned: 100_000,
    requirement_text: 'Toplam 100.000 İL kazan',
  },
];

export const GLOBAL_UPGRADE_BY_ID: Record<GlobalUpgradeId, GlobalUpgradeDef> = Object.fromEntries(
  GLOBAL_UPGRADES.map((u) => [u.id, u])
) as Record<GlobalUpgradeId, GlobalUpgradeDef>;

export const COMPOUND_BOOK_BONUS = 0.1;
export const DIVERSIFICATION_BONUS = 0.25;
export const DIVERSIFICATION_MIN_TYPES = 4;

// ---------------------------------------------------------------------------
// Çevrimdışı kazanç
// ---------------------------------------------------------------------------

/** Son işlemden bu yana ≤ 2 dk geçtiyse "çevrimiçi" sayılır: sınırsız tahakkuk */
export const ONLINE_WINDOW_S = 120;
export const OFFLINE_CAP_S = 8 * 3600;
export const OFFLINE_CAP_EXTENDED_S = 12 * 3600;
/** idle_collect günlük görevi: en az bu kadar çevrimdışı süre toplanınca ilerler */
export const QUEST_MIN_OFFLINE_S = 60;

// ---------------------------------------------------------------------------
// Halka Arz (prestij)
// ---------------------------------------------------------------------------

export const PRESTIGE_THRESHOLD = 1e7;
/** Toplam pay = floor(sqrt(toplam kazanç / PRESTIGE_UNIT)); halka arzda aradaki fark verilir */
export const PRESTIGE_UNIT = 1e6;
/** Pay başına kalıcı gelir bonusu (+%2) */
export const PRESTIGE_SHARE_BONUS = 0.02;

// ---------------------------------------------------------------------------
// Dokunma (tap)
// ---------------------------------------------------------------------------

export const TAP = {
  /** Dokunuş değeri = max(min, fraction × gelir/sn) */
  fraction: 0.01,
  min: 1,
  /** İstemcinin tek istekte gönderebileceği toplu dokunuş */
  maxPerRequest: 20,
  /** Kullanıcı başına: saniyede 10 (anlık birikim en fazla burst), dakikada 1500 */
  perSecond: 10,
  burst: 20,
  perMinute: 1_500,
} as const;

// ---------------------------------------------------------------------------
// Ekonomi bağlantısı: toplam kazanç kilometre taşları → oyun jetonu / XP (GameService.award)
// ---------------------------------------------------------------------------

export interface EarnMilestone {
  at: number;
  reward: { coins: number; xp: number };
}

export const EARN_MILESTONES: readonly EarnMilestone[] = [
  { at: 1e3, reward: { coins: 10, xp: 15 } },
  { at: 1e5, reward: { coins: 25, xp: 30 } },
  { at: 1e7, reward: { coins: 50, xp: 60 } },
  { at: 1e9, reward: { coins: 100, xp: 120 } },
  { at: 1e11, reward: { coins: 200, xp: 250 } },
];

// ---------------------------------------------------------------------------
// Piyasa etkisi
// ---------------------------------------------------------------------------

export const MARKET_MULT_MIN = 0.6;
export const MARKET_MULT_MAX = 1.8;
/** En son gün kovası bundan eskiyse veri "eski" sayılır (çarpan 1) */
export const MARKET_STALE_DAYS = 4;
/** Piyasa çarpanları önbelleği (gün kovaları 15 dk'da bir güncellenir) */
export const MARKET_CACHE_MS = 5 * 60 * 1000;

/** NUMERIC(40,4) üst sınırının altında güvenli tavan */
export const MAX_AMOUNT = 1e35;
