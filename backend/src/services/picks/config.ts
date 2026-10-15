/**
 * Haftalık Seçim ("Kitlelerin Bilgeliği") — TEK düzenlenebilir ayar dosyası.
 *
 * Bu dosya (ve timeline.ts / scoring.ts) veritabanına BAĞLANMAZ: yerel seed betiği ve birim testleri de
 * kullanır (config/database içe aktarılmamalı → backend/.env okunmaz).
 *
 * Zaman çizelgesi (Europe/Istanbul; Türkiye 2016'dan beri sabit UTC+3, yaz saati yok):
 *   week_id   = yarışma Pazartesisinin ISO haftası, ör. '2026-W43'
 *   opens_at  = Pazartesiden önceki Cumartesi 00:00   → seçim penceresi ('submit')
 *   reveal_at = Pazar 15:00                          → seçimler açıklanır ('revealed'), tartışma açılır
 *   starts_at = Pazartesi 00:00                      → giriş fiyatı, yarışma başlar ('live')
 *   ends_at   = sonraki Cumartesi 00:00              → çıkış fiyatı ('settling' → 'finished')
 *               (= sonraki haftanın opens_at)
 */

export const PICKS_TZ = 'Europe/Istanbul';
/** Türkiye sabit UTC+3 */
export const PICKS_TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Pazartesi 00:00'a (starts_at) göre göreli zamanlar */
export const TIMELINE = {
  /** Cumartesi 00:00 = Pazartesi − 2 gün */
  opensBeforeStartMs: 2 * DAY_MS,
  /** Pazar 15:00 = Pazartesi − 9 saat */
  revealBeforeStartMs: 9 * HOUR_MS,
  /** Pazartesi 00:00 → Cumartesi 00:00 */
  durationMs: 5 * DAY_MS,
} as const;

export const PICK_PHASES = ['upcoming', 'submit', 'revealed', 'live', 'settling', 'finished'] as const;
export type PickPhase = (typeof PICK_PHASES)[number];

export const PICK_ASSET_TYPES = ['stock', 'crypto', 'currency', 'commodity'] as const;
export type PickAssetType = (typeof PICK_ASSET_TYPES)[number];

export const PICK_DIRECTIONS = ['up', 'down'] as const;
export type PickDirection = (typeof PICK_DIRECTIONS)[number];

export type QuoteCurrency = 'USD' | 'TRY';

// ---------------------------------------------------------------------------
// Fiyatlar
// ---------------------------------------------------------------------------

export const PRICES = {
  /**
   * Güncel fiyatın kabul edilen en eski yaşı (gerçek saat; veritabanının CURRENT_TIMESTAMP'ine göre).
   * hisse/kripto: market_data_cache, döviz: currency_rates, emtia: price_history (fiyat geçmişi işi 15 dk'da bir yazar)
   */
  maxAgeMs: { stock: HOUR_MS, crypto: HOUR_MS, currency: DAY_MS, commodity: DAY_MS } as Record<PickAssetType, number>,
  /** Canlı getiri ve varlık listesi için fiyat önbelleği */
  cacheMs: 60 * 1000,
  /**
   * Giriş/çıkış anından (starts_at / ends_at) en fazla bu kadar sonra çalışan iş güncel fiyatı kullanır;
   * daha geç kalırsa fiyat geçmişindeki (price_history) o ana kadar kapanmış en son kova kullanılır.
   */
  liveCaptureWindowMs: 10 * MINUTE_MS,
  /** Fiyat geçmişinde hedef anın en fazla bu kadar öncesine bakılır; yoksa seçim 'void' olur */
  historyLookbackMs: 6 * HOUR_MS,
} as const;

/** Emtia görünen adları (fiyat geçmişinde ad tutulmaz) */
export const COMMODITY_NAMES: Record<string, string> = {
  GOLD: 'Altın (ons)',
  GAU: 'Gram Altın',
  GOLDTRY: 'Altın (TL)',
  SILVER: 'Gümüş',
  SILVER_FUT: 'Gümüş (vadeli)',
  COPPER: 'Bakır',
  PLATINUM: 'Platin',
  PALLADIUM: 'Paladyum',
  BRENT_OIL: 'Brent Petrol',
  CRUDEOIL: 'Ham Petrol (WTI)',
  NATURAL_GAS: 'Doğal Gaz',
  WHEAT: 'Buğday',
  CORN: 'Mısır',
  COTTON2: 'Pamuk',
  SUGAR: 'Şeker',
  SOYBEAN: 'Soya',
  COFFEE: 'Kahve',
  COCOA: 'Kakao',
  ALUMINUM: 'Alüminyum',
  HEATING_OIL: 'Isınma Yakıtı',
  GASOLINE: 'Benzin',
};

// ---------------------------------------------------------------------------
// Ödüller (kapanışta GameService.award; idempotent ref ('weekly_pick', week_id))
// ---------------------------------------------------------------------------

export const PICK_REWARDS = {
  /** Geçerli (void olmayan) her seçim */
  participationXp: 15,
  /** 1., 2., 3. sıraya EK ödül */
  top: [
    { rank: 1, coins: 150, xp: 120 },
    { rank: 2, coins: 100, xp: 90 },
    { rank: 3, coins: 60, xp: 60 },
  ],
} as const;

/** game_ledger.reason (≤ 32) / ref_type (≤ 24) */
export const PICK_LEDGER = {
  participation: 'weekly_pick',
  top: 'weekly_pick_top',
  refType: 'weekly_pick',
} as const;

// ---------------------------------------------------------------------------
// Metin ve sınırlar
// ---------------------------------------------------------------------------

export const PICK_LIMITS = {
  noteMax: 280,
  commentMax: 500,
  /** Aynı kullanıcının iki yorumu arasında en az */
  commentCooldownMs: 15 * 1000,
  /** İstanbul takvim günü başına en fazla yorum */
  commentsPerDay: 40,
  /** Kitle özetinde gösterilen en çok seçilen varlık sayısı */
  topAssets: 10,
  /** Varlık arama sonucu üst sınırı */
  assetsMax: 50,
} as const;

/** Bildirim bağlantısı (frontend sayfası) */
export const PICKS_LINK = '/oyun/haftalik-secim';
