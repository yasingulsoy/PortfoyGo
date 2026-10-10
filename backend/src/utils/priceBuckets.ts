/**
 * Fiyat geçmişi kova yardımcıları (veritabanına bağlanmaz; servis, seed ve testler ortak kullanır).
 *
 *  - m15  : 15 dakikalık kova (UTC çeyrek saat başı)
 *  - hour : saatlik kova (UTC saat başı)
 *  - day  : İstanbul takvim günü (gece yarısı Europe/Istanbul)
 */

export const PRICE_TZ = 'Europe/Istanbul';
export const PRICE_GRANULARITIES = ['m15', 'hour', 'day'] as const;
export type PriceGranularity = (typeof PRICE_GRANULARITIES)[number];

export const MIN_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export const GRANULARITY_MS: Record<PriceGranularity, number> = {
  m15: 15 * MIN_MS,
  hour: HOUR_MS,
  day: DAY_MS,
};

const tzFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PRICE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function tzParts(ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p: Record<string, number> = {};
  for (const part of tzFormatter.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/** İstanbul'un verilen andaki UTC farkı (ms) */
function tzOffsetMs(ms: number): number {
  const p = tzParts(ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** İstanbul'da verilen yerel tarihin gece yarısı (UTC anı, ms) */
function tzMidnight(y: number, mo: number, d: number): number {
  const guess = Date.UTC(y, mo - 1, d);
  const first = guess - tzOffsetMs(guess);
  // Yaz saati geçişinde fark değişmişse bir kez düzelt
  return guess - tzOffsetMs(first);
}

/** İstanbul takvim gününün başlangıcı */
export function istanbulDayStart(at: Date): Date {
  const p = tzParts(at.getTime());
  return new Date(tzMidnight(p.y, p.mo, p.d));
}

/** İstanbul'a göre yılın ilk günü 00:00 (YTD başlangıcı) */
export function istanbulYearStart(at: Date): Date {
  const p = tzParts(at.getTime());
  return new Date(tzMidnight(p.y, 1, 1));
}

/** Verilen anın içinde bulunduğu kovanın başlangıcı */
export function bucketStart(granularity: PriceGranularity, at: Date): Date {
  if (granularity === 'day') return istanbulDayStart(at);
  const size = GRANULARITY_MS[granularity];
  return new Date(Math.floor(at.getTime() / size) * size);
}
