import { beforeAll, describe, expect, it } from 'vitest';
import { Sandbox, SandboxPrices } from '../src/services/sandbox';
import { TEST_USD_TRY, createUser, pool, setMarketPrice, uniqueSymbol } from './helpers';

/**
 * Sanal portföy motoru (services/sandbox) — gerçek PGlite üzerinde.
 * Fiyatlar: hisse/kripto market_data_cache (USD), döviz currency_rates (TL) ÷ USD/TRY (40), emtia price_history yedeği.
 */

async function setFx(code: string, buying: number, selling: number) {
  await pool.query(
    `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
     VALUES ($1, $1, $2, $3, 0, CURRENT_TIMESTAMP)
     ON CONFLICT (code) DO UPDATE SET buying = $2, selling = $3, updated_at = CURRENT_TIMESTAMP`,
    [code, buying, selling]
  );
}

async function setCommodityHistory(symbol: string, price: number, currency: 'USD' | 'TRY' = 'USD') {
  await pool.query(
    `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
     VALUES ('commodity', $1, 'hour', date_trunc('hour', now()), $2, $3, now())
     ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price, updated_at = now()`,
    [symbol, price, currency]
  );
}

/** price_history günlük kapanışları (t gün önce … bugün) */
async function setDailyHistory(assetType: string, symbol: string, prices: number[], currency: 'USD' | 'TRY' = 'USD') {
  const n = prices.length;
  for (let i = 0; i < n; i++) {
    await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       VALUES ($1, $2, 'day', date_trunc('day', now()) - ($3::int * INTERVAL '1 day'), $4, $5, now())
       ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price`,
      [assetType, symbol, n - 1 - i, prices[i], currency]
    );
  }
}

const cashOf = async (id: string) => parseFloat((await pool.query('SELECT cash FROM sandbox_portfolios WHERE id = $1', [id])).rows[0].cash);

describe('Sandbox engine', () => {
  let userId: string;
  const STK = uniqueSymbol('SB');
  const STK2 = uniqueSymbol('SB');
  const COIN = uniqueSymbol('SC');
  const GOLD = uniqueSymbol('GD');

  beforeAll(async () => {
    userId = (await createUser()).id;
    await setMarketPrice(STK, 200);
    await setMarketPrice(STK2, 50);
    await setMarketPrice(COIN, 25_000, { assetType: 'crypto' });
    await setFx('EUR', 43, 44); // TL: alış 43, satış 44 → USD 1,075 / 1,1
    await setCommodityHistory(GOLD, 2_000);
  });

  const newPortfolio = (name = 'Test') => Sandbox.create({ kind: 'model', name, userId });

  it('create: 100.000 USD, 25 bps, aktif', async () => {
    const p = await newPortfolio();
    expect(p).toMatchObject({ kind: 'model', starting_cash: 100_000, cash: 100_000, commission_bps: 25, status: 'active', base_currency: 'USD' });
  });

  it('USD fiyatları: hisse, döviz (makaslı, ÷ USD/TRY), emtia (price_history yedeği)', async () => {
    const m = await SandboxPrices.getUsdPrices([
      { asset_type: 'stock', symbol: STK },
      { asset_type: 'currency', symbol: 'EUR' },
      { asset_type: 'currency', symbol: 'USD' },
      { asset_type: 'commodity', symbol: GOLD },
    ]);
    expect(m.get(`stock:${STK}`)).toMatchObject({ price_usd: 200, fresh: true, asset_class: 'hisse' });
    expect(m.get('currency:EUR')).toMatchObject({ price_usd: 44 / TEST_USD_TRY, sell_price_usd: 43 / TEST_USD_TRY, asset_class: 'doviz' });
    expect(m.has('currency:USD')).toBe(false); // USD nakittir
    expect(m.get(`commodity:${GOLD}`)).toMatchObject({ price_usd: 2_000, fresh: true, asset_class: 'emtia' });
  });

  it('alış (tutar): komisyon kuruşa yukarı, nakit düşer, ortalama maliyet komisyonsuz', async () => {
    const p = await newPortfolio();
    const r = await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, amount_usd: 10_000 });
    expect(r.trade).toMatchObject({ side: 'buy', quantity: 50, price_usd: 200, gross_usd: 10_000, commission_usd: 25, reason: 'manual' });
    expect(r.cash_usd).toBe(89_975);
    expect(r.holding).toEqual({ quantity: 50, avg_cost_usd: 200 });
    // kesirli miktar → 1e-8'e aşağı
    const r2 = await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'crypto', symbol: COIN, quantity: 0.123456789 });
    expect(r2.trade.quantity).toBe(0.12345678);
    expect(r2.trade.gross_usd).toBe(3_086.42); // 0,12345678 × 25.000 = 3086,4195
    expect(r2.trade.commission_usd).toBe(7.72); // 7,71605 → yukarı
    expect(await cashOf(p.id)).toBeCloseTo(89_975 - 3_086.42 - 7.72, 2);
  });

  it('yetersiz nakit: 400 INSUFFICIENT_CASH, nakit değişmez (kaldıraç yok)', async () => {
    const p = await newPortfolio();
    await expect(Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, amount_usd: 100_000 })).rejects.toMatchObject({
      status: 400,
      code: 'INSUFFICIENT_CASH',
    });
    expect(await cashOf(p.id)).toBe(100_000);
    // komisyon dahil sığan en büyük tutar
    const ok = await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, amount_usd: 99_750.62 });
    expect(ok.cash_usd).toBeGreaterThanOrEqual(0);
  });

  it('satış: eldekinden fazlası reddedilir (açığa satış yok), "all" tam miktarı kapatır', async () => {
    const p = await newPortfolio();
    await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, quantity: 10 });
    await expect(Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'stock', symbol: STK, quantity: 10.5 })).rejects.toMatchObject({
      code: 'INSUFFICIENT_QUANTITY',
    });
    await expect(Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'stock', symbol: STK2, quantity: 1 })).rejects.toMatchObject({
      code: 'NO_POSITION',
    });
    const part = await Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'stock', symbol: STK, amount_usd: 500 });
    expect(part.trade).toMatchObject({ quantity: 2.5, gross_usd: 500, commission_usd: 1.25 });
    expect(part.holding?.quantity).toBe(7.5);
    const all = await Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'stock', symbol: STK, quantity: 'all' });
    expect(all.trade.quantity).toBe(7.5);
    expect(all.holding).toBeNull();
    const h = await pool.query('SELECT 1 FROM sandbox_holdings WHERE portfolio_id = $1', [p.id]);
    expect(h.rows.length).toBe(0);
    // 10 × 200 alış (2000 + 5) → 500 − 1,25 + 1500 − 3,75 satış
    expect(all.cash_usd).toBeCloseTo(100_000 - 2_005 + 498.75 + 1_496.25, 2);
  });

  it('döviz satışı alış kuruyla (makas); USD işlem görmez', async () => {
    const p = await newPortfolio();
    const b = await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'currency', symbol: 'EUR', quantity: 1_000 });
    expect(b.trade.price_usd).toBeCloseTo(1.1, 8);
    const s = await Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'currency', symbol: 'EUR', quantity: 'all' });
    expect(s.trade.price_usd).toBeCloseTo(1.075, 8);
    await expect(Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'currency', symbol: 'USD', amount_usd: 100 })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_ASSET',
    });
  });

  it('bayat fiyat: işlem 503 PRICE_UNAVAILABLE; değerleme stale bayrağıyla devam eder', async () => {
    const sym = uniqueSymbol('ST');
    await setMarketPrice(sym, 100);
    const p = await newPortfolio();
    await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: sym, quantity: 10 });
    await setMarketPrice(sym, 110, { ageMinutes: 30 }); // işlem penceresi 15 dk, değerleme 1 saat
    await expect(Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: sym, quantity: 1 })).rejects.toMatchObject({
      status: 503,
      code: 'PRICE_UNAVAILABLE',
    });
    let v = await Sandbox.valuation(p.id);
    expect(v.stale).toBe(false);
    expect(v.holdings[0].price_usd).toBe(110);
    await setMarketPrice(sym, 120, { ageMinutes: 120 });
    v = await Sandbox.valuation(p.id);
    expect(v.stale).toBe(true);
    expect(v.holdings[0]).toMatchObject({ price_usd: 120, stale: true });
  });

  it('dondurulmuş portföy bitiş anındaki fiyatla değerlenir (lig bittikten sonra fiyat değişse de)', async () => {
    const sym = uniqueSymbol('FZ');
    await setMarketPrice(sym, 100);
    const p = await newPortfolio();
    await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: sym, quantity: 10 });
    await Sandbox.freeze(p.id);
    const before = await Sandbox.valuation(p.id);
    await setMarketPrice(sym, 150); // bitişten sonra fiyat yükseldi
    const after = await Sandbox.valuation(p.id);
    expect(after.holdings[0].price_usd).toBe(100);
    expect(after.equity_usd).toBe(before.equity_usd);
    expect(after.stale).toBe(false);
    const frozenAt = (await pool.query('SELECT frozen_at FROM sandbox_portfolios WHERE id = $1', [p.id])).rows[0].frozen_at;
    expect(after.as_of).toBe(new Date(frozenAt).toISOString());
  });

  it('dondurulmuş portföy: işlem ve yeniden dengeleme 409 SANDBOX_FROZEN', async () => {
    const p = await newPortfolio();
    const f = await Sandbox.freeze(p.id);
    expect(f.status).toBe('frozen');
    expect(f.frozen_at).not.toBeNull();
    expect((await Sandbox.freeze(p.id)).status).toBe('frozen'); // idempotent
    await expect(Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, quantity: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'SANDBOX_FROZEN',
    });
    await expect(
      Sandbox.setTargetWeights(p.id, userId, { weights: [{ asset_type: 'stock', symbol: STK, weight: 50 }], cash_weight: 50 })
    ).rejects.toMatchObject({ code: 'SANDBOX_FROZEN' });
    // dondurma anında son değer yazıldı
    const snap = await pool.query('SELECT equity_usd FROM sandbox_snapshots WHERE portfolio_id = $1', [p.id]);
    expect(parseFloat(snap.rows[0].equity_usd)).toBe(100_000);
  });

  it('hedef ağırlıklar: önce satış sonra alış, toplam korunur (− komisyon), nakit ≥ 0, hedef kaydedilir', async () => {
    const p = await newPortfolio();
    const first = await Sandbox.setTargetWeights(
      p.id,
      userId,
      {
        weights: [
          { asset_type: 'stock', symbol: STK, weight: 40 },
          { asset_type: 'crypto', symbol: COIN, weight: 30 },
          { asset_type: 'commodity', symbol: GOLD, weight: 10 },
          { asset_type: 'currency', symbol: 'EUR', weight: 10 },
        ],
        cash_weight: 10,
      },
      { reason: 'initial' }
    );
    expect(first.executed).toBe(true);
    expect(first.trades.every((t) => t.side === 'buy' && t.reason === 'initial')).toBe(true);
    const commission1 = first.trades.reduce((s, t) => s + t.commission_usd, 0);
    let v = await Sandbox.valuation(p.id);
    expect(v.cash_usd).toBeGreaterThanOrEqual(0);
    expect(v.equity_usd).toBeCloseTo(100_000 - commission1, 1);
    for (const h of v.holdings) expect(Math.abs(h.drift ?? 99)).toBeLessThan(0.5);
    expect(v.target_cash_weight).toBe(10);
    expect(v.cash_weight).toBeGreaterThanOrEqual(9.9);

    // İkinci dengeleme: COIN çıkarılır (tamamen satılır), STK2 eklenir
    const second = await Sandbox.setTargetWeights(p.id, userId, {
      weights: [
        { asset_type: 'stock', symbol: STK, weight: 30 },
        { asset_type: 'stock', symbol: STK2, weight: 50 },
      ],
      cash_weight: 20,
    });
    const sides = second.trades.map((t) => t.side);
    expect(sides.indexOf('buy')).toBeGreaterThan(sides.lastIndexOf('sell'));
    expect(second.trades.find((t) => t.symbol === COIN)?.side).toBe('sell');
    v = await Sandbox.valuation(p.id);
    expect(v.holdings.find((h) => h.symbol === COIN)).toBeUndefined();
    expect(v.holdings.find((h) => h.symbol === GOLD)).toBeUndefined();
    const commission2 = second.trades.reduce((s, t) => s + t.commission_usd, 0);
    // EUR alış/satış makası da (1.000 × 0,025 ≈ 227 USD'ye kadar) kayıptır → toplamı katkılardan doğrula
    expect(v.commission_paid_usd).toBeCloseTo(commission1 + commission2, 2);
    const sum = v.holdings.reduce((s, h) => s + h.contribution_pct, 0) + v.closed_contribution_pct;
    expect(sum).toBeCloseTo(v.return_pct, 2);
    const stored = (await Sandbox.get(p.id)).target_weights!;
    expect(stored.cash_weight).toBe(20);
    expect(stored.weights.map((w) => w.symbol).sort()).toEqual([STK, STK2].sort());

    // Toplam %100 değilse 400 WEIGHTS_INVALID
    await expect(
      Sandbox.setTargetWeights(p.id, userId, { weights: [{ asset_type: 'stock', symbol: STK, weight: 60 }], cash_weight: 30 })
    ).rejects.toMatchObject({ status: 400, code: 'WEIGHTS_INVALID' });
  });

  it('önizleme (dryRun) hiçbir şey yazmaz', async () => {
    const p = await newPortfolio();
    const plan = await Sandbox.previewTargetWeights(p.id, { weights: [{ asset_type: 'stock', symbol: STK, weight: 100 }], cash_weight: 0 });
    expect(plan.trades.length).toBe(1);
    expect(plan.total_commission).toBeGreaterThan(240);
    expect(await cashOf(p.id)).toBe(100_000);
    expect((await Sandbox.trades(p.id)).total).toBe(0);
  });

  it('eşzamanlı alışlar FOR UPDATE ile sıralanır: nakit asla negatif olmaz', async () => {
    const p = await newPortfolio();
    const buy = () => Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, amount_usd: 15_000 });
    const results = await Promise.allSettled(Array.from({ length: 10 }, buy));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(6); // 6 × 15.037,50 = 90.225; 7. alış 105.262,50 > 100.000
    for (const r of results) if (r.status === 'rejected') expect((r.reason as any).code).toBe('INSUFFICIENT_CASH');
    expect(await cashOf(p.id)).toBeCloseTo(100_000 - 6 * 15_037.5, 2);
    expect((await Sandbox.trades(p.id)).total).toBe(6);
  });

  it('eşzamanlı satışlar pozisyonu aşamaz', async () => {
    const p = await newPortfolio();
    await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, quantity: 10 });
    const sell = () => Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'stock', symbol: STK, quantity: 4 });
    const results = await Promise.allSettled([sell(), sell(), sell(), sell()]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2);
    const h = await pool.query('SELECT quantity FROM sandbox_holdings WHERE portfolio_id = $1', [p.id]);
    expect(parseFloat(h.rows[0].quantity)).toBe(2);
  });

  it('valuation + equities + anlık görüntü + geçmiş', async () => {
    const p = await newPortfolio();
    await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK2, quantity: 100 }); // 5.000 + 12,5
    const v = await Sandbox.valuation(p.id);
    expect(v.equity_usd).toBeCloseTo(100_000 - 12.5, 2);
    expect(v.return_pct).toBeCloseTo(-0.0125, 4);
    expect(v.holdings[0]).toMatchObject({ symbol: STK2, asset_class: 'hisse', value_usd: 5_000, weight: 5, target_weight: null, drift: null });
    expect(v.by_class.find((c) => c.asset_class === 'nakit')?.weight).toBeCloseTo(95, 1);
    const eq = await Sandbox.equities([p.id]);
    expect(eq.get(p.id)?.equity_usd).toBeCloseTo(v.equity_usd, 2);

    const n = await Sandbox.snapshotPortfolios([p.id]);
    expect(n).toBe(1);
    const hist = await Sandbox.history(p.id, '1W');
    expect(hist.points.length).toBeGreaterThanOrEqual(2);
    expect(hist.points[0].v).toBe(100_000);
    for (let i = 1; i < hist.points.length; i++) expect(hist.points[i].t).toBeGreaterThan(hist.points[i - 1].t);
  });

  it('metrikler: simüle (price_history), HHI nakit dahil, devir hızı ilk kurulum hariç', async () => {
    const sym = uniqueSymbol('MH');
    await setMarketPrice(sym, 110);
    await setDailyHistory('stock', sym, [100, 102, 99, 104, 101, 106, 103, 108, 110]);
    const p = await newPortfolio();
    await Sandbox.setTargetWeights(p.id, userId, { weights: [{ asset_type: 'stock', symbol: sym, weight: 50 }], cash_weight: 50 }, { reason: 'initial' });
    await Sandbox.trade(p.id, userId, { side: 'sell', asset_type: 'stock', symbol: sym, amount_usd: 10_000 });
    const m = await Sandbox.metrics(p.id);
    expect(m.basis).toBe('simulated');
    expect(m.simulated?.points).toBeGreaterThanOrEqual(6);
    expect(m.volatility_ann).toBeGreaterThan(0);
    expect(m.max_drawdown_pct).toBeGreaterThan(0);
    expect(m.trades_count).toBe(2);
    expect(m.turnover_pct).toBe(5); // 10.000 / 2 / 100.000
    expect(m.effective_n).toBeGreaterThan(1.5);
    expect(m.effective_n).toBeLessThan(2.1);

    const cashOnly = await newPortfolio();
    const mc = await Sandbox.metrics(cashOnly.id);
    expect(mc).toMatchObject({ volatility_ann: 0, max_drawdown_pct: 0, sharpe: null, hhi: 1, effective_n: 1, trades_count: 0 });
  });

  it('varlık arama yalnızca taze fiyatlıları döndürür (USD)', async () => {
    const stale = uniqueSymbol('ZZ');
    await setMarketPrice(stale, 10, { ageMinutes: 60 });
    const r = await SandboxPrices.searchAssets(STK, undefined);
    expect(r[0]).toMatchObject({ asset_type: 'stock', symbol: STK, price_usd: 200, asset_class: 'hisse' });
    expect((await SandboxPrices.searchAssets(stale, 'stock')).length).toBe(0);
    const fx = await SandboxPrices.searchAssets(undefined, 'currency');
    expect(fx.some((x) => x.symbol === 'EUR')).toBe(true);
    expect(fx.some((x) => x.symbol === 'USD' || x.symbol === 'TRY')).toBe(false);
    const gold = await SandboxPrices.searchAssets(GOLD, 'commodity');
    expect(gold[0]).toMatchObject({ symbol: GOLD, price_usd: 2_000 });
  });

  it('remove: CASCADE ile her şey silinir', async () => {
    const p = await newPortfolio();
    await Sandbox.trade(p.id, userId, { side: 'buy', asset_type: 'stock', symbol: STK, quantity: 1 });
    await Sandbox.remove(p.id);
    await expect(Sandbox.get(p.id)).rejects.toMatchObject({ status: 404, code: 'SANDBOX_NOT_FOUND' });
    const t = await pool.query('SELECT 1 FROM sandbox_trades WHERE portfolio_id = $1', [p.id]);
    expect(t.rows.length).toBe(0);
  });
});
