// Emir formları için ortak sayı giriş yardımcıları.

import { COMMISSION_RATE } from '@/lib/constants';
import type { AssetType } from '@/types';

/** Fiyat büyüklüğüne göre gösterilecek ondalık hane sayısı */
export function priceDigits(price: number) {
  const abs = Math.abs(price);
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 8;
}

/**
 * Miktarı 8 ondalığa (DB hassasiyeti) aşağı yuvarla. Backend'deki normalizeQuantity ile aynı:
 * küçük pay (1e-6 birim) kayan nokta hatasını yutar (0.29 × 1e8 = 28999999.999… → 0.29, 0.28999999 değil).
 */
export function roundQty(q: number) {
  return Math.floor(q * 1e8 + 1e-6) / 1e8;
}

/**
 * Varlık türüne göre miktar hassasiyeti (ondalık hane). Bugün sunucu TÜM varlıklarda 8 ondalığa kadar
 * kesirli miktar kabul eder (kesirli hisse dahil; bkz. backend validation MIN_QUANTITY = 1e-8 ve
 * normalizeQuantity). Hisseler ileride tam sayıya geçerse yalnızca burası değişir.
 */
export const QUANTITY_DECIMALS: Record<AssetType, number> = { stock: 8, crypto: 8, currency: 8, commodity: 8 };

/** Hassasiyete göre aşağı yuvarlar (0 ondalık → tam sayı). */
export function floorToDecimals(q: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.floor(q * f + 1e-6) / f;
}

/**
 * Pozisyonun bir kısmı (%25 / %50 / %100). %100 TAM OLARAK eldeki miktardır (yuvarlanmaz; satışta
 * "tümü" ile aynı — kalıntı bırakmaz). Diğerleri varlığın hassasiyetine aşağı yuvarlanır (asla fazla satmaz).
 */
export function partialQuantity(held: number, fraction: number, decimals = 8) {
  if (!(held > 0) || !(fraction > 0)) return 0;
  if (fraction >= 1) return held;
  return Math.min(held, floorToDecimals(held * fraction, decimals));
}

/** Pozisyon kapatma kısayolları */
export const CLOSE_FRACTIONS = [0.25, 0.5, 1] as const;
export type CloseFraction = (typeof CLOSE_FRACTIONS)[number];
export const fractionLabel = (f: number) => `%${Math.round(f * 100)}`;

/** Girişlerde Türkçe ondalık ayırıcı (virgül) kullanılır; ayrıştırma her ikisini de kabul eder. */
export function toInput(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 8, useGrouping: false }).replace('.', ',');
}

/** Fiyatı uygun hassasiyette yuvarlayıp giriş metnine çevirir. */
export function priceToInput(price: number) {
  return price > 0 ? toInput(Number(price.toFixed(priceDigits(price)))) : '';
}

export function parseDecimal(input: string) {
  const n = parseFloat(input.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export const sanitizeDecimal = (v: string) => v.replace(/[^0-9.,]/g, '');

const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;

/**
 * Limit alışta bakiyeden ayrılacak tutar — backend'deki computeBuyCost ile aynı formül
 * (brüt tutar ve komisyon kuruşa yukarı yuvarlanır).
 */
export function reserveForBuy(quantity: number, price: number) {
  const total = ceil2(quantity * price);
  const commission = ceil2(total * COMMISSION_RATE);
  return Math.round((total + commission) * 100) / 100;
}

/**
 * Açılışta alış (piyasa kapalıyken) için referans fiyata eklenen tampon — backend MOO_BUY_BUFFER ile aynı.
 * Açılış fiyatı tamponu da aşarsa ayrılan tutarın karşıladığı kadar alınır, artan iade edilir.
 */
export const MOO_BUY_BUFFER = 0.05;

/** Açılışta alışta bakiyeden ayrılacak tutar (backend: computeBuyCost(miktar, referans × 1.05)). */
export function reserveForMooBuy(quantity: number, referencePrice: number) {
  return reserveForBuy(quantity, referencePrice * (1 + MOO_BUY_BUFFER));
}

/** Takip eden stop sınırları — backend TRAIL_PERCENT_MIN/MAX ile aynı */
export const TRAIL_PERCENT_MIN = 0.1;
export const TRAIL_PERCENT_MAX = 50;

/** Takip eden stopun tetikleme fiyatı: zirve × (1 − %/100) ya da zirve − TL (backend trailingTrigger ile aynı). */
export function trailingTrigger(highWater: number, trail: { percent?: number | null; amount?: number | null }) {
  const raw = trail.percent != null ? highWater * (1 - trail.percent / 100) : highWater - (trail.amount ?? 0);
  return Math.floor(raw * 1e8 + 1e-6) / 1e8;
}

/** Geçerlilik süresi seçenekleri (gün) */
export const EXPIRY_OPTIONS = [
  { value: '1', label: '1 gün' },
  { value: '7', label: '7 gün' },
  { value: '30', label: '30 gün' },
] as const;
export type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]['value'];

/** Gelecekteki bir tarihe kalan süre: "3 gün kaldı", "5 sa kaldı" */
export function formatTimeLeft(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'süresi doldu';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} dk kaldı`;
  if (hours < 24) return `${Math.round(hours)} sa kaldı`;
  return `${Math.round(hours / 24)} gün kaldı`;
}
