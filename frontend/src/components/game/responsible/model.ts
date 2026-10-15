import type { GameResponsibleSettings, GameResponsibleState, GameSessionReminderMinutes } from '@/types';

/** Günlük tur sınırı seçenekleri (backend: null | 5..50) */
export const ROUND_LIMIT_OPTIONS: readonly (number | null)[] = [null, 5, 10, 15, 20, 30, 50];
/** Oturum hatırlatıcısı seçenekleri (dakika) */
export const REMINDER_OPTIONS: readonly (GameSessionReminderMinutes | null)[] = [null, 15, 30, 60];

/** Ardışık zarar sayısı bu değere ulaşınca nazik mola önerisi gösterilir. */
export const LOSS_STREAK_THRESHOLD = 3;

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toRoundLimit(v: unknown): number | null {
  const n = toNum(v);
  if (n === null || n <= 0) return null;
  return Math.min(50, Math.max(5, Math.round(n)));
}

export function toReminderMinutes(v: unknown): GameSessionReminderMinutes | null {
  const n = toNum(v);
  return n === 15 || n === 30 || n === 60 ? n : null;
}

/** Sunucu yanıtını (profil.responsible veya GET /game/responsible) güvenle okur. */
export function toResponsibleState(raw: any): GameResponsibleState {
  const r = raw && typeof raw === 'object' ? raw : {};
  const breakUntil = typeof r.break_until === 'string' && r.break_until && !Number.isNaN(Date.parse(r.break_until)) ? r.break_until : null;
  return {
    adult_confirmed: r.adult_confirmed === true,
    break_until: breakUntil,
    loss_streak: Math.max(0, toNum(r.loss_streak) ?? 0),
    rounds_today: toNum(r.rounds_today),
    daily_round_limit: toRoundLimit(r.daily_round_limit),
    session_reminder_minutes: toReminderMinutes(r.session_reminder_minutes),
  };
}

export function toResponsibleSettings(raw: any): GameResponsibleSettings {
  const s = toResponsibleState(raw);
  return { daily_round_limit: s.daily_round_limit, session_reminder_minutes: s.session_reminder_minutes };
}

/** Mola devam ediyor mu? */
export function isOnBreak(state: Pick<GameResponsibleState, 'break_until'> | null | undefined, now: number = Date.now()): boolean {
  if (!state?.break_until) return false;
  const t = Date.parse(state.break_until);
  return !Number.isNaN(t) && t > now;
}

export function roundLimitLabel(v: number | null): string {
  return v === null ? 'Sınır yok' : `Günde ${v} tur`;
}

export function reminderLabel(v: GameSessionReminderMinutes | null): string {
  return v === null ? 'Kapalı' : v === 60 ? 'Her 1 saatte' : `Her ${v} dakikada`;
}

/* ------------------------------------------------------------------ */
/* Oyun oturumu (sekme bazında, sessionStorage)                        */
/* ------------------------------------------------------------------ */

const SESSION_KEY = 'pg:game-session';
/** Oyun alanından bu kadar uzak kalınırsa yeni oturum başlar. */
export const SESSION_IDLE_RESET_MS = 10 * 60_000;

export interface GameSession {
  /** Oturum başlangıcı (ms) */
  start: number;
  /** Son görülme (ms) */
  seen: number;
  /** Bir sonraki hatırlatmanın sayılacağı başlangıç ("Devam et" ile ileri alınır) */
  remindFrom: number;
}

/** Saklanan oturumu okur; yoksa / çok eskiyse yeni oturum döner (yazmaz). */
export function readGameSession(now: number = Date.now()): GameSession {
  const fresh: GameSession = { start: now, seen: now, remindFrom: now };
  if (typeof window === 'undefined') return fresh;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null');
    const start = Number(raw?.start);
    const seen = Number(raw?.seen);
    const remindFrom = Number(raw?.remindFrom);
    if (!Number.isFinite(start) || !Number.isFinite(seen) || start > now || now - seen > SESSION_IDLE_RESET_MS) return fresh;
    return { start, seen, remindFrom: Number.isFinite(remindFrom) ? Math.max(start, remindFrom) : start };
  } catch {
    return fresh;
  }
}

export function writeGameSession(session: GameSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}
