// Emir formları için ortak sayı giriş yardımcıları.

import { COMMISSION_RATE } from '@/lib/constants';

/** Fiyat büyüklüğüne göre gösterilecek ondalık hane sayısı */
export function priceDigits(price: number) {
  const abs = Math.abs(price);
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  return 8;
}

/** Miktarı 8 ondalığa (DB hassasiyeti) aşağı yuvarla */
export function roundQty(q: number) {
  return Math.floor(q * 1e8) / 1e8;
}

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
