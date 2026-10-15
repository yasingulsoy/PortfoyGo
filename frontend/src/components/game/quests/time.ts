/**
 * Oyun ekonomisi zaman yardımcıları (saf fonksiyonlar): geri sayım biçimi ve İstanbul gece yarısı.
 * Türkiye 2016'dan beri sabit UTC+3 kullanır (yaz saati yok) — backend ile aynı varsayım.
 */

export const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Kalan süreyi "SS:DD:ss" biçiminde verir (ör. 05:42:11). 24 saatten uzunsa "2g 05:42:11".
 * Negatif / geçersiz değerler 00:00:00 sayılır.
 */
export function formatCountdown(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const days = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}g ${clock}` : clock;
}

/** Ekran okuyucular / kısa metin için: "5 saat 42 dakika", "3 dakika", "1 gün 2 saat". */
export function formatDurationWords(ms: number): string {
  const totalMin = Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : 0;
  if (totalMin <= 0) return 'birkaç saniye';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} gün`);
  if (hours) parts.push(`${hours} saat`);
  if (minutes && !days) parts.push(`${minutes} dakika`);
  return parts.join(' ') || '1 dakika';
}

/** İstanbul takvim günü 'YYYY-MM-DD' */
export function istanbulDay(now: number = Date.now()): string {
  return new Date(now + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** Sonraki İstanbul gece yarısının zaman damgası (ms) */
export function nextIstanbulMidnight(now: number = Date.now()): number {
  const day = istanbulDay(now);
  return Date.parse(`${day}T00:00:00.000Z`) - ISTANBUL_OFFSET_MS + DAY_MS;
}

/** İstanbul gece yarısına kalan süre (ms) */
export function msUntilIstanbulMidnight(now: number = Date.now()): number {
  return Math.max(0, nextIstanbulMidnight(now) - now);
}

/** ISO tarihe kalan süre (ms); geçersiz/boşsa null. */
export function msUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t - now;
}

/** Oturumda geçen süre: "12 dk", "1 sa 05 dk" */
export function formatPlayed(ms: number): string {
  const totalMin = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 60_000) : 0;
  if (totalMin < 60) return `${totalMin} dk`;
  return `${Math.floor(totalMin / 60)} sa ${pad(totalMin % 60)} dk`;
}
