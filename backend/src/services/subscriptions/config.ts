/**
 * Abonelik altyapısı — sabitler (migration 025: subscription_plans, user_subscriptions).
 *
 * Ödeme sağlayıcısı YOKTUR: abonelik yalnızca (a) kullanıcı başına bir kez 14 günlük deneme, (b) yönetici tanımı ile
 * açılır. Ödeme eklendiğinde `source = 'payment'` satırları (external_ref = sağlayıcı abonelik kimliği) aynı tabloya
 * yazılacak; yetki çözümlemesi (entitlements.ts) kaynaktan bağımsızdır. Bkz. docs/YAYIN_KONTROL_LISTESI.md (hukuk).
 */

export const PLAN_IDS = ['free', 'premium'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'canceled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_SOURCES = ['trial', 'admin', 'payment'] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

/** Yetki (entitlement) adları — subscription_plans.features[].key ile aynı */
export const FEATURES = {
  /** Global Portföy Lab: senaryo laboratuvarı (analiz, kaydetme) */
  GLOBAL_LAB_PRO: 'global_lab_pro',
  /** Global Portföy Lab: araştırma notlarının tam metni */
  GLOBAL_LAB_NOTES: 'global_lab_notes',
  /** Global Portföy Lab: kayıtlı senaryoları karşılaştırma */
  GLOBAL_LAB_COMPARE: 'global_lab_compare',
} as const;

/** Ücretsiz deneme süresi (gün) — kullanıcı başına bir kez */
export const TRIAL_DAYS = 14;
/** Bitişten kaç gün önce "süren bitiyor" bildirimi gönderilir */
export const REMINDER_DAYS_BEFORE_END = 3;
/** Yönetici tanımında en uzun süre (gün); null = süresiz */
export const MAX_GRANT_DAYS = 3650;

/** Ödeme dikişi: sağlayıcı bağlanınca available = true ve checkout uçları eklenir */
export const PAYMENT = {
  available: false,
  message: 'Ödeme altyapısı yakında. Şimdilik Premium yalnızca ücretsiz deneme veya ekip tanımıyla açılabilir.',
} as const;

export const UPGRADE_PATH = '/abonelik';
