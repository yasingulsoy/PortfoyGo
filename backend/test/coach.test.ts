import { describe, expect, it } from 'vitest';
import {
  COACH_VERSION,
  SCORE_MAX,
  analyzeRound,
  gradeFor,
  maxDrawdownPct,
  type CoachPositionInput,
  type CoachRoundInput,
} from '../src/services/coach/analyze';

let seq = 0;
function pos(o: Partial<CoachPositionInput> = {}): CoachPositionInput {
  seq++;
  const entry = o.entry_price ?? 100;
  const amount = o.amount ?? 1000;
  return {
    id: `p${seq}`,
    instrument: 'BTCUSD',
    side: 'long',
    amount,
    qty: amount / entry,
    entry_price: entry,
    entry_tick: 0,
    stop_loss: null,
    take_profit: null,
    close_price: 101,
    close_tick: 10,
    pnl: 10,
    close_reason: 'manual',
    ...o,
  };
}

const round = (positions: CoachPositionInput[], extra: Partial<CoachRoundInput> = {}): CoachRoundInput => ({
  duration_s: 60,
  starting_cash: 10_000,
  instruments: ['BTCUSD', 'XAUUSD'],
  positions,
  now: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

const codes = (input: CoachRoundInput) => analyzeRound(input).insights.map((i) => i.code);
const flat = (n: number, v = 100) => new Array(n).fill(v);

describe('coach — did nothing', () => {
  it('0 trades → DID_NOTHING tip, score 0, grade E, empty stats', () => {
    const r = analyzeRound(round([]));
    expect(r.version).toBe(COACH_VERSION);
    expect(r.insights.map((i) => i.code)).toEqual(['DID_NOTHING']);
    expect(r.insights[0].type).toBe('tip');
    expect(r.score).toBe(0);
    expect(r.grade).toBe('E');
    expect(r.headline).toMatch(/işlem açmadın/);
    expect(r.stats).toMatchObject({
      trades: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
      avg_hold_s: 0,
      sl_usage_pct: 0,
      tp_usage_pct: 0,
      best_trade: null,
      worst_trade: null,
      max_drawdown_pct: 0,
      trades_per_min: 0,
      instruments_used: [],
    });
    expect(r.generated_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('coach — rules', () => {
  it('TIGHT_STOP: SL hit within ≤ 3 ticks of entry', () => {
    const hit = pos({ entry_tick: 5, close_tick: 8, close_reason: 'sl', stop_loss: 99.5, close_price: 99.5, pnl: -5 });
    const r = analyzeRound(round([hit]));
    const ins = r.insights.find((i) => i.code === 'TIGHT_STOP')!;
    expect(ins.type).toBe('warning');
    expect(ins.refs).toEqual([hit.id]);
    expect(codes(round([pos({ entry_tick: 5, close_tick: 9, close_reason: 'sl', stop_loss: 99.5, close_price: 99.5, pnl: -5 })]))).not.toContain(
      'TIGHT_STOP'
    );
    // Elle kapanış sıkı stop sayılmaz
    expect(codes(round([pos({ entry_tick: 5, close_tick: 6, pnl: -5, close_price: 99.5 })]))).not.toContain('TIGHT_STOP');
  });

  it('NO_STOP_ON_LOSERS: only losing trades without a stop', () => {
    expect(codes(round([pos({ pnl: -20, close_price: 98 })]))).toContain('NO_STOP_ON_LOSERS');
    expect(codes(round([pos({ pnl: -20, close_price: 98, stop_loss: 98 })]))).not.toContain('NO_STOP_ON_LOSERS');
    expect(codes(round([pos({ pnl: 20, close_price: 102 })]))).not.toContain('NO_STOP_ON_LOSERS');
  });

  it('LIQUIDATED warning', () => {
    const r = analyzeRound(round([pos({ pnl: -1000, close_reason: 'liquidated', close_price: 0.01 })]));
    expect(r.insights.find((i) => i.code === 'LIQUIDATED')?.type).toBe('warning');
  });

  it('EARLY_PROFIT_TAKING: price ran ≥ 2× the captured move within the next 20% of the round (needs path)', () => {
    // Uzun: 100'den girdi, tick 10'da 101'den kapattı (+1); sonraki 12 tick içinde fiyat 104'e çıktı (+3 ≥ 2×1)
    const path = [...flat(11, 100), 101, 102, 103, 104, 104, ...flat(45, 104)];
    expect(path.length).toBe(61);
    const p = pos({ close_tick: 10, close_price: 101, pnl: 10 });
    const r = analyzeRound(round([p], { paths: { BTCUSD: path } }));
    const ins = r.insights.find((i) => i.code === 'EARLY_PROFIT_TAKING')!;
    expect(ins.type).toBe('tip');
    expect(ins.refs).toEqual([p.id]);
    expect(r.path_available).toBe(true);

    // Yol yoksa kural çalışmaz
    expect(codes(round([p]))).not.toContain('EARLY_PROFIT_TAKING');
    // Hareket 2 katın altında (+1.5)
    const small = [...flat(11, 100), 101.5, ...flat(49, 102.5)];
    expect(codes(round([p], { paths: { BTCUSD: small } }))).not.toContain('EARLY_PROFIT_TAKING');
    // Hareket pencereden (12 tick) sonra
    const late = [...flat(11, 100), ...flat(13, 101), ...flat(37, 110)];
    expect(codes(round([p], { paths: { BTCUSD: late } }))).not.toContain('EARLY_PROFIT_TAKING');
    // Kısa pozisyon: fiyat düşmeye devam etti
    const short = pos({ side: 'short', close_price: 99, pnl: 10 });
    const down = [...flat(11, 100), 99, 98, 97, 96, ...flat(46, 96)];
    expect(codes(round([short], { paths: { BTCUSD: down } }))).toContain('EARLY_PROFIT_TAKING');
    // Tur sonu kapanışı sayılmaz
    expect(codes(round([pos({ close_tick: 10, close_reason: 'round_end' })], { paths: { BTCUSD: path } }))).not.toContain(
      'EARLY_PROFIT_TAKING'
    );
  });

  it('OVERTRADING: > 3 trades per minute', () => {
    const many = [0, 5, 10, 15].map((t) => pos({ entry_tick: t, close_tick: t + 3, stop_loss: 90 }));
    const r = analyzeRound(round(many));
    expect(r.stats.trades_per_min).toBe(4);
    expect(r.insights.find((i) => i.code === 'OVERTRADING')?.type).toBe('warning');
    expect(codes(round(many.slice(0, 3)))).not.toContain('OVERTRADING');
    // 3 dakikalık turda 4 işlem = 1,33/dk
    expect(codes(round(many, { duration_s: 180 }))).not.toContain('OVERTRADING');
  });

  it('REVENGE_TRADING: new trade ≤ 3 ticks after a loss with ≥ 1.5× the amount', () => {
    const loss = pos({ entry_tick: 0, close_tick: 10, pnl: -15, close_price: 98.5, amount: 1000, stop_loss: 98.5 });
    const revenge = pos({ entry_tick: 12, close_tick: 30, amount: 1500, stop_loss: 90 });
    const r = analyzeRound(round([loss, revenge]));
    const ins = r.insights.find((i) => i.code === 'REVENGE_TRADING')!;
    expect(ins.type).toBe('warning');
    expect(ins.refs).toEqual([revenge.id]);
    expect(codes(round([loss, pos({ entry_tick: 12, amount: 1400, close_tick: 30 })]))).not.toContain('REVENGE_TRADING');
    expect(codes(round([loss, pos({ entry_tick: 14, amount: 3000, close_tick: 30 })]))).not.toContain('REVENGE_TRADING');
    // Kayıptan ÖNCE açılan işlem sayılmaz
    expect(codes(round([loss, pos({ entry_tick: 8, amount: 3000, close_tick: 30 })]))).not.toContain('REVENGE_TRADING');
  });

  it('CONCENTRATION: > 80% of committed amount in one instrument (only when the round offers ≥ 2)', () => {
    const a = pos({ amount: 1000 });
    const b = pos({ amount: 1000, entry_tick: 20, close_tick: 30 });
    const r = analyzeRound(round([a, b], { labels: { BTCUSD: 'Bitcoin' } }));
    const ins = r.insights.find((i) => i.code === 'CONCENTRATION')!;
    expect(ins.type).toBe('tip');
    expect(ins.detail).toContain('%100');
    expect(ins.detail).toContain('Bitcoin');
    expect(codes(round([a, b], { instruments: ['BTCUSD'] }))).not.toContain('CONCENTRATION');
    expect(codes(round([a]))).not.toContain('CONCENTRATION');
    const x = pos({ instrument: 'XAUUSD', amount: 300, entry_tick: 20, close_tick: 30 });
    expect(codes(round([a, x]))).not.toContain('CONCENTRATION'); // %77
  });

  it('GOOD_RISK_REWARD and POOR_RISK_REWARD', () => {
    const good = [pos({ pnl: 30 }), pos({ pnl: 30, entry_tick: 20, close_tick: 30 }), pos({ pnl: -10, close_price: 99, entry_tick: 35, close_tick: 40 })];
    const r = analyzeRound(round(good));
    expect(r.insights.find((i) => i.code === 'GOOD_RISK_REWARD')?.type).toBe('good');
    expect(r.insights.find((i) => i.code === 'GOOD_RISK_REWARD')?.detail).toMatch(/3 katı/);
    const poor = [pos({ pnl: 10 }), pos({ pnl: -20, close_price: 98, entry_tick: 20, close_tick: 30 })];
    const p = analyzeRound(round(poor));
    expect(p.insights.find((i) => i.code === 'POOR_RISK_REWARD')?.type).toBe('tip');
    expect(p.insights.map((i) => i.code)).not.toContain('GOOD_RISK_REWARD');
    // Kayıp yoksa oran hesaplanmaz
    expect(codes(round([pos({ pnl: 30 })]))).not.toContain('GOOD_RISK_REWARD');
  });

  it('CONSISTENT_WINS: several small wins, not one lucky trade', () => {
    const steady = [10, 12, 9, 11].map((pnl, i) => pos({ pnl, entry_tick: i * 12, close_tick: i * 12 + 5 }));
    steady.push(pos({ pnl: -5, close_price: 99.5, entry_tick: 50, close_tick: 55 }));
    expect(analyzeRound(round(steady, { duration_s: 180 })).insights.find((i) => i.code === 'CONSISTENT_WINS')?.type).toBe('good');
    const lucky = [100, 5, 5].map((pnl, i) => pos({ pnl, entry_tick: i * 15, close_tick: i * 15 + 5 }));
    expect(codes(round(lucky))).not.toContain('CONSISTENT_WINS');
    const fewWins = [10, 12].map((pnl, i) => pos({ pnl, entry_tick: i * 15, close_tick: i * 15 + 5 }));
    expect(codes(round(fewWins))).not.toContain('CONSISTENT_WINS');
  });

  it('STOPS_DISCIPLINE when every trade had a stop', () => {
    expect(codes(round([pos({ stop_loss: 95 }), pos({ stop_loss: 95, entry_tick: 20, close_tick: 30 })]))).toContain('STOPS_DISCIPLINE');
    expect(codes(round([pos({ stop_loss: 95 }), pos({ entry_tick: 20, close_tick: 30 })]))).not.toContain('STOPS_DISCIPLINE');
  });

  it('every insight has Turkish copy; order is good → warning → tip', () => {
    const mixed = [
      pos({ stop_loss: 90, pnl: 30 }),
      pos({ entry_tick: 10, close_tick: 12, close_reason: 'sl', stop_loss: 99.9, pnl: -10, close_price: 99 }),
      pos({ entry_tick: 13, close_tick: 20, amount: 2000, stop_loss: 90, pnl: 5 }),
    ];
    const r = analyzeRound(round(mixed));
    const types = r.insights.map((i) => i.type);
    const rank = { good: 0, warning: 1, tip: 2 } as const;
    for (let i = 1; i < types.length; i++) expect(rank[types[i]]).toBeGreaterThanOrEqual(rank[types[i - 1]]);
    expect(r.insights.length).toBeGreaterThanOrEqual(3);
    for (const ins of r.insights) {
      expect(ins.title.length).toBeGreaterThan(5);
      expect(ins.detail.length).toBeGreaterThan(20);
      expect(ins.why.length).toBeGreaterThan(20);
    }
  });
});

describe('coach — stats', () => {
  it('computes trade statistics', () => {
    const ps = [
      pos({ pnl: 40, entry_tick: 0, close_tick: 10, stop_loss: 95, take_profit: 104, close_reason: 'tp' }),
      pos({ pnl: -10, entry_tick: 10, close_tick: 30, instrument: 'XAUUSD', stop_loss: 99, close_price: 99, close_reason: 'sl' }),
      pos({ pnl: 5, entry_tick: 30, close_tick: 60 }),
    ];
    const r = analyzeRound(round(ps, { return_pct: 0.35 }));
    expect(r.stats).toMatchObject({
      trades: 3,
      wins: 2,
      losses: 1,
      win_rate: 66.7,
      avg_hold_s: 20,
      sl_usage_pct: 66.7,
      tp_usage_pct: 33.3,
      trades_per_min: 3,
      instruments_used: ['BTCUSD', 'XAUUSD'],
      total_pnl: 35,
      return_pct: 0.35,
    });
    expect(r.stats.best_trade).toEqual({ id: ps[0].id, instrument: 'BTCUSD', side: 'long', pnl: 40 });
    expect(r.stats.worst_trade).toEqual({ id: ps[1].id, instrument: 'XAUUSD', side: 'long', pnl: -10 });
  });

  it('max drawdown: realized curve without a path, tick curve with a path', () => {
    const ps = [
      pos({ pnl: 100, close_tick: 10 }),
      pos({ pnl: -300, entry_tick: 10, close_tick: 20, close_price: 70 }),
      pos({ pnl: 50, entry_tick: 20, close_tick: 30 }),
    ];
    // 10000 → 10100 (zirve) → 9800 → 9850: (10100 − 9800) / 10100
    expect(maxDrawdownPct(round(ps))).toBeCloseTo(2.97, 2);

    // Tek uzun pozisyon (qty 10): fiyat 100 → 90 → 100; kapanış 100, pnl 0 → en düşük özsermaye 9900
    const path = [...Array.from({ length: 6 }, (_, i) => 100 - 2 * i), ...Array.from({ length: 5 }, (_, i) => 92 + 2 * (i + 1)), ...flat(50, 100)];
    const one = pos({ amount: 1000, entry_price: 100, close_price: 100, pnl: 0, close_tick: 10 });
    expect(maxDrawdownPct(round([one], { paths: new Map([['BTCUSD', path]]) }))).toBeCloseTo(1, 5);
    expect(maxDrawdownPct(round([]))).toBe(0);
  });

  it('derives pnl from the path when missing', () => {
    const path = flat(61, 110);
    const r = analyzeRound(round([pos({ pnl: null, close_price: null, close_tick: null, close_reason: null })], { paths: { BTCUSD: path } }));
    expect(r.stats.total_pnl).toBeCloseTo(100, 6); // qty 10 × (110 − 100)
  });
});

describe('coach — score and grade', () => {
  it('grade bands', () => {
    expect(gradeFor(100)).toBe('A');
    expect(gradeFor(85)).toBe('A');
    expect(gradeFor(84)).toBe('B');
    expect(gradeFor(70)).toBe('B');
    expect(gradeFor(69)).toBe('C');
    expect(gradeFor(55)).toBe('C');
    expect(gradeFor(54)).toBe('D');
    expect(gradeFor(40)).toBe('D');
    expect(gradeFor(39)).toBe('E');
    expect(gradeFor(0)).toBe('E');
  });

  it('a disciplined profitable round scores A; breakdown sums to the score and respects maxima', () => {
    const ps = [
      pos({ pnl: 60, stop_loss: 97, take_profit: 106, close_reason: 'tp', close_price: 106 }),
      pos({ pnl: 45, entry_tick: 20, close_tick: 35, stop_loss: 97, instrument: 'XAUUSD' }),
      pos({ pnl: -20, entry_tick: 40, close_tick: 50, stop_loss: 98, close_reason: 'sl', close_price: 98 }),
    ];
    const r = analyzeRound(round(ps, { return_pct: 0.85 }));
    expect(r.grade).toBe('A');
    expect(r.score).toBeGreaterThanOrEqual(85);
    const b = r.breakdown;
    expect(Math.abs(b.risk + b.discipline + b.quality + b.result - r.score)).toBeLessThanOrEqual(0.5);
    expect(b.risk).toBeLessThanOrEqual(SCORE_MAX.risk);
    expect(b.discipline).toBeLessThanOrEqual(SCORE_MAX.discipline);
    expect(b.quality).toBeLessThanOrEqual(SCORE_MAX.quality);
    expect(b.result).toBeLessThanOrEqual(SCORE_MAX.result);
    expect(r.headline).toMatch(/Harika/);
  });

  it('a reckless losing round scores E', () => {
    const ps = [
      pos({ pnl: -200, entry_tick: 0, close_tick: 5, close_price: 80 }),
      pos({ pnl: -400, entry_tick: 6, close_tick: 9, amount: 2000, close_price: 80 }),
      pos({ pnl: -1000, entry_tick: 10, close_tick: 12, amount: 4000, close_reason: 'liquidated', close_price: 75 }),
      pos({ pnl: -100, entry_tick: 13, close_tick: 15, amount: 6000, close_price: 98 }),
      pos({ pnl: 5, entry_tick: 16, close_tick: 18, amount: 100 }),
    ];
    const r = analyzeRound(round(ps, { return_pct: -17 }));
    expect(r.grade).toBe('E');
    expect(r.score).toBeLessThan(40);
    const c = r.insights.map((i) => i.code);
    expect(c).toEqual(expect.arrayContaining(['NO_STOP_ON_LOSERS', 'LIQUIDATED', 'OVERTRADING', 'REVENGE_TRADING']));
  });

  it('score is monotone in result: same trades, better return → not lower score', () => {
    const ps = [pos({ stop_loss: 95, pnl: 10 })];
    const lo = analyzeRound(round(ps, { return_pct: -1 })).score;
    const hi = analyzeRound(round(ps, { return_pct: 1 })).score;
    expect(hi).toBeGreaterThan(lo);
  });
});
