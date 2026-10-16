import { afterEach, describe, expect, it } from 'vitest';
import {
  MarketClosedError,
  NYSE_CALENDAR_LAST_YEAR,
  NYSE_EARLY_CLOSES,
  NYSE_HOLIDAYS,
  assertMarketOpenFor,
  getUsEquitySession,
  isNyseTradingDay,
  marketClock,
  serializeSession,
  stockMarketState,
} from '../src/services/marketHours';

// Tüm anlar UTC verilir. New York: EDT = UTC−4 (Mart 8 – Kasım 1, 2026), EST = UTC−5.
const at = (iso: string) => new Date(iso);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

describe('getUsEquitySession — normal days', () => {
  it('is open 09:30–16:00 New York (EDT: 13:30–20:00 UTC), end exclusive', () => {
    expect(getUsEquitySession(at('2026-10-15T13:29:59Z')).open).toBe(false);
    expect(getUsEquitySession(at('2026-10-15T13:30:00Z')).open).toBe(true);
    expect(getUsEquitySession(at('2026-10-15T19:59:59Z')).open).toBe(true);
    expect(getUsEquitySession(at('2026-10-15T20:00:00Z')).open).toBe(false);
  });

  it('pre-open: next open is the same morning', () => {
    const s = getUsEquitySession(at('2026-10-15T12:00:00Z'));
    expect(s).toMatchObject({ open: false, reason: 'pre_open', holiday: null });
    expect(iso(s.next_open_at)).toBe('2026-10-15T13:30:00.000Z');
    expect(iso(s.next_close_at)).toBe('2026-10-15T20:00:00.000Z');
  });

  it('open: next_close_at is today, next_open_at the next trading day', () => {
    const s = getUsEquitySession(at('2026-10-15T15:00:00Z'));
    expect(s).toMatchObject({ open: true, reason: null });
    expect(iso(s.session_open_at)).toBe('2026-10-15T13:30:00.000Z');
    expect(iso(s.next_close_at)).toBe('2026-10-15T20:00:00.000Z');
    expect(iso(s.next_open_at)).toBe('2026-10-16T13:30:00.000Z');
  });

  it('after close on Friday → Monday open', () => {
    const s = getUsEquitySession(at('2026-10-16T21:00:00Z'));
    expect(s).toMatchObject({ open: false, reason: 'after_close' });
    expect(iso(s.next_open_at)).toBe('2026-10-19T13:30:00.000Z');
  });

  it('weekend is closed with reason "weekend"', () => {
    const s = getUsEquitySession(at('2026-10-17T15:00:00Z'));
    expect(s).toMatchObject({ open: false, reason: 'weekend', session_open_at: null });
    expect(iso(s.next_open_at)).toBe('2026-10-19T13:30:00.000Z');
  });

  it('uses the New York calendar day, not UTC (Fri 22:00 New York = Sat 02:00 UTC)', () => {
    const s = getUsEquitySession(at('2026-10-17T02:00:00Z'));
    expect(s.reason).toBe('after_close');
    expect(iso(s.session_open_at)).toBe('2026-10-16T13:30:00.000Z');
  });
});

describe('getUsEquitySession — DST transitions', () => {
  it('winter (EST): opens 14:30 UTC = 17:30 TSİ', () => {
    expect(getUsEquitySession(at('2026-03-06T14:29:00Z')).open).toBe(false);
    expect(getUsEquitySession(at('2026-03-06T14:30:00Z')).open).toBe(true);
    expect(getUsEquitySession(at('2026-03-06T20:59:00Z')).open).toBe(true);
    expect(getUsEquitySession(at('2026-03-06T21:00:00Z')).open).toBe(false);
  });

  it('spring forward (8 Mar 2026): the weekend before computes Monday’s EDT open', () => {
    const s = getUsEquitySession(at('2026-03-07T12:00:00Z'));
    expect(iso(s.next_open_at)).toBe('2026-03-09T13:30:00.000Z');
    expect(iso(s.next_close_at)).toBe('2026-03-09T20:00:00.000Z');
    expect(getUsEquitySession(at('2026-03-09T13:30:00Z')).open).toBe(true);
    expect(getUsEquitySession(at('2026-03-09T13:29:00Z')).open).toBe(false);
  });

  it('fall back (1 Nov 2026): Friday EDT close, Monday EST open', () => {
    expect(getUsEquitySession(at('2026-10-30T19:59:00Z')).open).toBe(true);
    expect(getUsEquitySession(at('2026-10-30T20:00:00Z')).open).toBe(false);
    const s = getUsEquitySession(at('2026-10-31T12:00:00Z'));
    expect(iso(s.next_open_at)).toBe('2026-11-02T14:30:00.000Z');
    expect(iso(s.next_close_at)).toBe('2026-11-02T21:00:00.000Z');
    expect(getUsEquitySession(at('2026-11-02T14:29:00Z')).open).toBe(false);
    expect(getUsEquitySession(at('2026-11-02T20:30:00Z')).open).toBe(true);
  });

  it('on the DST day itself (Sunday 01:59 → 03:00 New York) the market stays closed', () => {
    const s = getUsEquitySession(at('2026-03-08T07:30:00Z'));
    expect(s.reason).toBe('weekend');
    expect(iso(s.next_open_at)).toBe('2026-03-09T13:30:00.000Z');
  });
});

