import { describe, expect, it } from 'vitest';
import { formatTrClock, getMarketStatus, isMarketOpen, trClock } from './marketHours';

// Tüm anlar UTC olarak verilir; Türkiye saati = UTC+3 (yaz saati yok).
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

describe('isMarketOpen — stock (NYSE/NASDAQ, 16:30–23:00 TSİ, hafta içi)', () => {
  it('is closed one minute before the open', () => {
    expect(isMarketOpen('stock', at('2026-10-07T13:29:00Z'))).toBe(false);
  });

  it('opens at 16:30 TSİ', () => {
    expect(isMarketOpen('stock', at('2026-10-07T13:30:00Z'))).toBe(true);
  });

  it('is open during the session', () => {
    expect(isMarketOpen('stock', at('2026-10-07T18:00:00Z'))).toBe(true);
    expect(isMarketOpen('stock', at('2026-10-07T19:59:00Z'))).toBe(true);
  });

  it('closes at 23:00 TSİ (end exclusive)', () => {
    expect(isMarketOpen('stock', at('2026-10-07T20:00:00Z'))).toBe(false);
  });

  it('is closed in the morning', () => {
    expect(isMarketOpen('stock', at('2026-10-07T07:00:00Z'))).toBe(false);
  });

  it('is closed on weekends even during session hours', () => {
    expect(isMarketOpen('stock', at('2026-10-10T15:00:00Z'))).toBe(false);
    expect(isMarketOpen('stock', at('2026-10-11T15:00:00Z'))).toBe(false);
  });

  it('uses the same TR hours in winter', () => {
    expect(isMarketOpen('stock', at('2026-01-14T13:30:00Z'))).toBe(true);
    expect(isMarketOpen('stock', at('2026-01-14T20:00:00Z'))).toBe(false);
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
    // Cuma 23:59 TSİ
    expect(isMarketOpen('currency', at('2026-10-09T20:59:00Z'))).toBe(true);
    // Cumartesi 00:00 TSİ
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
  it('returns Turkish labels and notes', () => {
    expect(getMarketStatus('stock', at('2026-10-07T15:00:00Z'))).toEqual({
      open: true,
      label: 'Piyasa açık',
      note: 'NYSE/NASDAQ · hafta içi 16:30–23:00 TSİ',
    });
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
