import { describe, expect, it } from 'vitest';
import {
  PathCache,
  anchorLayout,
  buildPath,
  buildRoundPaths,
  downsample,
  pickWindows,
  realizedHourlyVol,
} from '../src/services/arena/paths';
import { getInstrument, quoteAt, spreadAt } from '../src/services/arena/instruments';
import {
  closePrice,
  equityOf,
  findTrigger,
  liquidationPrice,
  openPrice,
  positionPnl,
  quantityFor,
  rankEntries,
  validateStops,
  type TriggerPosition,
} from '../src/services/arena/engine';

const HOUR = 3_600_000;

/** 36+ saatlik sentetik gerçek nokta */
function hourly(n: number, base: number, startMs = Date.UTC(2026, 9, 1), amp = 0.01): { t: number; p: number }[] {
  return Array.from({ length: n }, (_, i) => ({ t: startMs + i * HOUR, p: base * (1 + amp * Math.sin(i / 3) + 0.002 * i) }));
}

describe('Arena fiyat yolu (paths)', () => {
  const series = new Map<string, { t: number; p: number }[]>([
    ['BTCUSD', hourly(80, 118_000)],
    ['XAUUSD', hourly(80, 2650, Date.UTC(2026, 9, 1), 0.004)],
  ]);

  it('pickWindows: deterministik, 36 ardışık nokta, ortak zaman aralığı', () => {
    const a = pickWindows(series, 12345);
    const b = pickWindows(series, 12345);
    expect(a).toEqual(b);
    expect(a.BTCUSD.points).toHaveLength(36);
    expect(a.XAUUSD.points).toHaveLength(36);
    // Aynı zaman damgaları (enstrümanlar zamanda birlikte hareket eder)
    expect(a.BTCUSD.points.map((p) => p[0])).toEqual(a.XAUUSD.points.map((p) => p[0]));
    expect(a.BTCUSD.from).toBe(new Date(a.BTCUSD.points[0][0] * 1000).toISOString());
    const ts = a.BTCUSD.points.map((p) => p[0]);
    expect(ts.every((t, i) => i === 0 || t - ts[i - 1] === 3600)).toBe(true);
    // Farklı tohum genelde farklı pencere
    const others = [1, 2, 3, 4, 5].map((s) => pickWindows(series, s).BTCUSD.from);
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it('pickWindows: ortak zaman yetersizse her enstrüman kendi penceresini alır; <2 nokta atlanır', () => {
    const s = new Map([
      ['A', hourly(40, 10)],
      ['B', hourly(40, 20, Date.UTC(2026, 8, 1))],
      ['C', hourly(1, 5)],
    ]);
    const w = pickWindows(s, 7);
    expect(Object.keys(w).sort()).toEqual(['A', 'B']);
    expect(w.A.points).toHaveLength(36);
    expect(w.B.points).toHaveLength(36);
  });

  it('buildPath: tick sayısı, deterministik, gerçek noktalardan TAM geçer', () => {
    const w = pickWindows(series, 99);
    for (const duration of [60, 180, 300, 600]) {
      const path = buildPath(w.BTCUSD.points, duration, 99, 'BTCUSD');
      expect(path).toHaveLength(duration + 1);
      expect(buildPath(w.BTCUSD.points, duration, 99, 'BTCUSD')).toEqual(path);
      expect(buildPath(w.BTCUSD.points, duration, 100, 'BTCUSD')).not.toEqual(path);
      const { ticks, indices } = anchorLayout(w.BTCUSD.points.length, duration);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBe(duration);
      indices.forEach((idx, j) => expect(path[ticks[j]]).toBe(w.BTCUSD.points[idx][1]));
      expect(path.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
  });

  it('buildPath: köprü oynaklığı makul (tick-tick hareket saatlik oynaklığı aşmaz)', () => {
    const w = pickWindows(series, 5);
    const prices = w.BTCUSD.points.map((p) => p[1]);
    const vol = realizedHourlyVol(prices);
    const path = buildPath(w.BTCUSD.points, 600, 5, 'BTCUSD');
    const moves = path.slice(1).map((v, i) => Math.abs(Math.log(v / path[i])));
    const maxMove = Math.max(...moves);
    expect(maxMove).toBeLessThan(vol * 3 + 0.02);
    // Köprü düz çizgi değil
    const anchors = new Set(anchorLayout(prices.length, 600).ticks);
    const between = path.filter((_, i) => !anchors.has(i));
    expect(new Set(between.map((v) => v.toFixed(6))).size).toBeGreaterThan(100);
  });

  it('çok kısa turda noktalar alt kümeye iner; uçlar korunur', () => {
    const w = pickWindows(series, 3);
    const path = buildPath(w.XAUUSD.points, 10, 3, 'XAUUSD');
    expect(path).toHaveLength(11);
    expect(path[0]).toBe(w.XAUUSD.points[0][1]);
    expect(path[10]).toBe(w.XAUUSD.points[35][1]);
  });

  it('buildRoundPaths + PathCache (LRU)', () => {
    const w = pickWindows(series, 42);
    const paths = buildRoundPaths(w, 60, '42');
    expect([...paths.keys()].sort()).toEqual(['BTCUSD', 'XAUUSD']);
    // BIGINT tohum string olarak gelse de aynı yol
    expect(buildRoundPaths(w, 60, 42).get('BTCUSD')).toEqual(paths.get('BTCUSD'));
    const cache = new PathCache(2);
    cache.set('a', paths);
    cache.set('b', paths);
    cache.get('a');
    cache.set('c', paths);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(paths);
    expect(cache.size).toBe(2);
  });

  it('downsample ≤ 300 nokta, ilk/son korunur, tick indeksleri döner', () => {
    const v = Array.from({ length: 601 }, (_, i) => i);
    const d = downsample(v);
    expect(d.values.length).toBeLessThanOrEqual(300);
    expect(d.ticks[0]).toBe(0);
    expect(d.ticks.at(-1)).toBe(600);
    expect(d.values).toEqual(d.ticks);
    const small = downsample([1, 2, 3]);
    expect(small).toEqual({ values: [1, 2, 3], ticks: [0, 1, 2] });
  });

  it('bid/ask = mid ∓ spread/2 (EURUSD mutlak, diğerleri oransal)', () => {
    const eur = getInstrument('EURUSD')!;
    const q = quoteAt(eur, 1.165);
    expect(q.ask - q.bid).toBeCloseTo(0.0001, 12);
    expect((q.ask + q.bid) / 2).toBeCloseTo(1.165, 12);
    const xau = getInstrument('xauusd')!;
    expect(spreadAt(xau, 2650)).toBeCloseTo(2650 * 0.0003, 10);
    const btc = quoteAt(getInstrument('BTCUSD')!, 100_000);
    expect(btc.bid).toBeCloseTo(99_975, 6);
    expect(btc.ask).toBeCloseTo(100_025, 6);
  });
});

describe('Arena işlem matematiği (engine)', () => {
  const q = { bid: 99, ask: 101, mid: 100 };

  it('uzun: ask ile açılır, bid ile kapanır; kısa: bid / ask', () => {
    expect(openPrice('long', q)).toBe(101);
    expect(closePrice('long', q)).toBe(99);
    expect(openPrice('short', q)).toBe(99);
    expect(closePrice('short', q)).toBe(101);
  });

  it('pnl: uzun/kısa, nakit akışı ve en fazla kayıp = tutar', () => {
    const qtyL = quantityFor(1000, 100);
    expect(qtyL).toBe(10);
    expect(positionPnl('long', 100, 110, qtyL, 1000)).toBe(100);
    expect(positionPnl('long', 100, 95, qtyL, 1000)).toBe(-50);
    expect(positionPnl('short', 100, 90, qtyL, 1000)).toBe(100);
    expect(positionPnl('short', 100, 104, qtyL, 1000)).toBe(-40);
    // Kısa pozisyon fiyat 3 katına çıksa da kayıp tutarla sınırlı
    expect(positionPnl('short', 100, 300, qtyL, 1000)).toBe(-1000);
    // Nakit: 10.000 − 1.000 (açılış) + 1.000 + pnl
    const cash = 10_000 - 1000 + 1000 + positionPnl('long', 100, 110, qtyL, 1000);
    expect(cash).toBe(10_100);
    expect(liquidationPrice('short', 100, 1000, qtyL)).toBe(200);
    expect(liquidationPrice('long', 100, 1000, qtyL)).toBe(0);
  });

  it('equityOf ve rankEntries (getiri ↓, işlem ↑, katılım ↑)', () => {
    const eq = equityOf(9000, [{ side: 'long', instrument: 'X', entry_price: 100, qty: 10, amount: 1000 }], () => ({ bid: 110, ask: 111, mid: 110.5 }));
    expect(eq).toBe(10_100);
    const ranked = rankEntries([
      { user_id: 'a', return_pct: 1, trades_count: 5, joined_at: 1 },
      { user_id: 'b', return_pct: 2, trades_count: 9, joined_at: 2 },
      { user_id: 'c', return_pct: 1, trades_count: 3, joined_at: 3 },
      { user_id: 'd', return_pct: 1, trades_count: 3, joined_at: 0 },
    ]);
    expect(ranked.map((r) => [r.user_id, r.rank])).toEqual([
      ['b', 1],
      ['d', 2],
      ['c', 3],
      ['a', 4],
    ]);
  });

  it('validateStops: uzun SL < fiyat < TP, kısa TP < fiyat < SL', () => {
    expect(validateStops('long', 99, 101, 95, 110)).toBeNull();
    expect(validateStops('long', 99, 101, 100, null)).toMatch(/zarar durdur/i);
    expect(validateStops('long', 99, 101, null, 100)).toMatch(/kâr al/i);
    expect(validateStops('short', 101, 99, 110, 90)).toBeNull();
    expect(validateStops('short', 101, 99, 100, null)).toMatch(/zarar durdur/i);
    expect(validateStops('short', 101, 99, null, 99.5)).toMatch(/kâr al/i);
    expect(validateStops('long', 99, 101, -1, null)).toMatch(/pozitif/);
  });

  it('findTrigger: atlanan tick\'ler arasında İLK dokunuş kazanır, dolum tetik fiyatından', () => {
    // bid yolu: 100, 99, 98, 103, 96 … (tick 0..)
    const bids = [100, 99.5, 98, 103, 96, 104];
    const quote = (t: number) => ({ bid: bids[t], ask: bids[t] + 1, mid: bids[t] + 0.5 });
    const base: TriggerPosition = { side: 'long', entry_price: 101, qty: 10, amount: 1010, stop_loss: 97, take_profit: 102.5, last_checked_tick: 0 };
    // TP (tick 3) SL'den (tick 4) önce gelir — tick'ler tek seferde taransa da
    expect(findTrigger(base, 0, 5, quote)).toEqual({ tick: 3, price: 102.5, reason: 'tp' });
    // last_checked_tick 3 ise tick 4'teki SL
    expect(findTrigger({ ...base, last_checked_tick: 3 }, 3, 5, quote)).toEqual({ tick: 4, price: 97, reason: 'sl' });
    // SL 98'de: tick 2'de bid = 98 → dokunuş (≤)
    expect(findTrigger({ ...base, stop_loss: 98 }, 0, 5, quote)).toEqual({ tick: 2, price: 98, reason: 'sl' });
    // Henüz tetik yok
    expect(findTrigger(base, 0, 2, quote)).toBeNull();
    // Kısa: ask ile kontrol (SL ask ≥ SL, TP ask ≤ TP)
    const short: TriggerPosition = { side: 'short', entry_price: 100, qty: 10, amount: 1000, stop_loss: 104, take_profit: 97.5, last_checked_tick: 0 };
    expect(findTrigger(short, 0, 5, quote)).toEqual({ tick: 3, price: 104, reason: 'sl' });
    expect(findTrigger({ ...short, stop_loss: null }, 0, 5, quote)).toEqual({ tick: 4, price: 97.5, reason: 'tp' });
    // Tasfiye: kısa, fiyat 2 katı
    const liq: TriggerPosition = { side: 'short', entry_price: 50, qty: 20, amount: 1000, stop_loss: null, take_profit: null, last_checked_tick: 0 };
    expect(findTrigger(liq, 0, 5, quote)).toEqual({ tick: 1, price: 100, reason: 'liquidated' });
    // SL tasfiyeden daha uzaksa tasfiye önce
    expect(findTrigger({ ...liq, stop_loss: 103 }, 0, 5, quote)?.reason).toBe('liquidated');
  });
});

describe('windowPointsForDuration', () => {
  it('kısa turlarda daha kısa gerçek kesit oynatır, üst sınır 36 saat', async () => {
    const { windowPointsForDuration } = await import('../src/services/arena/paths');
    expect(windowPointsForDuration(60)).toBe(8);
    expect(windowPointsForDuration(300)).toBe(16);
    expect(windowPointsForDuration(600)).toBe(26);
    expect(windowPointsForDuration(3600)).toBe(36);
    expect(windowPointsForDuration(1)).toBe(7);
  });
});
