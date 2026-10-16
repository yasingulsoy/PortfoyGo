import { beforeAll, describe, expect, it } from 'vitest';
import { api, createUser, pool, setMarketPrice, uniqueSymbol, type TestUser } from './helpers';

/** Model Portföy API (/api/model-portfolios, /api/sandbox/assets) */

describe('Model Portföy API', () => {
  let u: TestUser;
  let other: TestUser;
  const A = uniqueSymbol('MA');
  const B = uniqueSymbol('MB');

  beforeAll(async () => {
    u = await createUser();
    other = await createUser();
    await setMarketPrice(A, 100);
    await setMarketPrice(B, 40_000, { assetType: 'crypto' });
  });

  it('oturum gerekir', async () => {
    expect((await api().get('/api/model-portfolios')).status).toBe(401);
    expect((await api().get('/api/sandbox/assets')).status).toBe(401);
  });

  it('liste boş; sınırlar bildirilir', async () => {
    const r = await api().get('/api/model-portfolios').set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ items: [], limit: 5, starting_cash: 100_000, commission_bps: 25 });
  });

  it('önizleme: yeni 100.000 USD portföyün işlemleri ve komisyonu', async () => {
    const r = await api()
      .post('/api/model-portfolios/preview')
      .set(u.auth)
      .send({ weights: [{ asset_type: 'stock', symbol: A, weight: 60 }, { asset_type: 'crypto', symbol: B, weight: 20 }], cash_weight: 20 });
    expect(r.status).toBe(200);
    expect(r.body.data.trades).toHaveLength(2);
    expect(r.body.data.total_commission).toBeCloseTo(200, 0); // 80.000 × %0,25
    const bad = await api().post('/api/model-portfolios/preview').set(u.auth).send({ weights: [{ asset_type: 'stock', symbol: A, weight: 60 }], cash_weight: 20 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('WEIGHTS_INVALID');
  });

  let pid: string;

  it('oluşturma: ağırlıklarla ilk dağılım (reason initial) + değerleme', async () => {
    const r = await api()
      .post('/api/model-portfolios')
      .set(u.auth)
      .send({ name: 'Dengeli', weights: [{ asset_type: 'stock', symbol: A, weight: 50 }, { asset_type: 'crypto', symbol: B, weight: 30 }], cash_weight: 20 });
    expect(r.status).toBe(201);
    pid = r.body.data.portfolio.id;
    expect(r.body.data.portfolio).toMatchObject({ name: 'Dengeli', starting_cash: 100_000, commission_bps: 25, kind: 'model' });
    expect(r.body.data.rebalance.trades.every((t: any) => t.reason === 'initial')).toBe(true);

    const d = await api().get(`/api/model-portfolios/${pid}`).set(u.auth);
    expect(d.status).toBe(200);
    const v = d.body.data.valuation;
    expect(v.equity_usd).toBeCloseTo(100_000 - 200, 0);
    expect(v.holdings.map((h: any) => h.symbol).sort()).toEqual([A, B].sort());
    expect(v.target_cash_weight).toBe(20);
  });

  it('başkasının portföyü 404 (varlığı sızdırılmaz)', async () => {
    expect((await api().get(`/api/model-portfolios/${pid}`).set(other.auth)).status).toBe(404);
    const t = await api().post(`/api/model-portfolios/${pid}/trade`).set(other.auth).send({ side: 'buy', asset_type: 'stock', symbol: A, amount_usd: 100 });
    expect(t.status).toBe(404);
    expect((await api().delete(`/api/model-portfolios/${pid}`).set(other.auth)).status).toBe(404);
  });

  it('işlem (tutar / miktar / tümü) ve işlem geçmişi', async () => {
    const buy = await api().post(`/api/model-portfolios/${pid}/trade`).set(u.auth).send({ side: 'buy', asset_type: 'stock', symbol: A, amount_usd: 1_000 });
    expect(buy.status).toBe(200);
    expect(buy.body.data.result.trade).toMatchObject({ side: 'buy', quantity: 10, gross_usd: 1_000, commission_usd: 2.5, reason: 'manual' });
    expect(buy.body.data.valuation.equity_usd).toBeGreaterThan(0);

    const both = await api().post(`/api/model-portfolios/${pid}/trade`).set(u.auth).send({ side: 'buy', asset_type: 'stock', symbol: A, amount_usd: 1, quantity: 1 });
    expect(both.status).toBe(400);
    const usd = await api().post(`/api/model-portfolios/${pid}/trade`).set(u.auth).send({ side: 'buy', asset_type: 'currency', symbol: 'USD', amount_usd: 10 });
    expect(usd.body.code).toBe('INVALID_ASSET');
    const tooMuch = await api().post(`/api/model-portfolios/${pid}/trade`).set(u.auth).send({ side: 'buy', asset_type: 'stock', symbol: A, amount_usd: 500_000 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.code).toBe('INSUFFICIENT_CASH');

    const sellAll = await api().post(`/api/model-portfolios/${pid}/trade`).set(u.auth).send({ side: 'sell', asset_type: 'crypto', symbol: B, quantity: 'all' });
    expect(sellAll.status).toBe(200);
    expect(sellAll.body.data.result.holding).toBeNull();
    expect(sellAll.body.data.valuation.closed.map((c: any) => c.symbol)).toContain(B);

    const t = await api().get(`/api/model-portfolios/${pid}/trades?limit=2`).set(u.auth);
    expect(t.status).toBe(200);
    expect(t.body.data.items).toHaveLength(2);
    expect(t.body.data.total).toBe(4);
    expect(t.body.data.items[0].side).toBe('sell');
  });

  it('yeniden dengeleme: dry_run yazmaz, gerçek çağrı hedefe getirir', async () => {
    const body = { weights: [{ asset_type: 'stock', symbol: A, weight: 25 }], cash_weight: 75 };
    const dry = await api().put(`/api/model-portfolios/${pid}/weights`).set(u.auth).send({ ...body, dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.data.result.executed).toBe(false);
    expect(dry.body.data.valuation).toBeNull();
    const real = await api().put(`/api/model-portfolios/${pid}/weights`).set(u.auth).send(body);
    expect(real.status).toBe(200);
    expect(real.body.data.result.executed).toBe(true);
    const h = real.body.data.valuation.holdings.find((x: any) => x.symbol === A);
    expect(Math.abs(h.drift)).toBeLessThan(0.5);
    expect(real.body.data.valuation.cash_weight).toBeGreaterThan(74);
  });

  it('geçmiş, metrikler, simülasyon', async () => {
    const h = await api().get(`/api/model-portfolios/${pid}/history?range=1W`).set(u.auth);
    expect(h.status).toBe(200);
    expect(h.body.data.points.length).toBeGreaterThanOrEqual(2);
    expect((await api().get(`/api/model-portfolios/${pid}/history?range=5Y`).set(u.auth)).status).toBe(400);
    const m = await api().get(`/api/model-portfolios/${pid}/metrics`).set(u.auth);
    expect(m.status).toBe(200);
    expect(m.body.data).toHaveProperty('effective_n');
    expect(m.body.data.trades_count).toBeGreaterThanOrEqual(5);
    const b = await api().get(`/api/model-portfolios/${pid}/backtest?days=30`).set(u.auth);
    expect(b.status).toBe(200);
    expect(b.body.data.lookback_days).toBe(30);
  });

  it('karşılaştırma (≤ 3), yeniden adlandırma', async () => {
    const cashOnly = await api().post('/api/model-portfolios').set(u.auth).send({ name: 'Tamamı nakit', weights: [], cash_weight: 100 });
    expect(cashOnly.status).toBe(201);
    const id2 = cashOnly.body.data.portfolio.id;
    const c = await api().get(`/api/model-portfolios/compare?ids=${pid},${id2}`).set(u.auth);
    expect(c.status).toBe(200);
    expect(c.body.data.items).toHaveLength(2);
    expect(c.body.data.items[1].metrics).toMatchObject({ volatility_ann: 0, effective_n: 1 });
    expect(c.body.data.items[1].backtest.points.length).toBeGreaterThanOrEqual(2);
    expect((await api().get(`/api/model-portfolios/compare?ids=${pid},${id2},${pid},x`).set(u.auth)).status).toBe(400);
    const r = await api().patch(`/api/model-portfolios/${id2}`).set(u.auth).send({ name: '  Nakit  ' });
    expect(r.body.data.name).toBe('Nakit');
  });

  it('kullanıcı başına en fazla 5 model portföy (409 MODEL_LIMIT); silince yer açılır', async () => {
    const list = (await api().get('/api/model-portfolios').set(u.auth)).body.data.items;
    for (let i = list.length; i < 5; i++) {
      expect((await api().post('/api/model-portfolios').set(u.auth).send({ name: `P${i}` })).status).toBe(201);
    }
    const sixth = await api().post('/api/model-portfolios').set(u.auth).send({ name: 'Altıncı' });
    expect(sixth.status).toBe(409);
    expect(sixth.body.code).toBe('MODEL_LIMIT');
    const last = (await api().get('/api/model-portfolios').set(u.auth)).body.data.items.at(-1);
    expect((await api().delete(`/api/model-portfolios/${last.id}`).set(u.auth)).status).toBe(200);
    expect((await api().post('/api/model-portfolios').set(u.auth).send({ name: 'Yeni' })).status).toBe(201);
  });

  it('Sihirbaz şablonu: plan yoksa 404 NO_ADVISOR_PLAN', async () => {
    const r = await api().get('/api/model-portfolios/templates/advisor').set(other.auth);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NO_ADVISOR_PLAN');
  });

  it('varlık arama: taze fiyatlılar, USD', async () => {
    const r = await api().get(`/api/sandbox/assets?q=${A}`).set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data[0]).toMatchObject({ symbol: A, asset_type: 'stock', price_usd: 100, asset_class: 'hisse' });
    expect((await api().get('/api/sandbox/assets?type=bond').set(u.auth)).status).toBe(400);
  });

  it('KVKK: dışa aktarmada yer alır, hesap silinince model portföyler silinir', async () => {
    const x = await createUser();
    const c = await api().post('/api/model-portfolios').set(x.auth).send({ name: 'Silinecek' });
    expect(c.status).toBe(201);
    const exp = await api().get('/api/me/export').set(x.auth);
    expect(exp.status).toBe(200);
    const data = JSON.parse(exp.text);
    expect(data.sandbox_portfolios.map((p: any) => p.name)).toEqual(['Silinecek']);
    expect(data).toHaveProperty('sandbox_trades');
    const del = await api().post('/api/me/delete').set(x.auth).send({ password: 'test-password-123' });
    expect(del.status).toBe(200);
    const left = await pool.query(`SELECT 1 FROM sandbox_portfolios WHERE user_id = $1 AND kind = 'model'`, [x.id]);
    expect(left.rows.length).toBe(0);
  });
});
