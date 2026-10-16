import { describe, expect, it } from 'vitest';
import {
  WeightsError,
  assetKey,
  buildHoldSeries,
  buyCost,
  commissionFor,
  computeValuation,
  effectiveN,
  floorQty,
  herfindahl,
  maxAffordableQuantity,
  maxDrawdownPct,
  normalizeTargetWeights,
  planRebalance,
  sellProceeds,
  sharpeRatio,
  volatilityAnnPct,
  type PlanQuote,
} from '../src/services/sandbox/math';

const q = (entries: [string, number, number?][]) =>
  new Map<string, PlanQuote>(entries.map(([k, price, sell]) => [k, { price, sell_price: sell ?? price }]));

describe('sandbox math: komisyon ve yuvarlama', () => {
  it('komisyon = ceil2(brüt × bps / 10000)', () => {
    expect(commissionFor(10_000, 25)).toBe(25);
    expect(commissionFor(100.01, 25)).toBe(0.26); // 0.250025 → yukarı
    expect(commissionFor(0.01, 25)).toBe(0.01);
    expect(commissionFor(0, 25)).toBe(0);
    expect(commissionFor(1234, 0)).toBe(0);
  });

  it('alış maliyeti / satış neti', () => {
    expect(buyCost(50, 200, 25)).toEqual({ gross: 10_000, commission: 25, total: 10_025 });
    expect(sellProceeds(50, 200, 25)).toEqual({ gross: 10_000, commission: 25, net: 9_975 });
  });

  it('miktar 1e-8’e aşağı yuvarlanır', () => {
    expect(floorQty(0.123456789)).toBe(0.12345678);
    expect(floorQty(1 / 3)).toBe(0.33333333);
  });

  it('maxAffordableQuantity komisyon dahil nakdi aşmaz', () => {
    for (const [cash, price] of [
      [100_000, 187.37],
      [1234.56, 0.0731],
      [99.99, 64_123.5],
    ]) {
      const qty = maxAffordableQuantity(cash, price, 25);
      expect(buyCost(qty, price, 25).total).toBeLessThanOrEqual(cash);
      // 1 kuruşluk ek miktar nakdi aşmalı (sıkı sınır)
      expect(buyCost(qty + 0.02 / price, price, 25).total).toBeGreaterThan(cash - 0.05);
    }
  });
});

describe('sandbox math: hedef ağırlıklar', () => {
  it('toplam %100 olmalı', () => {
    expect(() =>
      normalizeTargetWeights({ weights: [{ asset_type: 'stock', symbol: 'aapl', weight: 50 }], cash_weight: 40 })
    ).toThrow(WeightsError);
    const ok = normalizeTargetWeights({
      weights: [
        { asset_type: 'stock', symbol: 'aapl', weight: 33.33 },
        { asset_type: 'crypto', symbol: 'btc', weight: 33.33 },
        { asset_type: 'stock', symbol: 'msft', weight: 0 },
      ],
      cash_weight: 33.34,
    });
    expect(ok.weights.map((w) => w.symbol)).toEqual(['AAPL', 'BTC']); // 0 ağırlık atılır, büyük harf
    expect(ok.cash_weight).toBe(33.34);
  });

  it('USD nakittir, tekrar eden ve negatif ağırlık reddedilir', () => {
    expect(() => normalizeTargetWeights({ weights: [{ asset_type: 'currency', symbol: 'USD', weight: 10 }], cash_weight: 90 })).toThrow(/nakit/);
    expect(() =>
      normalizeTargetWeights({
        weights: [
          { asset_type: 'stock', symbol: 'AAPL', weight: 10 },
          { asset_type: 'stock', symbol: 'aapl', weight: 10 },
        ],
        cash_weight: 80,
      })
    ).toThrow(/birden fazla/);
    expect(() => normalizeTargetWeights({ weights: [{ asset_type: 'stock', symbol: 'AAPL', weight: -5 }], cash_weight: 105 })).toThrow(WeightsError);
  });
});

