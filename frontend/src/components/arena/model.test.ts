import { describe, expect, it } from 'vitest';
import type { ArenaPosition, ArenaQuote } from '@/types';
import {
  INITIAL_STORE,
  bestWorst,
  formatClock,
  formatCountdown,
  formatPrice,
  formatRevealRange,
  livePnl,
  pushFeed,
  revealSentence,
  roundReducer,
  seriesFromHistory,
  stopIsValid,
  stopPrice,
  timeToTick,
  toChallengeStatus,
  toRoundState,
} from './model';

const q = (bid: number, ask = bid, change = 0): ArenaQuote => ({ bid, ask, mid: (bid + ask) / 2, change_pct_since_start: change });

const position = (over: Partial<ArenaPosition> = {}): ArenaPosition => ({
  id: 'p1',
  instrument: 'EURUSD',
  side: 'long',
  qty: 1000,
  amount: 1000,
  entry_price: 1,
  stop_loss: null,
  take_profit: null,
  status: 'open',
  current_price: null,
  pnl: 0,
  pnl_pct: 0,
  close_price: null,
  close_reason: null,
  opened_at: '2026-10-10T12:00:10Z',
  closed_at: null,
  ...over,
});

describe('formatClock', () => {
  it('formats remaining time as m:ss, rounding up partial seconds', () => {
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(59_000)).toBe('0:59');
    expect(formatClock(200)).toBe('0:01');
    expect(formatClock(9 * 60_000 + 5_000)).toBe('9:05');
  });

  it('never goes negative and handles hours / bad input', () => {
    expect(formatClock(-5_000)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(3_600_000 + 61_000)).toBe('1:01:01');
  });

  it('formats long countdowns in days / hours / minutes', () => {
    expect(formatCountdown(90_000)).toBe('1:30');
    expect(formatCountdown(2 * 3_600_000 + 15 * 60_000)).toBe('2 sa 15 dk');
    expect(formatCountdown(3 * 3_600_000)).toBe('3 sa');
    expect(formatCountdown(26 * 3_600_000)).toBe('1 gün 2 sa');
    expect(formatCountdown(-1)).toBe('0:00');
  });
});

describe('stopPrice (SL/TP % → absolute price)', () => {
  it('long: stop-loss below, take-profit above the reference', () => {
    expect(stopPrice('long', 'sl', 100, 1, 2)).toBe(99);
    expect(stopPrice('long', 'tp', 100, 2, 2)).toBe(102);
  });

  it('short: stop-loss above, take-profit below the reference', () => {
    expect(stopPrice('short', 'sl', 100, 0.5, 2)).toBe(100.5);
    expect(stopPrice('short', 'tp', 100, 1, 2)).toBe(99);
  });

  it('rounds to the instrument decimals', () => {
    expect(stopPrice('long', 'sl', 1.08452, 0.5, 5)).toBe(1.0791);
    expect(stopPrice('long', 'tp', 64_123.45, 1, 2)).toBe(64_764.68);
  });

  it('validates the side of a manually entered level', () => {
    expect(stopIsValid('long', 'sl', 99, 100)).toBe(true);
    expect(stopIsValid('long', 'sl', 101, 100)).toBe(false);
    expect(stopIsValid('short', 'sl', 101, 100)).toBe(true);
    expect(stopIsValid('short', 'tp', 99, 100)).toBe(true);
    expect(stopIsValid('long', 'tp', Number.NaN, 100)).toBe(false);
  });
});

describe('livePnl', () => {
  it('closes longs at the bid and shorts at the ask', () => {
    expect(livePnl(position({ side: 'long', qty: 10, amount: 1000, entry_price: 100 }), q(101, 102))).toEqual({ current_price: 101, pnl: 10, pnl_pct: 1 });
    expect(livePnl(position({ side: 'short', qty: 10, amount: 1000, entry_price: 100 }), q(97, 98))).toEqual({ current_price: 98, pnl: 20, pnl_pct: 2 });
  });

  it('derives quantity from amount when qty is missing, and returns null without a quote', () => {
    expect(livePnl(position({ qty: 0, amount: 500, entry_price: 50 }), q(55))?.pnl).toBe(50);
    expect(livePnl(position(), undefined)).toBeNull();
  });
});

