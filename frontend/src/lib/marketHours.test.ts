import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  formatTrClock,
  getMarketStatus,
  isMarketOpen,
  nyClock,
  stockSessionStatus,
  toUsMarketSession,
  trClock,
  usSessionInTr,
  type UsMarketSession,
} from './marketHours';

// Tüm anlar UTC olarak verilir; Türkiye saati = UTC+3 (yaz saati yok).
// New York: EDT (UTC−4) 8 Mart – 1 Kasım 2026, sonra EST (UTC−5).
// 2026-10-07 Çarşamba, 2026-10-10 Cumartesi, 2026-10-11 Pazar, 2026-10-12 Pazartesi.
const at = (iso: string) => new Date(iso);

describe('trClock', () => {
  it('converts UTC to Turkey time (UTC+3)', () => {
    expect(trClock(at('2026-10-07T13:30:00Z'))).toEqual({ day: 3, minutes: 16 * 60 + 30 });
  });

  it('rolls over to the next day after 21:00 UTC', () => {
    // Pazar 21:00 UTC = Pazartesi 00:00 TSİ
    expect(trClock(at('2026-10-11T21:00:00Z'))).toEqual({ day: 1, minutes: 0 });
  });

  it('is unaffected by DST-observing seasons (fixed offset in January too)', () => {
    expect(trClock(at('2026-01-14T13:30:00Z'))).toEqual({ day: 3, minutes: 16 * 60 + 30 });
  });
});

describe('nyClock / usSessionInTr (DST-aware)', () => {
  it('EDT in October, EST in January', () => {
    expect(nyClock(at('2026-10-07T13:30:00Z'))).toEqual({ day: 3, minutes: 9 * 60 + 30, offsetMinutes: -240 });
    expect(nyClock(at('2026-01-14T14:30:00Z'))).toEqual({ day: 3, minutes: 9 * 60 + 30, offsetMinutes: -300 });
  });

  it('session in Turkey time: 16:30–23:00 in summer, 17:30–00:00 in winter', () => {
    expect(usSessionInTr(at('2026-10-07T12:00:00Z'))).toBe('16:30–23:00');
    expect(usSessionInTr(at('2026-01-14T12:00:00Z'))).toBe('17:30–00:00');
  });
});

describe('isMarketOpen — stock (NYSE/NASDAQ, 09:30–16:00 New York, hafta içi)', () => {
  it('is closed one minute before the open', () => {
    expect(isMarketOpen('stock', at('2026-10-07T13:29:00Z'))).toBe(false);
  });

  it('opens at 16:30 TSİ in summer', () => {
    expect(isMarketOpen('stock', at('2026-10-07T13:30:00Z'))).toBe(true);
  });

  it('is open during the session', () => {
    expect(isMarketOpen('stock', at('2026-10-07T18:00:00Z'))).toBe(true);
    expect(isMarketOpen('stock', at('2026-10-07T19:59:00Z'))).toBe(true);
  });

  it('closes at 23:00 TSİ in summer (end exclusive)', () => {
    expect(isMarketOpen('stock', at('2026-10-07T20:00:00Z'))).toBe(false);
  });

  it('is closed in the morning', () => {
    expect(isMarketOpen('stock', at('2026-10-07T07:00:00Z'))).toBe(false);
  });

  it('is closed on weekends even during session hours', () => {
    expect(isMarketOpen('stock', at('2026-10-10T15:00:00Z'))).toBe(false);
    expect(isMarketOpen('stock', at('2026-10-11T15:00:00Z'))).toBe(false);
  });

  it('shifts one hour later in Turkey time in winter (EST: 17:30–00:00 TSİ)', () => {
    expect(isMarketOpen('stock', at('2026-01-14T13:30:00Z'))).toBe(false);
    expect(isMarketOpen('stock', at('2026-01-14T14:30:00Z'))).toBe(true);
    expect(isMarketOpen('stock', at('2026-01-14T20:30:00Z'))).toBe(true);
    expect(isMarketOpen('stock', at('2026-01-14T21:00:00Z'))).toBe(false);
  });

  it('follows the New York calendar day across the DST switch (Mon 9 Mar 2026 opens 13:30 UTC)', () => {
    expect(isMarketOpen('stock', at('2026-03-06T14:29:00Z'))).toBe(false);
    expect(isMarketOpen('stock', at('2026-03-09T13:30:00Z'))).toBe(true);
  });
});

describe('isMarketOpen — crypto', () => {
  it('is always open, including weekends and nights', () => {
    expect(isMarketOpen('crypto', at('2026-10-10T03:00:00Z'))).toBe(true);
    expect(isMarketOpen('crypto', at('2026-10-11T23:59:00Z'))).toBe(true);
    expect(isMarketOpen('crypto', at('2026-10-07T12:00:00Z'))).toBe(true);
  });
});

describe('isMarketOpen — currency & commodity', () => {
  it('is open all day on weekdays', () => {
    expect(isMarketOpen('currency', at('2026-10-07T00:30:00Z'))).toBe(true);
    expect(isMarketOpen('commodity', at('2026-10-07T22:00:00Z'))).toBe(true);
  });

  it('is open on Friday late evening (TR) and closes at Saturday 00:00 TSİ', () => {
    expect(isMarketOpen('currency', at('2026-10-09T20:59:00Z'))).toBe(true);
    expect(isMarketOpen('currency', at('2026-10-09T21:00:00Z'))).toBe(false);
  });

  it('is closed on Saturday and Sunday', () => {
    expect(isMarketOpen('currency', at('2026-10-10T12:00:00Z'))).toBe(false);
    expect(isMarketOpen('commodity', at('2026-10-11T12:00:00Z'))).toBe(false);
  });

  it('reopens on Monday 00:00 TSİ (Sunday 21:00 UTC)', () => {
    expect(isMarketOpen('commodity', at('2026-10-11T20:59:00Z'))).toBe(false);
    expect(isMarketOpen('commodity', at('2026-10-11T21:00:00Z'))).toBe(true);
  });
});