describe('getUsEquitySession — NYSE holidays and early closes', () => {
  it('Thanksgiving is closed; the next day closes early at 13:00 New York', () => {
    const s = getUsEquitySession(at('2026-11-26T16:00:00Z'));
    expect(s).toMatchObject({ open: false, reason: 'holiday', holiday: 'Şükran Günü', next_early_close: true });
    expect(iso(s.next_open_at)).toBe('2026-11-27T14:30:00.000Z');
    expect(iso(s.next_close_at)).toBe('2026-11-27T18:00:00.000Z');

    expect(getUsEquitySession(at('2026-11-27T17:59:00Z'))).toMatchObject({ open: true, early_close: true });
    const after = getUsEquitySession(at('2026-11-27T18:00:00Z'));
    expect(after).toMatchObject({ open: false, reason: 'after_close' });
    expect(iso(after.next_open_at)).toBe('2026-11-30T14:30:00.000Z');
  });

  it('Christmas Eve 2026 closes early; Christmas + weekend → Monday 28 Dec', () => {
    expect(getUsEquitySession(at('2026-12-24T17:00:00Z')).open).toBe(true);
    const s = getUsEquitySession(at('2026-12-24T18:00:00Z'));
    expect(s.open).toBe(false);
    expect(iso(s.next_open_at)).toBe('2026-12-28T14:30:00.000Z');
  });

  it('Good Friday, observed Independence Day and observed holidays on Fridays/Mondays', () => {
    expect(getUsEquitySession(at('2026-04-03T15:00:00Z'))).toMatchObject({ open: false, reason: 'holiday', holiday: 'Kutsal Cuma' });
    expect(iso(getUsEquitySession(at('2026-04-03T15:00:00Z')).next_open_at)).toBe('2026-04-06T13:30:00.000Z');
    expect(getUsEquitySession(at('2026-07-03T15:00:00Z')).reason).toBe('holiday');
    expect(getUsEquitySession(at('2027-06-18T15:00:00Z')).reason).toBe('holiday');
    expect(getUsEquitySession(at('2027-07-05T15:00:00Z')).reason).toBe('holiday');
    expect(getUsEquitySession(at('2027-12-24T15:00:00Z')).reason).toBe('holiday');
  });

  it('New Year: 2027-01-01 closed; 2027-12-31 trades (New Year 2028 on Saturday is not observed)', () => {
    expect(iso(getUsEquitySession(at('2027-01-01T15:00:00Z')).next_open_at)).toBe('2027-01-04T14:30:00.000Z');
    expect(getUsEquitySession(at('2027-12-31T15:00:00Z')).open).toBe(true);
  });

  it('holiday list covers 2026–2027 (10 full-day holidays per year, all on weekdays)', () => {
    for (const year of [2026, 2027]) {
      const days = Object.keys(NYSE_HOLIDAYS).filter((d) => d.startsWith(`${year}-`));
      expect(days).toHaveLength(10);
      for (const d of days) {
        const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
        expect(wd >= 1 && wd <= 5, `${d} hafta içi olmalı`).toBe(true);
      }
    }
    for (const d of Object.keys(NYSE_EARLY_CLOSES)) {
      const [y, m, day] = d.split('-').map(Number);
      expect(isNyseTradingDay({ y, m, d: day })).toBe(true);
    }
    expect(NYSE_CALENDAR_LAST_YEAR).toBe(2027);
  });
});

describe('enforcement + clock', () => {
  const saved = process.env.US_MARKET_HOURS;
  afterEach(() => {
    process.env.US_MARKET_HOURS = saved;
    marketClock.reset();
  });

  it('assertMarketOpenFor: only stocks, only when enforced; 409 MARKET_CLOSED carries next_open_at', () => {
    process.env.US_MARKET_HOURS = '';
    const saturday = at('2026-10-17T15:00:00Z');
    expect(() => assertMarketOpenFor('crypto', saturday)).not.toThrow();
    expect(() => assertMarketOpenFor('currency', saturday)).not.toThrow();
    expect(() => assertMarketOpenFor('commodity', saturday)).not.toThrow();
    let err: unknown;
    try {
      assertMarketOpenFor('stock', saturday);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MarketClosedError);
    expect(err).toMatchObject({ status: 409, code: 'MARKET_CLOSED', details: { next_open_at: '2026-10-19T13:30:00.000Z' } });

    process.env.US_MARKET_HOURS = 'off';
    expect(() => assertMarketOpenFor('stock', saturday)).not.toThrow();
  });

  it('marketClock can be shifted and reset; serializeSession reflects enforcement', () => {
    process.env.US_MARKET_HOURS = '';
    marketClock.set(at('2026-10-17T15:00:00Z'));
    expect(marketClock.isOverridden()).toBe(true);
    expect(Math.abs(marketClock.now().getTime() - Date.parse('2026-10-17T15:00:00Z'))).toBeLessThan(5_000);
    expect(stockMarketState().open).toBe(false);
    expect(serializeSession()).toMatchObject({ open: false, enforced: true, reason: 'weekend', next_open_at: '2026-10-19T13:30:00.000Z' });

    process.env.US_MARKET_HOURS = 'off';
    expect(serializeSession()).toMatchObject({ open: true, enforced: false, reason: null });

    marketClock.reset();
    expect(marketClock.isOverridden()).toBe(false);
  });
});