describe('pushFeed (tick-feed reducer)', () => {
  const prev = { EURUSD: q(1.1), BTC: q(60_000) };

  it('adds one row per changed instrument, newest first, with direction', () => {
    const feed = pushFeed([], prev, { EURUSD: q(1.2), BTC: q(59_000) }, 5, 1000, ['EURUSD', 'BTC']);
    // Aynı tick içindeki satırlar enstrüman sırasını korur
    expect(feed.map((f) => [f.code, f.dir])).toEqual([
      ['EURUSD', 'up'],
      ['BTC', 'down'],
    ]);
    expect(feed[1]).toMatchObject({ id: '5:BTC', tick: 5, at: 1000, bid: 59_000 });
  });

  it('skips unchanged quotes and returns the same array when nothing changed', () => {
    const feed = pushFeed([], prev, { EURUSD: q(1.1), BTC: q(60_000) }, 6, 1000);
    expect(feed).toHaveLength(0);
    const existing = pushFeed([], {}, { EURUSD: q(1.1) }, 1, 1);
    expect(pushFeed(existing, { EURUSD: q(1.1) }, { EURUSD: q(1.1) }, 2, 2)).toBe(existing);
  });

  it('treats the first quote of an instrument as flat and caps the length', () => {
    let feed = pushFeed([], {}, { EURUSD: q(1) }, 1, 0);
    expect(feed[0].dir).toBe('flat');
    for (let i = 2; i < 60; i++) feed = pushFeed(feed, { EURUSD: q(i - 1) }, { EURUSD: q(i) }, i, i, ['EURUSD'], 40);
    expect(feed).toHaveLength(40);
    expect(feed[0].tick).toBe(59);
  });
});

describe('reveal', () => {
  it('formats the real data window in Turkish', () => {
    expect(formatRevealRange({ from: '2026-09-12T00:00:00Z', to: '2026-09-13T23:00:00Z' })).toBe('12–13 Eylül 2026');
    expect(formatRevealRange({ from: '2026-08-30T00:00:00Z', to: '2026-09-02T00:00:00Z' })).toBe('30 Ağustos – 2 Eylül 2026');
    expect(formatRevealRange({ from: '2026-09-12T08:00:00Z', to: '2026-09-12T20:00:00Z' })).toBe('12 Eylül 2026');
    expect(formatRevealRange({ from: 'x', to: 'y' })).toBe('');
  });

  it('builds the end-of-round sentence', () => {
    expect(revealSentence({ from: '2026-09-12T00:00:00Z', to: '2026-09-13T00:00:00Z' }, ['BTC', 'Altın', 'EUR/USD'])).toBe(
      'Bu tur, 12–13 Eylül 2026 arasındaki gerçek BTC, Altın ve EUR/USD hareketinin hızlandırılmış tekrarıydı.',
    );
    expect(revealSentence(null, ['BTC'])).toBeNull();
  });
});

describe('misc helpers', () => {
  it('formats prices with instrument decimals (tr-TR)', () => {
    expect(formatPrice(1.0845, 5)).toBe('1,08450');
    expect(formatPrice(64123.4, 2)).toBe('64.123,40');
    expect(formatPrice(null, 2)).toBe('—');
  });

  it('maps a timestamp to a round tick', () => {
    const round = { starts_at: '2026-10-10T12:00:00Z', duration_s: 60, ticks_total: 120 };
    expect(timeToTick('2026-10-10T12:00:30Z', round)).toBe(60);
    expect(timeToTick('2026-10-10T11:59:00Z', round)).toBe(0);
    expect(timeToTick('2026-10-10T12:05:00Z', round)).toBe(119);
  });

  it('picks the best and worst closed trade', () => {
    const a = position({ id: 'a', pnl: 12 });
    const b = position({ id: 'b', pnl: -30 });
    const c = position({ id: 'c', pnl: 4 });
    expect(bestWorst([a, b, c])).toEqual({ best: a, worst: b });
    expect(bestWorst([a])).toEqual({ best: a, worst: null });
    expect(bestWorst([])).toEqual({ best: null, worst: null });
  });
});

