import { describe, expect, it } from 'vitest';
import { formatCountdown, formatDurationWords, formatPlayed, istanbulDay, msUntil, msUntilIstanbulMidnight, nextIstanbulMidnight } from './time';
import { questPercent, sortQuests, streakCalendar, toQuest, toQuestList, toStreakInfo } from './model';

describe('geri sayım biçimi', () => {
  it('SS:DD:ss', () => {
    expect(formatCountdown((5 * 3600 + 42 * 60 + 11) * 1000)).toBe('05:42:11');
    expect(formatCountdown(999)).toBe('00:00:00');
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5000)).toBe('00:00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00:00');
  });

  it('24 saatten uzun süreler gün içerir', () => {
    expect(formatCountdown((2 * 86400 + 3600) * 1000)).toBe('2g 01:00:00');
  });

  it('sözcüklü süre', () => {
    expect(formatDurationWords(3 * 60_000)).toBe('3 dakika');
    expect(formatDurationWords((5 * 60 + 42) * 60_000)).toBe('5 saat 42 dakika');
    expect(formatDurationWords((26 * 60 + 5) * 60_000)).toBe('1 gün 2 saat');
    expect(formatDurationWords(0)).toBe('birkaç saniye');
  });

  it('oturum süresi', () => {
    expect(formatPlayed(12 * 60_000)).toBe('12 dk');
    expect(formatPlayed(65 * 60_000)).toBe('1 sa 05 dk');
  });
});

describe('İstanbul gece yarısı', () => {
  it('UTC 20:59 → İstanbul günü değişmeden, 21:00 → ertesi gün', () => {
    expect(istanbulDay(Date.parse('2026-10-11T20:59:59Z'))).toBe('2026-10-11');
    expect(istanbulDay(Date.parse('2026-10-11T21:00:00Z'))).toBe('2026-10-12');
  });

  it('sonraki gece yarısı UTC 21:00', () => {
    expect(new Date(nextIstanbulMidnight(Date.parse('2026-10-11T10:00:00Z'))).toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(new Date(nextIstanbulMidnight(Date.parse('2026-10-11T21:00:00Z'))).toISOString()).toBe('2026-10-12T21:00:00.000Z');
    expect(msUntilIstanbulMidnight(Date.parse('2026-10-11T20:00:00Z'))).toBe(3600_000);
  });

  it('msUntil', () => {
    expect(msUntil(null)).toBeNull();
    expect(msUntil('geçersiz')).toBeNull();
    expect(msUntil('2026-10-11T10:00:10Z', Date.parse('2026-10-11T10:00:00Z'))).toBe(10_000);
  });
});

describe('görevler', () => {
  it('ilerleme hedefle sınırlanır, tamamlanma türetilir', () => {
    const q = toQuest({ key: 'k', progress: 5, target: 3, reward: { coins: '50', xp: 40 } });
    expect(q.progress).toBe(3);
    expect(q.completed).toBe(true);
    expect(q.reward).toEqual({ coins: 50, xp: 40 });
    expect(questPercent({ progress: 1, target: 3 })).toBe(33);
  });

  it('liste: anahtarsız öğeler atılır; sıralama alınabilir → devam → alınmış', () => {
    const list = toQuestList({
      day: '2026-10-11',
      items: [
        { key: 'a', progress: 1, target: 1, claimed: true },
        { key: 'b', progress: 0, target: 1 },
        { key: 'c', progress: 1, target: 1 },
        { title: 'anahtarsız' },
      ],
    });
    expect(list.items.map((q) => q.key)).toEqual(['a', 'b', 'c']);
    expect(sortQuests(list.items).map((q) => q.key)).toEqual(['c', 'b', 'a']);
  });

  it('seri bilgisi farklı biçimlerden okunur', () => {
    expect(toStreakInfo({ streak: { current: 3, best: 5, today_done: true } })).toEqual({ current: 3, todayDone: true });
    expect(toStreakInfo({ streak: 4 })).toEqual({ current: 4, todayDone: false });
    expect(toStreakInfo({})).toEqual({ current: 0, todayDone: false });
  });

  it('7 günlük takvim', () => {
    const states = (c: number, t: boolean) =>
      streakCalendar({ current: c, todayDone: t })
        .map((d) => d.state[0])
        .join('');
    expect(states(0, false)).toBe('tuuuuuu');
    expect(states(3, true)).toBe('ddduuuu');
    expect(states(3, false)).toBe('dddtuuu');
    expect(states(7, true)).toBe('ddddddd');
    expect(states(7, false)).toBe('tuuuuuu');
    expect(states(9, true)).toBe('dduuuuu');
    expect(streakCalendar({ current: 0, todayDone: false })[6].bonus).toBe(true);
  });
});
