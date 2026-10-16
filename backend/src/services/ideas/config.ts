/**
 * Ortak Akıl — Öneri Havuzu: TEK düzenlenebilir ayar dosyası (sınırlar, etiketler, süreler).
 *
 * Bu dosya (ve math.ts) veritabanına BAĞLANMAZ: birim testleri de kullanır.
 */

export const IDEA_ASSET_TYPES = ['stock', 'crypto', 'currency', 'commodity'] as const;
export type IdeaAssetType = (typeof IDEA_ASSET_TYPES)[number];

/** al: yükseliş beklentisi · sat: düşüş beklentisi · izle: yön belirtmeden izleme */
export const IDEA_STANCES = ['al', 'sat', 'izle'] as const;
export type IdeaStance = (typeof IDEA_STANCES)[number];

export const IDEA_HORIZONS = ['1w', '1m', '3m', '6m', '1y'] as const;
export type IdeaHorizon = (typeof IDEA_HORIZONS)[number];

/** Vade → gün (önerilen değerlendirme tarihi için) */
export const HORIZON_DAYS: Record<IdeaHorizon, number> = { '1w': 7, '1m': 30, '3m': 91, '6m': 182, '1y': 365 };
export const HORIZON_LABELS: Record<IdeaHorizon, string> = { '1w': '1 hafta', '1m': '1 ay', '3m': '3 ay', '6m': '6 ay', '1y': '1 yıl' };

export const IDEA_STATUSES = ['acik', 'kapandi'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_OUTCOMES = ['beklendigi_gibi', 'kismen', 'beklenmedik'] as const;
export type IdeaOutcome = (typeof IDEA_OUTCOMES)[number];

export const IDEA_SCOPES = ['public', 'league'] as const;
export type IdeaScope = (typeof IDEA_SCOPES)[number];

export const RESPONSE_STANCES = ['katiliyorum', 'katilmiyorum'] as const;
export type ResponseStance = (typeof RESPONSE_STANCES)[number];

export const REPORT_TARGETS = ['idea', 'response', 'comment', 'update'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['spam', 'yaniltici', 'hakaret', 'tavsiye', 'kisisel', 'diger'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['acik', 'islendi', 'reddedildi'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const UPDATE_KINDS = ['note', 'target_hit', 'invalidation_hit', 'review_due', 'closed'] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number];

export type QuoteCurrency = 'USD' | 'TRY';

export const STANCE_LABELS: Record<IdeaStance, string> = { al: 'Al', sat: 'Sat', izle: 'İzle' };
export const OUTCOME_LABELS: Record<IdeaOutcome, string> = { beklendigi_gibi: 'Beklendiği gibi', kismen: 'Kısmen', beklenmedik: 'Beklenmedik' };

/** Önerilerin kayıt altına alınması tavsiye değildir (her yüzeyde gösterilir) */
export const IDEA_DISCLAIMER = 'Önerilerin kayıt altına alınması, tek başına yatırım tavsiyesi veya işlem onayı anlamına gelmez.';

// ---------------------------------------------------------------------------
// Metin uzunlukları
// ---------------------------------------------------------------------------

export const IDEA_TEXT = {
  rationale: { min: 80, max: 2000 },
  scenario: { min: 20, max: 2000 },
  scenarioCase: { max: 600 },
  risks: { min: 20, max: 2000 },
  evaluation: { min: 40, max: 2000 },
  lessons: { max: 1000 },
  update: { min: 5, max: 1000 },
  responseReason: { min: 10, max: 280 },
  comment: { min: 1, max: 1000 },
  reportNote: { max: 500 },
  hiddenReason: { max: 200 },
  tag: { min: 2, max: 24 },
  tagsMax: 5,
} as const;

// ---------------------------------------------------------------------------
// Sorumlu kullanım: sınırlar (İstanbul takvim günü)
// ---------------------------------------------------------------------------

export const IDEA_LIMITS = {
  ideasPerDay: 5,
  commentsPerDay: 30,
  /** Aynı kullanıcının iki yorumu arasında en az */
  commentCooldownMs: 15 * 1000,
  updatesPerDay: 20,
  reportsPerDay: 20,
  /** Karşılaştırmada en fazla öneri */
  compareMax: 3,
  /** Liste sayfası üst sınırı */
  pageMax: 50,
  /** Detaydaki zaman çizelgesi / yanıt listesi üst sınırı */
  updatesShown: 200,
  responsesShown: 200,
} as const;

/** Seviye doğrulaması: referans fiyatın 1/100'ü ile 100 katı arası */
export const LEVEL_RATIO = { min: 0.01, max: 100 } as const;
/** Değerlendirme tarihi: en erken yarın, en geç yayından 2 yıl sonra */
export const REVIEW_DATE_MAX_DAYS = 730;

// ---------------------------------------------------------------------------
// Fiyatlar (yalnızca saklanmış veriler; dış API yok)
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const IDEA_PRICES = {
  /** Yayında referans fiyat olarak kabul edilen en eski fiyat (gerçek saat) */
  captureMaxAgeMs: { stock: HOUR_MS, crypto: HOUR_MS, currency: DAY_MS, commodity: DAY_MS } as Record<IdeaAssetType, number>,
  /** Canlı performans gösteriminde kabul edilen en eski fiyat (fiyat zamanı ayrıca gösterilir) */
  displayMaxAgeMs: 7 * DAY_MS,
  /** Canlı fiyat önbelleği */
  cacheMs: 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Bildirimler
// ---------------------------------------------------------------------------

/** Yanıt / yorum bildirimi: öneri başına en fazla bu sıklıkta (aradakiler toplanıp sonraki bildirime eklenir) */
export const ACTIVITY_COOLDOWN_MS = HOUR_MS;

/** Bildirim türleri (frontend/src/components/notifications/model.ts eşler) */
export const IDEA_NOTIFICATION_TYPES = {
  activity: 'ideas.activity',
  reviewDue: 'ideas.review_due',
  levelCrossed: 'ideas.level_crossed',
  closed: 'ideas.closed',
} as const;

/** Kategori: kullanıcı "Rekabet" bildirimlerini kapatırsa bunlar da gelmez (sakin varsayılan) */
export const IDEA_NOTIFICATION_CATEGORY = 'competition' as const;

/** Frontend sayfaları */
export const IDEAS_PATH = '/ortak-akil';
export const ideaLink = (id: string) => `${IDEAS_PATH}/${id}`;