describe('getMarketStatus', () => {
  it('returns Turkish labels and notes (stock note follows DST)', () => {
    expect(getMarketStatus('stock', at('2026-10-07T15:00:00Z'))).toEqual({
      open: true,
      label: 'Piyasa açık',
      note: 'NYSE/NASDAQ · hafta içi 16:30–23:00 TSİ',
    });
    expect(getMarketStatus('stock', at('2026-12-07T15:00:00Z')).note).toBe('NYSE/NASDAQ · hafta içi 17:30–00:00 TSİ');
    expect(getMarketStatus('currency', at('2026-10-10T12:00:00Z')).label).toBe('Piyasa kapalı');
    expect(getMarketStatus('crypto', at('2026-10-10T12:00:00Z')).note).toBe('7/24 işlem görür');
  });
});

describe('formatTrClock', () => {
  it('formats as HH:MM GMT+3 in Turkey time', () => {
    expect(formatTrClock(at('2026-10-07T15:39:00Z'))).toBe('18:39 GMT+3');
    expect(formatTrClock(at('2026-10-07T21:05:00Z'))).toBe('00:05 GMT+3');
  });
});

describe('formatCountdown', () => {
  const min = 60_000;
  it.each([
    [0, '1 dk’dan az'],
    [-5_000, '1 dk’dan az'],
    [59_999, '1 dk’dan az'],
    [min, '1 dk'],
    [45 * min + 59_000, '45 dk'],
    [60 * min, '1 sa'],
    [(3 * 60 + 12) * min + 30_000, '3 sa 12 dk'],
    [(23 * 60 + 59) * min, '23 sa 59 dk'],
    [24 * 60 * min, '1 gün'],
    [(2 * 24 * 60 + 4 * 60 + 30) * min, '2 gün 4 sa'],
  ])('%d ms → %s', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });
});

describe('toUsMarketSession + stockSessionStatus', () => {
  const raw = {
    open: false,
    enforced: true,
    reason: 'weekend',
    holiday: null,
    early_close: false,
    next_open_at: '2026-10-19T13:30:00.000Z',
    next_close_at: '2026-10-19T20:00:00.000Z',
    next_early_close: false,
    server_time: '2026-10-19T10:18:00.000Z',
  };

  it('maps the API payload and measures the server clock offset', () => {
    const clientNow = Date.parse('2026-10-19T10:17:00.000Z'); // istemci 1 dk geride
    const s = toUsMarketSession(raw, clientNow)!;
    expect(s).toMatchObject({ open: false, enforced: true, reason: 'weekend', nextOpenAt: Date.parse(raw.next_open_at), clockOffsetMs: 60_000 });
    expect(toUsMarketSession(null)).toBeNull();
    expect(toUsMarketSession({ open: true })).toBeNull();
  });

  it('closed: "Piyasa kapalı · açılışa 3 sa 12 dk" counted on the server clock', () => {
    const clientNow = Date.parse('2026-10-19T10:17:00.000Z');
    const s = toUsMarketSession(raw, clientNow)!;
    expect(stockSessionStatus(s, clientNow)).toMatchObject({
      open: false,
      label: 'Piyasa kapalı',
      detail: 'açılışa 3 sa 12 dk',
      badge: 'Piyasa kapalı · açılışa 3 sa 12 dk',
      nextChangeAt: Date.parse(raw.next_open_at),
    });
  });

  it('flips to open when the cached session passes the open; shows time to close', () => {
    const s = toUsMarketSession(raw, Date.parse(raw.server_time))!;
    const st = stockSessionStatus(s, Date.parse('2026-10-19T19:15:00.000Z'));
    expect(st).toMatchObject({ open: true, label: 'Piyasa açık', detail: 'kapanışa 45 dk' });
  });

  it('open session flips to closed after the close (next open unknown until refetch)', () => {
    const open = toUsMarketSession({ ...raw, open: true, reason: null, next_open_at: '2026-10-20T13:30:00.000Z', server_time: '2026-10-19T19:00:00.000Z' }, Date.parse('2026-10-19T19:00:00.000Z'))!;
    expect(stockSessionStatus(open, Date.parse('2026-10-19T19:30:00.000Z')).badge).toBe('Piyasa açık · kapanışa 30 dk');
    expect(stockSessionStatus(open, Date.parse('2026-10-19T20:00:00.000Z'))).toMatchObject({ open: false, detail: 'açılışa 17 sa 30 dk' });
  });

  it('not enforced → always open; no session → DST-aware fallback without countdown', () => {
    const off: UsMarketSession = { ...toUsMarketSession(raw)!, enforced: false };
    expect(stockSessionStatus(off).open).toBe(true);
    expect(stockSessionStatus(null, Date.parse('2026-10-17T15:00:00Z'))).toMatchObject({ open: false, detail: null, badge: 'Piyasa kapalı' });
  });
});
