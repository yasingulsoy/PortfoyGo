import type { GameQuest, GameQuestList } from '@/types';
import { istanbulDay } from './time';

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export function toQuest(raw: any): GameQuest {
  const target = Math.max(1, num(raw?.target, 1));
  const progress = Math.max(0, Math.min(target, num(raw?.progress)));
  const claimed = raw?.claimed === true;
  return {
    key: String(raw?.key ?? ''),
    title: String(raw?.title ?? 'Görev'),
    description: String(raw?.description ?? ''),
    progress,
    target,
    reward: { coins: Math.max(0, num(raw?.reward?.coins)), xp: Math.max(0, num(raw?.reward?.xp)) },
    completed: claimed || raw?.completed === true || progress >= target,
    claimed,
  };
}

export function toQuestList(raw: any): GameQuestList {
  const items = Array.isArray(raw?.items) ? raw.items.map(toQuest).filter((q: GameQuest) => q.key) : [];
  return { day: typeof raw?.day === 'string' && raw.day ? raw.day.slice(0, 10) : istanbulDay(), items };
}

/** Görev ilerleme yüzdesi (0..100) */
export const questPercent = (q: Pick<GameQuest, 'progress' | 'target'>) => Math.round((Math.min(q.progress, q.target) / Math.max(1, q.target)) * 100);

/** Sıralama: alınabilir → devam eden → alınmış */
export function sortQuests(items: GameQuest[]): GameQuest[] {
  const rank = (q: GameQuest) => (q.completed && !q.claimed ? 0 : !q.completed ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/* ------------------------------------------------------------------ */
/* 7 günlük seri                                                       */
/* ------------------------------------------------------------------ */

export interface StreakInfo {
  /** Mevcut seri (gün) */
  current: number;
  /** Bugün seriye sayıldı mı */
  todayDone: boolean;
}

/** Profildeki seri alanını farklı olası biçimlerden okur (streak: number | {current, today_done, ...}). */
export function toStreakInfo(profile: any): StreakInfo {
  const s = profile?.streak ?? profile?.daily_streak ?? profile?.login_streak;
  if (s && typeof s === 'object') {
    return {
      current: Math.max(0, Math.floor(num(s.current ?? s.days ?? s.count))),
      todayDone: s.today_done === true || s.todayDone === true || s.claimed_today === true || s.active_today === true,
    };
  }
  return { current: Math.max(0, Math.floor(num(s ?? profile?.streak_days))), todayDone: profile?.streak_today === true };
}

export interface StreakDay {
  /** 1..7 */
  day: number;
  state: 'done' | 'today' | 'upcoming';
  /** 7. gün ödül günü (ekstra çevirme) */
  bonus: boolean;
}

/** 7 günlük takvim: serinin 7'lik döngüdeki yerine göre işaretlenir. */
export function streakCalendar({ current, todayDone }: StreakInfo): StreakDay[] {
  // Döngüde tamamlanan gün sayısı (7, 14... gün tamamlandıysa tam döngü gösterilir)
  const inCycle = current > 0 ? ((current - 1) % 7) + 1 : 0;
  const done = todayDone ? inCycle : current > 0 && inCycle === 7 ? 0 : inCycle;
  return Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const state: StreakDay['state'] = day <= done ? 'done' : day === done + 1 && !todayDone ? 'today' : 'upcoming';
    return { day, state, bonus: day === 7 };
  });
}
