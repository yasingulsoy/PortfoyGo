import { DAY_MS, PICKS_TZ_OFFSET_MS, PickPhase, TIMELINE } from './config';

/**
 * Haftalık Seçim zaman çizelgesi — saf fonksiyonlar (veritabanına bağlanmaz; seed ve testler de kullanır).
 * İstanbul sabit UTC+3 kabul edilir (bkz. config.ts). Yerel takvim bileşenleri, anı +3 saat kaydırıp
 * UTC alanlarıyla okunur.
 */

export interface WeekTimes {
  week_id: string;
  opens_at: Date;
  reveal_at: Date;
  starts_at: Date;
  ends_at: Date;
}

export const WEEK_ID_RE = /^(\d{4})-W(\d{2})$/;

/** İstanbul yerel saatini UTC alanlarında taşıyan Date */
const local = (at: Date): Date => new Date(at.getTime() + PICKS_TZ_OFFSET_MS);

/** İstanbul yerel gece yarısı (UTC alanlarında) → gerçek UTC anı */
const fromLocalMidnight = (localMidnightMs: number): Date => new Date(localMidnightMs - PICKS_TZ_OFFSET_MS);

/** `at` anının içinde bulunduğu ISO haftasının (Pzt–Paz) Pazartesi 00:00'ı (İstanbul) */
export function isoWeekMonday(at: Date): Date {
  const l = local(at);
  const dowMon0 = (l.getUTCDay() + 6) % 7; // 0 = Pazartesi … 6 = Pazar
  const midnight = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  return fromLocalMidnight(midnight - dowMon0 * DAY_MS);
}

/** İstanbul takvim gününün başı (UTC anı) */
export function istanbulDayStart(at: Date): Date {
  const l = local(at);
  return fromLocalMidnight(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
}

/** Pazartesi 00:00 (İstanbul) → 'YYYY-Www' (ISO 8601: haftanın Perşembesinin yılı) */
export function weekIdOf(monday: Date): string {
  const l = local(monday);
  const thursday = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + 3);
  const isoYear = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(isoYear, 0, 1)) / DAY_MS / 7) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** 'YYYY-Www' → o haftanın Pazartesi 00:00'ı (İstanbul). Geçersiz (ör. 52 haftalık yılda W53) → null */
export function mondayOfWeekId(weekId: string): Date | null {
  const m = WEEK_ID_RE.exec(String(weekId ?? ''));
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week < 1 || week > 53) return null;
  // 1. hafta = 4 Ocak'ı içeren hafta
  const jan4 = Date.UTC(year, 0, 4);
  const jan4DowMon0 = (new Date(jan4).getUTCDay() + 6) % 7;
  const monday = fromLocalMidnight(jan4 - jan4DowMon0 * DAY_MS + (week - 1) * 7 * DAY_MS);
  return weekIdOf(monday) === weekId ? monday : null;
}

export function isValidWeekId(weekId: string): boolean {
  return mondayOfWeekId(weekId) !== null;
}

export function weekTimesFromMonday(monday: Date): WeekTimes {
  const s = monday.getTime();
  return {
    week_id: weekIdOf(monday),
    opens_at: new Date(s - TIMELINE.opensBeforeStartMs),
    reveal_at: new Date(s - TIMELINE.revealBeforeStartMs),
    starts_at: new Date(s),
    ends_at: new Date(s + TIMELINE.durationMs),
  };
}

export function weekTimes(weekId: string): WeekTimes | null {
  const monday = mondayOfWeekId(weekId);
  return monday ? weekTimesFromMonday(monday) : null;
}

/**
 * Kullanıcıların şu an etkileştiği hafta: opens_at ≤ at < ends_at
 *  - Cumartesi 00:00 – Pazar 15:00 → gelecek Pazartesinin haftası ('submit')
 *  - Pazar 15:00 – Pazartesi 00:00 → aynı hafta ('revealed')
 *  - Pazartesi – Cuma              → bu haftanın ('live')
 */
export function activeWeekTimes(at: Date): WeekTimes {
  return weekTimesFromMonday(isoWeekMonday(new Date(at.getTime() + TIMELINE.opensBeforeStartMs)));
}

/** Haftayı n hafta kaydırır */
export function shiftWeekId(weekId: string, n: number): string | null {
  const monday = mondayOfWeekId(weekId);
  return monday ? weekIdOf(new Date(monday.getTime() + n * 7 * DAY_MS)) : null;
}

/**
 * Hafta evresi. `settled` yalnızca ends_at geçtikten sonra önemlidir (settling → finished).
 */
export function phaseAt(t: Pick<WeekTimes, 'opens_at' | 'reveal_at' | 'starts_at' | 'ends_at'>, now: Date, settled: boolean): PickPhase {
  const n = now.getTime();
  if (n < t.opens_at.getTime()) return 'upcoming';
  if (n < t.reveal_at.getTime()) return 'submit';
  if (n < t.starts_at.getTime()) return 'revealed';
  if (n < t.ends_at.getTime()) return 'live';
  return settled ? 'finished' : 'settling';
}

/** Seçimler (ve tartışma) görünür mü? reveal_at ve sonrası */
export const isRevealedPhase = (phase: PickPhase): boolean => phase !== 'upcoming' && phase !== 'submit';