describe('roundReducer', () => {
  const raw = {
    round: {
      id: 'r1',
      kind: 'solo',
      status: 'running',
      starts_at: '2026-10-10T12:00:00Z',
      ends_at: '2026-10-10T12:01:00Z',
      duration_s: 60,
      server_now: '2026-10-10T12:00:10Z',
      tick: 10,
      ticks_total: 60,
      instruments: [{ code: 'EURUSD', label: 'EUR/USD', decimals: 5 }],
    },
    me: { joined: true, cash: 9000, equity: 10_000, return_pct: 0, rank: null, trades_count: 1 },
    quotes: { EURUSD: { bid: 1, ask: 1.0002, mid: 1.0001, change_pct_since_start: 0 } },
    history: { EURUSD: [0.99, 1, 1.0001] },
    positions: { open: [{ id: 'p1', instrument: 'EURUSD', side: 'long', qty: 1000, amount: 1000, entry_price: 1, status: 'open', opened_at: '2026-10-10T12:00:05Z' }], closed: [] },
  };
  const now = Date.parse('2026-10-10T12:00:09Z');
  const snap = roundReducer(INITIAL_STORE, { type: 'snapshot', state: toRoundState(raw), now });

  it('builds the model from a snapshot, aligning history to the current tick', () => {
    const m = snap.model!;
    expect(m.series.EURUSD.map((p) => p.t)).toEqual([8, 9, 10]);
    expect(m.clockOffset).toBe(1000);
    expect(m.open[0].current_price).toBe(1);
  });

  it('uses explicit history ticks when present', () => {
    const s = seriesFromHistory(toRoundState({ ...raw, history: { EURUSD: [1, 2, 3] }, history_ticks: [0, 4, 9] }));
    expect(s.EURUSD).toEqual([
      { t: 0, v: 1 },
      { t: 4, v: 2 },
      { t: 9, v: 3 },
    ]);
  });

  it('applies ticks: appends points, updates P/L and equity, ignores stale ticks', () => {
    const next = roundReducer(snap, { type: 'tick', tick: 11, quotes: { EURUSD: q(1.01, 1.0102) }, now: now + 1000 });
    const m = next.model!;
    expect(m.series.EURUSD.at(-1)).toEqual({ t: 11, v: 1.0101 });
    expect(m.open[0].pnl).toBeCloseTo(10);
    expect(m.me.equity).toBeCloseTo(10_010);
    expect(m.me.return_pct).toBeCloseTo(0.1);
    expect(m.feed[0]).toMatchObject({ code: 'EURUSD', dir: 'up' });
    expect(roundReducer(next, { type: 'tick', tick: 11, quotes: { EURUSD: q(2) }, now })).toBe(next);
  });

  it('moves a closed position out of the open list and ignores late "open" updates for it', () => {
    const closed = roundReducer(snap, { type: 'position', position: position({ id: 'p1', status: 'closed', pnl: 5, close_reason: 'tp' }) });
    expect(closed.model!.open).toHaveLength(0);
    expect(closed.model!.closed[0]).toMatchObject({ id: 'p1', close_reason: 'tp' });
    const late = roundReducer(closed, { type: 'position', position: position({ id: 'p1', status: 'open' }) });
    expect(late.model!.open).toHaveLength(0);
  });

  it('finishes the round on end, keeping server results', () => {
    const ended = roundReducer(snap, {
      type: 'end',
      final: { equity: 10_250, return_pct: 2.5, rank: 3, participants: 40, trades_count: 4 },
      reveal: { from: '2026-09-12T00:00:00Z', to: '2026-09-13T00:00:00Z' },
    });
    expect(ended.model!.round.status).toBe('finished');
    expect(ended.model!.final?.rank).toBe(3);
    expect(ended.model!.round.reveal?.from).toBe('2026-09-12T00:00:00Z');
    // Bitmiş turda tick işlenmez
    expect(roundReducer(ended, { type: 'tick', tick: 99, quotes: {}, now })).toBe(ended);
  });
});

describe('toChallengeStatus', () => {
  it('maps backend round states onto challenge states', () => {
    expect(toChallengeStatus('scheduled')).toBe('upcoming');
    expect(toChallengeStatus('running')).toBe('live');
    expect(toChallengeStatus('cancelled')).toBe('finished');
    expect(toChallengeStatus('live')).toBe('live');
    expect(toChallengeStatus(undefined)).toBe('upcoming');
  });
});

describe('roundReducer — challenge before start', () => {
  it('seeds start prices from the first tick when the snapshot had no quotes', () => {
    const state = toRoundState({
      round: { id: 'c', kind: 'challenge', status: 'scheduled', starts_at: '2026-10-10T12:00:00Z', ends_at: '2026-10-10T12:05:00Z', duration_s: 300, server_now: '2026-10-10T11:59:00Z', tick: 0, ticks_total: 301, instruments: [{ code: 'BTC', label: 'Bitcoin', decimals: 2 }] },
      me: { joined: true, cash: 10_000, equity: 10_000, return_pct: 0 },
      quotes: {},
      history: {},
      history_ticks: [],
      positions: { open: [], closed: [] },
    });
    const s0 = roundReducer(INITIAL_STORE, { type: 'snapshot', state, now: 0 });
    const s1 = roundReducer(s0, { type: 'tick', tick: 0, quotes: { BTC: q(100) }, now: 1 });
    const s2 = roundReducer(s1, { type: 'tick', tick: 1, quotes: { BTC: q(102) }, now: 2 });
    expect(s1.model!.round.status).toBe('running');
    expect(s2.model!.quotes.BTC.change_pct_since_start).toBeCloseTo(2);
    expect(s2.model!.series.BTC.map((p) => p.t)).toEqual([0, 1]);
  });
});
