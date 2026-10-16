// Piyasa açık/kapalı durumu. Saf fonksiyonlar: yalnızca verilen ana (Date / ms) bakar.
// - Hisse (NYSE/NASDAQ): yetkili kaynak sunucudur (GET /api/market/session: tatiller, erken kapanışlar,
//   yaz saati). Oturum bilgisi yoksa yaz saatine duyarlı (Intl, America/New_York) hafta içi kuralı kullanılır.
// - Türkiye 2016'dan beri yaz saati uygulamaz; TSİ sabit UTC+3.

import type { AssetType } from '@/types';

/** Türkiye saati (TSİ) = UTC+3, yaz saati yok. */
export const TR_OFFSET_MINUTES = 3 * 60;

/** NYSE normal seansı, New York yerel saatiyle (gün başından dakika). Bitiş hariçtir. */
export const NY_SESSION = { open: 9 * 60 + 30, close: 16 * 60 } as const;

export interface MarketStatus {
  open: boolean;
  /** "Piyasa açık" / "Piyasa kapalı" */
  label: string;
  /** Kısa açıklama: "7/24 işlem görür", "NYSE/NASDAQ · hafta içi 16:30–23:00 TSİ" ... */
  note: string;
}

/** Verilen anı Türkiye saatine çevirip haftanın günü (0=Pazar) ve gün içi dakikayı döndürür. */
export function trClock(now: Date): { day: number; minutes: number } {
  const shifted = new Date(now.getTime() + TR_OFFSET_MINUTES * 60_000);
  return { day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** New York yerel saati: haftanın günü (0=Pazar), gün içi dakika ve UTC farkı (dakika; EDT −240, EST −300). */
export function nyClock(now: Date): { day: number; minutes: number; offsetMinutes: number } {
  const p: Record<string, number> = {};
  for (const part of nyFormatter.formatToParts(now)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute);
  const offsetMinutes = Math.round((asUtc - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000);
  return { day: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(), minutes: hour * 60 + p.minute, offsetMinutes };
}

const isWeekday = (day: number) => day >= 1 && day <= 5;

/** Sunucu bilgisi yokken: New York hafta içi 09:30–16:00 (yaz saatine duyarlı, tatiller hariç değil). */
export function isUsSessionOpenFallback(now: Date): boolean {
  const { day, minutes } = nyClock(now);
  return isWeekday(day) && minutes >= NY_SESSION.open && minutes < NY_SESSION.close;
}

const hhmm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** O günkü (yaz/kış saatine göre) ABD seansının TSİ karşılığı: "16:30–23:00" ya da "17:30–00:00". */
export function usSessionInTr(now: Date): string {
  const shift = TR_OFFSET_MINUTES - nyClock(now).offsetMinutes;
  return `${hhmm(NY_SESSION.open + shift)}–${hhmm(NY_SESSION.close + shift)}`;
}

export function isMarketOpen(type: AssetType, now: Date = new Date()): boolean {
  if (type === 'crypto') return true;
  if (type === 'stock') return isUsSessionOpenFallback(now);
  // Döviz ve emtia: hafta içi gün boyu açık, hafta sonu kapalı (TSİ)
  return isWeekday(trClock(now).day);
}

const NOTES: Record<Exclude<AssetType, 'stock'>, string> = {
  crypto: '7/24 işlem görür',
  currency: 'Hafta içi açık, hafta sonu kapalı',
  commodity: 'Hafta içi açık, hafta sonu kapalı',
};

export function marketNote(type: AssetType, now: Date = new Date()): string {
  return type === 'stock' ? `NYSE/NASDAQ · hafta içi ${usSessionInTr(now)} TSİ` : NOTES[type];
}

export function getMarketStatus(type: AssetType, now: Date = new Date()): MarketStatus {
  const open = isMarketOpen(type, now);
  return { open, label: open ? 'Piyasa açık' : 'Piyasa kapalı', note: marketNote(type, now) };
}

const clockFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/** "18:39 GMT+3" */
export function formatTrClock(date: Date | number): string {
  return `${clockFmt.format(date)} GMT+3`;
}

const dayTimeFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/** "16 Ekim Cuma 16:30" (TSİ) */
export function formatTrDayTime(date: Date | number): string {
  return dayTimeFmt.format(date);
}

// ---------------------------------------------------------------------------
// Sunucu oturumu (GET /api/market/session) ve geri sayım
// ---------------------------------------------------------------------------

export type UsSessionReason = 'weekend' | 'holiday' | 'pre_open' | 'after_close';

export interface UsMarketSession {
  /** Hisse piyasa emri verilebilir mi (seans kuralı kapalıysa her zaman true) */
  open: boolean;
  enforced: boolean;
  reason: UsSessionReason | null;
  holiday: string | null;
  earlyClose: boolean;
  /** ms (epoch) */
  nextOpenAt: number;
  nextCloseAt: number;
  nextEarlyClose: boolean;
  /** Sunucu saati − istemci saati (ms): geri sayımlar sunucu saatine göre */
  clockOffsetMs: number;
}

const toMs = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** API yanıtını modele çevirir; `clientNow`: yanıtın alındığı istemci anı (ms). Geçersizse null. */
export function toUsMarketSession(raw: any, clientNow: number = Date.now()): UsMarketSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const nextOpenAt = toMs(raw.next_open_at);
  const nextCloseAt = toMs(raw.next_close_at);
  if (nextOpenAt === null || nextCloseAt === null) return null;
  const serverTime = toMs(raw.server_time);
  const reasons: UsSessionReason[] = ['weekend', 'holiday', 'pre_open', 'after_close'];
  return {
    open: raw.open === true,
    enforced: raw.enforced !== false,
    reason: reasons.includes(raw.reason) ? raw.reason : null,
    holiday: typeof raw.holiday === 'string' && raw.holiday ? raw.holiday : null,
    earlyClose: raw.early_close === true,
    nextOpenAt,
    nextCloseAt,
    nextEarlyClose: raw.next_early_close === true,
    clockOffsetMs: serverTime === null ? 0 : serverTime - clientNow,
  };
}

/** Kalan süre: "1 dk’dan az", "45 dk", "3 sa 12 dk", "2 gün 4 sa" */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return '1 dk’dan az';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} gün ${hours} sa` : `${days} gün`;
  if (hours > 0) return minutes > 0 ? `${hours} sa ${minutes} dk` : `${hours} sa`;
  return `${minutes} dk`;
}

export interface StockSessionStatus {
  open: boolean;
  /** "Piyasa açık" / "Piyasa kapalı" */
  label: string;
  /** "açılışa 3 sa 12 dk" / "kapanışa 45 dk" (bilinmiyorsa null) */
  detail: string | null;
  /** "Piyasa kapalı · açılışa 3 sa 12 dk" */
  badge: string;
  /** Kapalıyken bir sonraki açılış (ms), açıkken kapanış */
  nextChangeAt: number | null;
}

/**
 * Hisse seans durumu. Sunucu oturumu varsa onu (sunucu saatine göre) kullanır; veri bir geçişten
 * (açılış/kapanış) eskiyse durumu kendisi çevirir. Yoksa yaz saatine duyarlı hafta içi kuralı.
 */
export function stockSessionStatus(session: UsMarketSession | null | undefined, clientNow: number = Date.now()): StockSessionStatus {
  if (!session) {
    const open = isUsSessionOpenFallback(new Date(clientNow));
    const label = open ? 'Piyasa açık' : 'Piyasa kapalı';
    return { open, label, detail: null, badge: label, nextChangeAt: null };
  }
  if (!session.enforced) {
    return { open: true, label: 'Piyasa açık', detail: null, badge: 'Piyasa açık', nextChangeAt: null };
  }
  const now = clientNow + session.clockOffsetMs;
  const open = session.open ? now < session.nextCloseAt : now >= session.nextOpenAt && now < session.nextCloseAt;
  const label = open ? 'Piyasa açık' : 'Piyasa kapalı';
  const target = open ? session.nextCloseAt : session.nextOpenAt;
  const remaining = target - now;
  // Durum çevrildiyse (eski veri) hedef geçmişte kalabilir: sonraki geçiş bilinmiyor
  const detail = remaining > 0 ? `${open ? 'kapanışa' : 'açılışa'} ${formatCountdown(remaining)}` : null;
  return { open, label, detail, badge: detail ? `${label} · ${detail}` : label, nextChangeAt: remaining > 0 ? target : null };
}
