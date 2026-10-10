// Piyasa açık/kapalı durumu. Saf fonksiyonlar: yalnızca verilen ana (Date) bakar, ağ/saat dilimi
// ayarlarına bağlı değildir. Türkiye 2016'dan beri yaz saati uygulamaz; sabit UTC+3 kullanılır.

import type { AssetType } from '@/types';

/** Türkiye saati (TSİ) = UTC+3, yaz saati yok. */
export const TR_OFFSET_MINUTES = 3 * 60;

/** ABD hisse seansı, Türkiye saatiyle (dakika cinsinden, gün başından). Bitiş hariçtir. */
export const US_SESSION_TR = { open: 16 * 60 + 30, close: 23 * 60 } as const;

export interface MarketStatus {
  open: boolean;
  /** "Piyasa açık" / "Piyasa kapalı" */
  label: string;
  /** Kısa açıklama: "7/24 işlem görür", "NYSE/NASDAQ · 16:30–23:00 TSİ" ... */
  note: string;
}

/** Verilen anı Türkiye saatine çevirip haftanın günü (0=Pazar) ve gün içi dakikayı döndürür. */
export function trClock(now: Date): { day: number; minutes: number } {
  const shifted = new Date(now.getTime() + TR_OFFSET_MINUTES * 60_000);
  return { day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

const isWeekday = (day: number) => day >= 1 && day <= 5;

export function isMarketOpen(type: AssetType, now: Date = new Date()): boolean {
  if (type === 'crypto') return true;
  const { day, minutes } = trClock(now);
  if (!isWeekday(day)) return false;
  if (type === 'stock') return minutes >= US_SESSION_TR.open && minutes < US_SESSION_TR.close;
  // Döviz ve emtia: hafta içi gün boyu açık, hafta sonu kapalı
  return true;
}

const NOTES: Record<AssetType, string> = {
  crypto: '7/24 işlem görür',
  stock: 'NYSE/NASDAQ · hafta içi 16:30–23:00 TSİ',
  currency: 'Hafta içi açık, hafta sonu kapalı',
  commodity: 'Hafta içi açık, hafta sonu kapalı',
};

export function getMarketStatus(type: AssetType, now: Date = new Date()): MarketStatus {
  const open = isMarketOpen(type, now);
  return { open, label: open ? 'Piyasa açık' : 'Piyasa kapalı', note: NOTES[type] };
}

const clockFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/** "18:39 GMT+3" */
export function formatTrClock(date: Date | number): string {
  return `${clockFmt.format(date)} GMT+3`;
}