describe('sandbox math: yeniden dengeleme planı', () => {
  const quotes = q([
    ['stock:AAA', 100],
    ['crypto:BBB', 25_000],
    ['currency:EUR', 1.1, 1.075],
  ]);

  it('tamamı nakitten: alışlar hedefe yakın, nakit ≥ 0, komisyon toplamı tutarlı', () => {
    const plan = planRebalance({
      cash: 100_000,
      holdings: [],
      quotes,
      targets: normalizeTargetWeights({
        weights: [
          { asset_type: 'stock', symbol: 'AAA', weight: 50 },
          { asset_type: 'crypto', symbol: 'BBB', weight: 30 },
          { asset_type: 'currency', symbol: 'EUR', weight: 20 },
        ],
        cash_weight: 0,
      }),
      bps: 25,
    });
    expect(plan.trades.every((t) => t.side === 'buy')).toBe(true);
    const spent = plan.trades.reduce((s, t) => s + t.gross + t.commission, 0);
    expect(plan.cash_after).toBeGreaterThanOrEqual(0);
    expect(plan.cash_after).toBeCloseTo(100_000 - spent, 2);
    expect(plan.total_commission).toBeCloseTo(plan.trades.reduce((s, t) => s + t.commission, 0), 2);
    // %0 nakit hedefinde komisyon için orantılı küçültme: ağırlıklar hedefin hemen altında, nakit < %0,5
    expect(plan.cash_weight_after).toBeLessThan(0.5);
    const w = new Map(plan.weights_after.map((x) => [x.symbol, x.weight]));
    expect(w.get('AAA')).toBeCloseTo(50, 0);
    expect(w.get('BBB')).toBeCloseTo(30, 0);
  });

  it('önce satışlar, hedefte olmayan pozisyon tamamen kapanır; artan nakitte kalır', () => {
    const plan = planRebalance({
      cash: 1_000,
      holdings: [
        { asset_type: 'stock', symbol: 'AAA', quantity: 600 }, // 60.000
        { asset_type: 'currency', symbol: 'EUR', quantity: 35_000 }, // 38.500
      ],
      quotes,
      targets: normalizeTargetWeights({
        weights: [
          { asset_type: 'stock', symbol: 'AAA', weight: 40 },
          { asset_type: 'crypto', symbol: 'BBB', weight: 40 },
        ],
        cash_weight: 20,
      }),
      bps: 25,
    });
    const sides = plan.trades.map((t) => t.side);
    expect(sides.indexOf('buy')).toBeGreaterThan(sides.lastIndexOf('sell'));
    const eur = plan.trades.find((t) => t.symbol === 'EUR')!;
    expect(eur).toMatchObject({ side: 'sell', quantity: 35_000, all: true, price: 1.075 }); // satış kuru
    expect(plan.weights_after.find((x) => x.symbol === 'EUR')).toBeUndefined();
    expect(plan.cash_weight_after).toBeGreaterThanOrEqual(19.5);
    expect(plan.cash_after).toBeGreaterThan(0);
  });

  it('1 USD altındaki farklar işlem üretmez', () => {
    const plan = planRebalance({
      cash: 0.5,
      holdings: [{ asset_type: 'stock', symbol: 'AAA', quantity: 1 }],
      quotes,
      targets: normalizeTargetWeights({ weights: [{ asset_type: 'stock', symbol: 'AAA', weight: 100 }], cash_weight: 0 }),
      bps: 25,
    });
    expect(plan.trades).toEqual([]);
  });
});

