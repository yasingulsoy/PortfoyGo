/**
 * Global Portföy Lab — sabitler ve etiketler (migration 025).
 *
 * Varsayımlar USD bazındadır (yıllık). TL bazlı analizde her varlığa USD/TRY varsayımı ('fx|USDTRY') eklenir.
 * Tüm sayılar ÖRNEKTİR: yönetim panelinden kaynak ve tarihle güncellenir. Eğitim amaçlıdır; yatırım tavsiyesi değildir.
 */

export const VEHICLES = ['ETF', 'endeks', 'fon', 'hisse', 'tahvil', 'emtia', 'kripto'] as const;
export type Vehicle = (typeof VEHICLES)[number];

export const ASSET_CLASSES = ['hisse', 'tahvil', 'emtia', 'gayrimenkul', 'kripto', 'nakit'] as const;
export type GlobalAssetClass = (typeof ASSET_CLASSES)[number];

export const REGIONS = ['Kuzey Amerika', 'Avrupa', 'Asya-Pasifik', 'Gelişmekte olan', 'Türkiye', 'Küresel'] as const;
export type Region = (typeof REGIONS)[number];

export const BASE_CURRENCIES = ['USD', 'TRY'] as const;
export type BaseCurrency = (typeof BASE_CURRENCIES)[number];

export const VEHICLE_LABELS: Record<Vehicle, string> = {
  ETF: 'ETF',
  endeks: 'Endeks',
  fon: 'Fon / nakit',
  hisse: 'Hisse senedi',
  tahvil: 'Tahvil',
  emtia: 'Emtia',
  kripto: 'Kripto varlık',
};

export const ASSET_CLASS_LABELS: Record<GlobalAssetClass, string> = {
  hisse: 'Hisse',
  tahvil: 'Tahvil',
  emtia: 'Emtia',
  gayrimenkul: 'Gayrimenkul',
  kripto: 'Kripto',
  nakit: 'Nakit',
};

/** SRI benzeri 1–7 risk ölçeği */
export const RISK_LEVEL_LABELS: Record<number, string> = {
  1: 'Çok düşük',
  2: 'Düşük',
  3: 'Düşük-orta',
  4: 'Orta',
  5: 'Orta-yüksek',
  6: 'Yüksek',
  7: 'Çok yüksek',
};

export const FX_KEY = 'fx|USDTRY';
export const cellKey = (assetClass: string, region: string) => `${assetClass}|${region}`;

/**
 * Hücre (sınıf × bölge) modunda "para birimi" dağılımı için fiyatlama para birimi. Emtia ve kripto küresel olarak
 * USD ile fiyatlanır; çok ülkeli bölgeler sepet olarak gösterilir. Araç modunda aracın kendi para birimi kullanılır.
 */
export function cellCurrency(assetClass: string, region: string): string {
  if (assetClass === 'emtia' || assetClass === 'kripto') return 'USD';
  switch (region) {
    case 'Kuzey Amerika':
      return 'USD';
    case 'Avrupa':
      return 'EUR';
    case 'Türkiye':
      return 'TRY';
    case 'Asya-Pasifik':
      return 'Asya sepeti';
    case 'Gelişmekte olan':
      return 'GOP sepeti';
    default:
      return 'Küresel sepet';
  }
}

/**
 * Yerel ağırlık (home bias) için ÖRNEK referans: Türkiye'nin küresel hisse piyasa değerindeki yaklaşık payı (%).
 * Yaklaşıktır; güncel endeks ağırlığıyla değiştirilmelidir.
 */
export const TR_GLOBAL_MARKET_SHARE_PCT = 0.2;

export const LIMITS = {
  /** Sınıflandır sekmesinde yan yana karşılaştırma */
  compareMax: 4,
  /** Senaryodaki en fazla satır */
  scenarioRowsMax: 20,
  /** Kullanıcı başına kayıtlı senaryo */
  savedMax: 20,
  /** Kayıtlı senaryo karşılaştırma */
  scenarioCompareMax: 3,
  /** Araştırma listesi */
  researchListMax: 50,
  horizonMinYears: 1,
  horizonMaxYears: 30,
  amountMin: 1_000,
  amountMax: 100_000_000,
  /** CSV içe aktarma (satır) */
  importMaxRows: 2_000,
} as const;

/** Monte Carlo: yol sayısı ve sabit tohum (aynı girdi → aynı sonuç) */
export const MC_PATHS = 2_000;
export const MC_SEED = 20_261_016;

export const DISCLAIMER = 'Eğitim amaçlı analiz · varsayımlar örnektir · yatırım tavsiyesi değildir';
export const ASSUMPTIONS_NOTE = 'Örnek uzun vadeli varsayım — kaynak ve tarih belirtin.';
export const STRESS_NOTE = 'Stres şokları yaklaşıktır ve geçmişin tekrarlanacağı anlamına gelmez.';

/** Ücretsiz kullanıcıya gösterilen salt okunur örnek senaryo */
export const EXAMPLE_SCENARIO = {
  name: 'Örnek: Küresel dengeli dağılım',
  mode: 'cells' as const,
  base_currency: 'TRY' as BaseCurrency,
  horizon_years: 10,
  amount: 100_000,
  allocations: [
    { key: 'hisse|Küresel', weight: 40 },
    { key: 'hisse|Türkiye', weight: 10 },
    { key: 'tahvil|Küresel', weight: 25 },
    { key: 'emtia|Küresel', weight: 10 },
    { key: 'gayrimenkul|Küresel', weight: 5 },
    { key: 'nakit|Türkiye', weight: 10 },
  ],
};