describe('sandbox math: değerleme ve katkı', () => {
  it('katkıların toplamı (kapanmışlar dahil) toplam getiriye eşit', () => {
    // 100.000 başlangıç: AAA 50 adet @200 alındı (10.025), BBB alındı 5.012,5 ve 6.000'e satıldı (net 5.985)
    const cash = 100_000 - 10_025 - 5_012.5 + 5_985;
    const v = computeValuation({
      cash,
      starting_cash: 100_000,
      holdings: [{ asset_type: 'stock', symbol: 'AAA', name: 'AAA', quantity: 50, avg_cost_usd: 200, price_usd: 220, stale: false }],
      aggregates: [
        { asset_type: 'stock', symbol: 'AAA', buy_total: 10_025, sell_net: 0 },
        { asset_type: 'crypto', symbol: 'BBB', name: 'Bee', buy_total: 5_012.5, sell_net: 5_985 },
      ],
      target: { weights: [{ asset_type: 'stock', symbol: 'AAA', weight: 10 }], cash_weight: 90 },
      commission_paid: 25 + 12.5 + 15,
    });
    expect(v.equity_usd).toBeCloseTo(cash + 11_000, 2);
    const aaa = v.holdings[0];
    expect(aaa.value_usd).toBe(11_000);
    expect(aaa.pnl_usd).toBe(1_000);
    expect(aaa.pnl_pct).toBe(10);
    expect(aaa.contribution_usd).toBe(975); // 11.000 − 10.025
    expect(aaa.target_weight).toBe(10);
    expect(aaa.drift).toBeCloseTo(aaa.weight - 10, 2);
    expect(v.closed).toEqual([{ asset_type: 'crypto', symbol: 'BBB', name: 'Bee', contribution_usd: 972.5, contribution_pct: 0.9725 }]);
    const sum = v.holdings.reduce((s, h) => s + h.contribution_pct, 0) + v.closed_contribution_pct;
    expect(sum).toBeCloseTo(v.return_pct, 3);
    expect(v.by_class.map((c) => c.asset_class)).toEqual(['hisse', 'nakit']);
    expect(v.by_class.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(100, 1);
  });

  it('fiyatı olmayan pozisyon maliyetten değerlenir ve stale işaretlenir', () => {
    const v = computeValuation({
      cash: 0,
      starting_cash: 1_000,
      holdings: [{ asset_type: 'stock', symbol: 'X', name: 'X', quantity: 10, avg_cost_usd: 100, price_usd: null, stale: true }],
      aggregates: [],
      target: null,
    });
    expect(v.equity_usd).toBe(1_000);
    expect(v.stale).toBe(true);
    expect(v.holdings[0].target_weight).toBeNull();
  });
});

describe('sandbox math: risk metrikleri', () => {
  it('düz seri: oynaklık 0, düşüş 0, Sharpe null', () => {
    const flat = Array(10).fill(100);
    expect(volatilityAnnPct(flat)).toBe(0);
    expect(maxDrawdownPct(flat)).toBe(0);
    expect(sharpeRatio(flat)).toBeNull();
  });

  it('en büyük düşüş tepe → dip, pozitif yüzde', () => {
    expect(maxDrawdownPct([100, 120, 90, 130, 117])).toBe(25);
  });

  it('az veri → null', () => {
    expect(volatilityAnnPct([100, 101, 102])).toBeNull();
    expect(maxDrawdownPct([100])).toBeNull();
  });

  it('HHI ve etkin varlık sayısı (nakit dahil)', () => {
    expect(herfindahl([25, 25, 25, 25])).toBe(0.25);
    expect(effectiveN(herfindahl([25, 25, 25, 25]))).toBe(4);
    expect(herfindahl([0, 100])).toBe(1);
    expect(herfindahl([])).toBe(1);
  });

  it('sabit miktarlı seri: eksik günler önceki değerle doldurulur, ortak başlangıçtan itibaren', () => {
    const series = new Map([
      [assetKey('stock', 'A'), [{ t: 1, v: 10 }, { t: 3, v: 12 }]],
      [assetKey('crypto', 'B'), [{ t: 0, v: 1 }, { t: 1, v: 2 }, { t: 2, v: 3 }, { t: 3, v: 4 }]],
    ]);
    const pts = buildHoldSeries(series, new Map([[assetKey('stock', 'A'), 2], [assetKey('crypto', 'B'), 1]]), 5);
    expect(pts).toEqual([
      { t: 1, v: 5 + 20 + 2 },
      { t: 2, v: 5 + 20 + 3 },
      { t: 3, v: 5 + 24 + 4 },
    ]);
  });
});
