import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOO_BUY_BUFFER, OrderService, maxAffordableQuantity, trailingTrigger } from '../src/services/orders';
import { computeBuyCost } from '../src/services/transaction';
import { PortfolioService } from '../src/services/portfolio';
import { marketClock } from '../src/services/marketHours';
import { api, createUser, getBalance, getHolding, pool, setMarketPrice, settle, uniqueSymbol, TEST_USD_TRY, type TestUser } from './helpers';

/**
 * Migration 020 — takip eden stop, açılışta (MOO) emirler, ABD seans kuralı, döviz makası.
 * Para değişmezleri: her senaryoda bakiye/rezerv negatif olmaz, users.reserved_cash = aktif emir
 * rezervlerinin toplamı ve toplam varlık yalnızca komisyon/yuvarlama ve fiyat hareketi kadar değişir.
 */

const num = (v: unknown) => Number(v);
const floor2 = (n: number) => Math.floor(n * 100 + 1e-7) / 100;
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sellNet = (qty: number, price: number) => {
  const total = floor2(qty * price);
  return round2(total - ceil2(total * 0.0025));
};

const orderRow = async (id: string) => (await pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
const reservedOf = async (userId: string) => num((await pool.query('SELECT reserved_cash FROM users WHERE id = $1', [userId])).rows[0].reserved_cash);
const notificationsOf = async (userId: string) =>
  (await pool.query('SELECT type, body, data FROM notifications WHERE user_id = $1 ORDER BY created_at', [userId])).rows;
const txCount = async (userId: string) => num((await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [userId])).rows[0].n);

/** Para değişmezleri: negatif bakiye/rezerv yok; users.reserved_cash = aktif emir rezervleri toplamı */
async function expectMoneyInvariants(userId: string) {
  const u = (await pool.query('SELECT balance, reserved_cash FROM users WHERE id = $1', [userId])).rows[0];
  const sum = (await pool.query(`SELECT COALESCE(SUM(reserved_cash), 0) AS s FROM orders WHERE user_id = $1 AND status = 'active'`, [userId])).rows[0];
  expect(num(u.balance)).toBeGreaterThanOrEqual(0);
  expect(num(u.reserved_cash)).toBeGreaterThanOrEqual(0);
  expect(num(u.reserved_cash)).toBeCloseTo(num(sum.s), 2);
}

async function buy(user: TestUser, symbol: string, quantity: number, assetType: 'stock' | 'crypto' | 'currency' = 'stock') {
  const res = await api().post('/api/transactions/buy').set(user.auth).send({ symbol, asset_type: assetType, quantity });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

const createOrder = (user: TestUser, body: Record<string, unknown>) => api().post('/api/orders').set(user.auth).send(body);

/** Önbellekteki hisse fiyatının alınma zamanını ayarlar (gelecekteki bir seansı taklit etmek için) */
const setQuotedAt = (symbol: string, isoAt: string) =>
  pool.query(`UPDATE market_data_cache SET cached_at = $2::timestamptz WHERE asset_type = 'stock' AND symbol = $1`, [symbol, isoAt]);

/** Satırdaki TIMESTAMP alanı verilen ana eşit mi (karşılaştırma SQL'de; Node saat diliminden bağımsız) */
const timestampEquals = async (orderId: string, column: 'execute_after' | 'expires_at', isoAt: string) =>
  (await pool.query(`SELECT (${column} = $2::timestamptz) AS ok FROM orders WHERE id = $1`, [orderId, isoAt])).rows[0].ok;

// ---------------------------------------------------------------------------
// Takip eden stop (seans kuralı kapalı: US_MARKET_HOURS=off, vitest.config.mts)
// ---------------------------------------------------------------------------

describe('trailing stop orders', () => {
  it('creates with high-water = current price and trigger = high × (1 − %); validates the trail', async () => {
    const user = await createUser();
    const sym = uniqueSymbol('TS');
    await setMarketPrice(sym, 10); // 400 TL
    await buy(user, sym, 10);

    const res = await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'trailing_stop', quantity: 10, trail_percent: 5 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order).toMatchObject({ type: 'trailing_stop', side: 'sell', trail_percent: 5, trail_amount: null, reserved_cash: 0 });
    expect(res.body.order.high_water_price).toBeCloseTo(400, 6);
    expect(res.body.order.trigger_price).toBeCloseTo(380, 6);

    const bad = async (body: Record<string, unknown>, status = 400) => {
      const r = await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'trailing_stop', quantity: 1, ...body });
      expect(r.status, JSON.stringify(r.body)).toBe(status);
      return r.body;
    };
    await bad({}); // mesafe yok
    await bad({ trail_percent: 5, trail_amount: 10 }); // ikisi birden
    await bad({ trail_percent: 60 });
    await bad({ trail_percent: 0.01 });
    expect((await bad({ trail_amount: 400 })).message).toBe('Takip tutarı güncel fiyattan küçük olmalı');
    expect((await bad({ side: 'buy', trail_percent: 5 })).message).toMatch(/Alış tarafında/);
    expect((await bad({ quantity: 11, trail_percent: 5 })).message).toMatch(/Yetersiz miktar/);
    await expectMoneyInvariants(user.id);
    await settle();
  });

  it('ratchets the high-water mark up on fresh prices (never down) and sells at the trigger', async () => {
    const user = await createUser();
    const sym = uniqueSymbol('TS');
    await setMarketPrice(sym, 10);
    await buy(user, sym, 10);
    const { order } = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'trailing_stop', quantity: 10, trail_percent: 5 })).body;

    await setMarketPrice(sym, 11); // 440 TL → yeni zirve
    const first = await OrderService.processOrders();
    expect(first.trailed).toBeGreaterThanOrEqual(1);
    let row = await orderRow(order.id);
    expect(row.status).toBe('active');
    expect(num(row.high_water_price)).toBeCloseTo(440, 6);
    expect(num(row.trigger_price)).toBeCloseTo(trailingTrigger(440, { percent: 5 }), 6); // 418

    // Aynı fiyatla tekrar: değişiklik yok (idempotent)
    await OrderService.processOrders();
    row = await orderRow(order.id);
    expect(num(row.high_water_price)).toBeCloseTo(440, 6);
    expect(num(row.trigger_price)).toBeCloseTo(418, 6);

    // Geri çekilme (tetiklemenin üstünde): zirve düşmez, emir bekler
    await setMarketPrice(sym, 10.6); // 424
    await OrderService.processOrders();
    row = await orderRow(order.id);
    expect(row.status).toBe('active');
    expect(num(row.high_water_price)).toBeCloseTo(440, 6);

    // Tetikleme: 416 ≤ 418 → piyasa fiyatından satış
    const balanceBefore = await getBalance(user.id);
    await setMarketPrice(sym, 10.4);
    await OrderService.processOrders();
    row = await orderRow(order.id);
    expect(row.status).toBe('filled');
    expect(num(row.filled_price)).toBeCloseTo(416, 6);
    expect(num(row.filled_quantity)).toBeCloseTo(10, 8);
    expect(await getHolding(user.id, sym)).toBe(0);
    expect(await getBalance(user.id)).toBeCloseTo(balanceBefore + sellNet(10, 416), 2);

    const notes = await notificationsOf(user.id);
    const trig = notes.find((n) => n.type === 'order.trailing_triggered');
    expect(trig, 'order.trailing_triggered bildirimi').toBeTruthy();
    expect(trig.body).toMatch(/zirve/);
    expect(await txCount(user.id)).toBe(2); // alış + tetiklenen satış
    await expectMoneyInvariants(user.id);
    await settle();
  });

  it('stale prices neither move the high-water mark nor trigger', async () => {
    const user = await createUser();
    const sym = uniqueSymbol('TS');
    await setMarketPrice(sym, 10);
    await buy(user, sym, 5);
    const { order } = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'trailing_stop', quantity: 5, trail_percent: 5 })).body;

    await setMarketPrice(sym, 12, { ageMinutes: 30 }); // bayat zirve
    await OrderService.processOrders();
    expect(num((await orderRow(order.id)).high_water_price)).toBeCloseTo(400, 6);

    await setMarketPrice(sym, 9, { ageMinutes: 30 }); // bayat çöküş (360 < 380)
    await OrderService.processOrders();
    expect((await orderRow(order.id)).status).toBe('active');
    expect(await getHolding(user.id, sym)).toBe(5);

    await setMarketPrice(sym, 9); // taze → tetiklenir
    await OrderService.processOrders();
    expect((await orderRow(order.id)).status).toBe('filled');
    await settle();
  });

  it('TL trail + partial holdings: sells only the ordered quantity, capped to what is still held', async () => {
    const user = await createUser();
    const a = uniqueSymbol('TA');
    const b = uniqueSymbol('TB');
    await setMarketPrice(a, 10);
    await setMarketPrice(b, 10);
    await buy(user, a, 10);
    await buy(user, b, 10);

    // a: 10'un 4'ü için 20 TL takip → tetikleme 380; kalan 6 korunur
    const oa = (await createOrder(user, { asset_type: 'stock', symbol: a, side: 'sell', type: 'trailing_stop', quantity: 4, trail_amount: 20 })).body.order;
    expect(oa.trigger_price).toBeCloseTo(380, 6);
    // b: tümü için emir, ardından kullanıcı elle 7 satar → emir 3 ile gerçekleşir
    const ob = (await createOrder(user, { asset_type: 'stock', symbol: b, side: 'sell', type: 'trailing_stop', quantity: 10, trail_percent: 5 })).body.order;
    const manual = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: b, asset_type: 'stock', quantity: 7 });
    expect(manual.status).toBe(200);

    await setMarketPrice(a, 9.4); // 376 ≤ 380
    await setMarketPrice(b, 9.4);
    await OrderService.processOrders();

    const ra = await orderRow(oa.id);
    expect(ra.status).toBe('filled');
    expect(num(ra.filled_quantity)).toBeCloseTo(4, 8);
    expect(await getHolding(user.id, a)).toBeCloseTo(6, 8);

    const rb = await orderRow(ob.id);
    expect(rb.status).toBe('filled');
    expect(num(rb.filled_quantity)).toBeCloseTo(3, 8);
    expect(await getHolding(user.id, b)).toBe(0);
    await expectMoneyInvariants(user.id);
    await settle();
  });

  it('PATCH edits the trail distance from the kept high-water mark; cancel works like other orders', async () => {
    const user = await createUser();
    const sym = uniqueSymbol('TE');
    await setMarketPrice(sym, 10);
    await buy(user, sym, 3);
    const { order } = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'trailing_stop', quantity: 3, trail_percent: 5 })).body;

    let res = await api().patch(`/api/orders/${order.id}`).set(user.auth).send({ trail_percent: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.order.trigger_price).toBeCloseTo(392, 6);
    expect(res.body.order.high_water_price).toBeCloseTo(400, 6);

    res = await api().patch(`/api/orders/${order.id}`).set(user.auth).send({ trail_amount: 10 });
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ trail_percent: null, trail_amount: 10 });
    expect(res.body.order.trigger_price).toBeCloseTo(390, 6);

    // Fiyat 395'e iner (390'ın üstü: tetiklenmez); %1 → 396 ≥ 395 olurdu → reddedilir
    await setMarketPrice(sym, 9.875);
    await OrderService.processOrders();
    expect((await orderRow(order.id)).status).toBe('active');
    res = await api().patch(`/api/orders/${order.id}`).set(user.auth).send({ trail_percent: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRIGGER');
    expect(num((await orderRow(order.id)).trigger_price)).toBeCloseTo(390, 6);

    expect((await api().patch(`/api/orders/${order.id}`).set(user.auth).send({ trail_percent: 2, trail_amount: 5 })).status).toBe(400);

    // Başka emir tipleri düzenlenemez; başkasının emri bulunamaz
    const stop = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'stop_loss', quantity: 1, trigger_price: 300 })).body.order;
    expect((await api().patch(`/api/orders/${stop.id}`).set(user.auth).send({ trail_percent: 2 })).status).toBe(400);
    const other = await createUser();
    expect((await api().patch(`/api/orders/${order.id}`).set(other.auth).send({ trail_percent: 2 })).status).toBe(404);

    const cancel = await api().delete(`/api/orders/${order.id}`).set(user.auth);
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('cancelled');
    expect((await api().patch(`/api/orders/${order.id}`).set(user.auth).send({ trail_percent: 2 })).status).toBe(409);
    await settle();
  });

  it('concurrent executor runs fill a triggered trailing stop exactly once', async () => {
    const user = await createUser();
    const sym = uniqueSymbol('TC');
    await setMarketPrice(sym, 10);
    await buy(user, sym, 2);
    const { order } = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'trailing_stop', quantity: 2, trail_percent: 3 })).body;
    await setMarketPrice(sym, 9);
    await Promise.all([OrderService.processOrders(), OrderService.processOrders(), OrderService.executeOne(order.id, user.id)]);
    expect((await orderRow(order.id)).status).toBe('filled');
    expect(await txCount(user.id)).toBe(2);
    expect(await getHolding(user.id, sym)).toBe(0);
    await settle();
  });
});

// ---------------------------------------------------------------------------
// ABD seansı + açılışta gerçekleşen emirler (seans kuralı AÇIK, saat enjekte)
// ---------------------------------------------------------------------------

// 2026-10-09 Cuma (açık), 10-10 Cumartesi, 10-12 Pazartesi (EDT: açılış 13:30Z, kapanış 20:00Z)
const FRI_OPEN = '2026-10-09T15:00:00Z';
const SATURDAY = '2026-10-10T15:00:00Z';
const MON_PRE_OPEN = '2026-10-12T13:29:00Z';
const MON_OPEN = '2026-10-12T13:30:00.000Z';
const MON_AFTER_OPEN = '2026-10-12T13:31:00Z';
const MON_CLOSE = '2026-10-12T20:00:00.000Z';

describe('US market hours + market-on-open orders', () => {
  const saved = process.env.US_MARKET_HOURS;
  beforeEach(() => {
    process.env.US_MARKET_HOURS = '';
  });
  afterEach(() => {
    process.env.US_MARKET_HOURS = saved;
    marketClock.reset();
  });
  const clock = (isoAt: string) => marketClock.set(new Date(isoAt));

  it('stock market orders → 409 MARKET_CLOSED with next_open_at; crypto still trades; session endpoint', async () => {
    const user = await createUser();
    const sym = uniqueSymbol('MH');
    const coin = uniqueSymbol('CX');
    await setMarketPrice(sym, 10);
    await setMarketPrice(coin, 2, { assetType: 'crypto' });

    clock(FRI_OPEN);
    await buy(user, sym, 5);

    clock(SATURDAY);
    const before = await getBalance(user.id);
    const b = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 });
    expect(b.status).toBe(409);
    expect(b.body).toMatchObject({ success: false, code: 'MARKET_CLOSED', next_open_at: MON_OPEN });
    const s = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 });
    expect(s.status).toBe(409);
    expect(s.body.code).toBe('MARKET_CLOSED');
    expect(await getBalance(user.id)).toBe(before);
    expect(await getHolding(user.id, sym)).toBe(5);

    await buy(user, coin, 1, 'crypto'); // kripto 7/24

    const session = await api().get('/api/market/session');
    expect(session.status).toBe(200);
    expect(session.body.data).toMatchObject({ open: false, enforced: true, reason: 'weekend', next_open_at: MON_OPEN, next_close_at: MON_CLOSE });
    await settle();
  });

  it('MOO buy reserves reference × (1 + buffer), waits for the open, fills at the first fresh price and refunds the rest', async () => {
    const user = await createUser({ balance: 100_000 });
    const sym = uniqueSymbol('MB');
    await setMarketPrice(sym, 10); // 400 TL

    clock(SATURDAY);
    const res = await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'market_on_open', quantity: 10 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const order = res.body.order;
    const reserve = computeBuyCost(10, 400 * (1 + MOO_BUY_BUFFER)).netAmount; // 4200 + 10.50
    expect(reserve).toBeCloseTo(4210.5, 2);
    expect(order).toMatchObject({ type: 'market_on_open', side: 'buy', status: 'active' });
    expect(order.reserved_cash).toBeCloseTo(reserve, 2);
    expect(order.trigger_price).toBeCloseTo(400, 6); // referans fiyat
    expect(await timestampEquals(order.id, 'execute_after', MON_OPEN)).toBe(true);
    expect(await timestampEquals(order.id, 'expires_at', MON_CLOSE)).toBe(true);
    expect(await getBalance(user.id)).toBeCloseTo(100_000 - reserve, 2);
    expect(await reservedOf(user.id)).toBeCloseTo(reserve, 2);
    await expectMoneyInvariants(user.id);

    await OrderService.processOrders(); // hâlâ hafta sonu
    clock(MON_PRE_OPEN);
    await OrderService.processOrders(); // açılıştan bir dakika önce
    expect((await orderRow(order.id)).status).toBe('active');

    clock(MON_AFTER_OPEN);
    await OrderService.processOrders();
    await OrderService.processOrders(); // idempotent
    const row = await orderRow(order.id);
    expect(row.status).toBe('filled');
    expect(num(row.filled_price)).toBeCloseTo(400, 6);
    expect(num(row.filled_quantity)).toBeCloseTo(10, 8);
    expect(num(row.reserved_cash)).toBe(0);
    expect(await getHolding(user.id, sym)).toBeCloseTo(10, 8);
    // Gerçek maliyet: 4000 + 10 komisyon; tampon iade edildi
    expect(await getBalance(user.id)).toBeCloseTo(100_000 - computeBuyCost(10, 400).netAmount, 2);
    expect(await reservedOf(user.id)).toBe(0);
    expect(await txCount(user.id)).toBe(1);
    expect((await notificationsOf(user.id)).map((n) => n.type)).toContain('order.moo_filled');
    await expectMoneyInvariants(user.id);
    await settle();
  });

  it('gap above the buffer: fills only what the reserve covers (free balance untouched), refunds the remainder', async () => {
    const user = await createUser({ balance: 100_000 });
    const sym = uniqueSymbol('MG');
    await setMarketPrice(sym, 10);

    clock(SATURDAY);
    const { order } = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'market_on_open', quantity: 10 })).body;
    const reserve = order.reserved_cash;
    const freeBalance = await getBalance(user.id);

    await setMarketPrice(sym, 11.5); // %15 gap: 460 TL > 420 TL tampon
    clock(MON_AFTER_OPEN);
    await OrderService.processOrders();

    const row = await orderRow(order.id);
    expect(row.status).toBe('filled');
    const q = num(row.filled_quantity);
    expect(q).toBeCloseTo(maxAffordableQuantity(reserve, 460), 8);
    expect(q).toBeLessThan(10);
    expect(q).toBeGreaterThan(9);
    const cost = computeBuyCost(q, 460).netAmount;
    expect(cost).toBeLessThanOrEqual(reserve);
    // Serbest bakiye kullanılmadı: rezervden artan iade edildi
    const balance = await getBalance(user.id);
    expect(balance).toBeCloseTo(freeBalance + reserve - cost, 2);
    expect(balance).toBeGreaterThanOrEqual(freeBalance);
    // Toplam varlık (aynı fiyatta) yalnızca komisyon + kuruş yuvarlaması kadar azaldı
    const equity = balance + (await reservedOf(user.id)) + q * 460;
    expect(100_000 - equity).toBeGreaterThan(0);
    expect(100_000 - equity).toBeLessThanOrEqual(ceil2(q * 460 * 0.0025) + 0.01 + 1e-6);

    const note = (await notificationsOf(user.id)).find((n) => n.type === 'order.moo_filled');
    expect(note.body).toMatch(/adet alındı/);
    expect(note.data).toMatchObject({ partial: true, requested_quantity: 10 });
    await expectMoneyInvariants(user.id);
    await settle();
  });

  it('MOO that cannot afford anything at the open fails and refunds the whole reserve', async () => {
    const user = await createUser({ balance: 1_000 });
    const sym = uniqueSymbol('MU');
    await setMarketPrice(sym, 0.25); // 10 TL

    clock(SATURDAY);
    const { order } = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'market_on_open', quantity: 0.001 })).body;
    expect(order.reserved_cash).toBeCloseTo(0.03, 2);

    await setMarketPrice(sym, 1.25); // 50 TL: 0,03 TL hiçbir miktarı karşılamaz
    clock(MON_AFTER_OPEN);
    await OrderService.processOrders();
    const row = await orderRow(order.id);
    expect(row.status).toBe('failed');
    expect(row.fail_reason).toMatch(/Açılış fiyatı/);
    expect(await getBalance(user.id)).toBeCloseTo(1_000, 2);
    expect(await reservedOf(user.id)).toBe(0);
    expect(await getHolding(user.id, sym)).toBe(0);
    expect((await notificationsOf(user.id)).map((n) => n.type)).toContain('order.failed');
    await settle();
  });

  it('MOO sell executes at the open; MOO is rejected while open or for non-stocks; cancel refunds; expiry at the close', async () => {
    const user = await createUser({ balance: 100_000 });
    const sym = uniqueSymbol('MS');
    await setMarketPrice(sym, 10);

    clock(FRI_OPEN);
    await buy(user, sym, 5);
    const open = await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'market_on_open', quantity: 1 });
    expect(open.status).toBe(409);
    expect(open.body.code).toBe('MARKET_OPEN');

    clock(SATURDAY);
    const crypto = await createOrder(user, { asset_type: 'crypto', symbol: 'BTC', side: 'buy', type: 'market_on_open', quantity: 1 });
    expect(crypto.status).toBe(400);
    const sell = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'market_on_open', quantity: 5 })).body.order;
    expect(sell.reserved_cash).toBe(0);

    // İptal: rezervin tamamı iade
    const balance = await getBalance(user.id);
    const toCancel = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'market_on_open', quantity: 2 })).body.order;
    expect(await getBalance(user.id)).toBeCloseTo(balance - toCancel.reserved_cash, 2);
    const cancelled = await api().delete(`/api/orders/${toCancel.id}`).set(user.auth);
    expect(cancelled.body.refunded).toBeCloseTo(toCancel.reserved_cash, 2);
    expect(await getBalance(user.id)).toBeCloseTo(balance, 2);

    // Süre dolumu: seans kapanışına kadar gerçekleşmeyen açılış emri kapanır ve rezerv iade edilir
    const expiring = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'market_on_open', quantity: 1 })).body.order;

    clock(MON_AFTER_OPEN);
    // Açılış emri gerçekleşmesin diye yalnızca satışı çalıştır (diğeri bekler)
    expect(await OrderService.executeOne(sell.id, user.id)).toBe('filled');
    expect(await getHolding(user.id, sym)).toBe(0);
    expect((await notificationsOf(user.id)).map((n) => n.type)).toContain('order.moo_filled');

    clock('2026-10-12T20:00:30Z');
    await OrderService.processOrders();
    const exp = await orderRow(expiring.id);
    expect(exp.status).toBe('expired');
    expect(await reservedOf(user.id)).toBe(0);
    await expectMoneyInvariants(user.id);
    await settle();
  });

  it('stock limit / stop orders only trigger in session and never on a quote fetched before the open', async () => {
    // Gelecekteki bir seans (takvim dışı yıl: yalnızca hafta sonu kuralı) — fiyat zamanını elle ayarlarız
    const FRI = '2031-01-03T16:00:00Z'; // Cuma, EST: açılış 14:30Z
    const SAT = '2031-01-04T16:00:00Z';
    const MON = '2031-01-06T14:31:00Z';
    const user = await createUser({ balance: 100_000 });
    const sym = uniqueSymbol('SG');
    const moo = uniqueSymbol('SM');
    await setMarketPrice(sym, 10);
    await setMarketPrice(moo, 10);

    clock(FRI);
    await buy(user, sym, 10);
    const stop = (await createOrder(user, { asset_type: 'stock', symbol: sym, side: 'sell', type: 'stop_loss', quantity: 10, trigger_price: 380 })).body.order;
    await pool.query(`UPDATE orders SET expires_at = '2031-12-31' WHERE id = $1`, [stop.id]);

    clock(SAT);
    const mooOrder = (await createOrder(user, { asset_type: 'stock', symbol: moo, side: 'buy', type: 'market_on_open', quantity: 1 })).body.order;
    expect(await timestampEquals(mooOrder.id, 'execute_after', '2031-01-06T14:30:00Z')).toBe(true);
    await setMarketPrice(sym, 9); // 360 ≤ 380 ama borsa kapalı
    await OrderService.processOrders();
    expect((await orderRow(stop.id)).status).toBe('active');

    // Pazartesi açılıştan sonra, fakat fiyat açılıştan ÖNCE alınmış (önceki kapanış) → tetikleme yok
    clock(MON);
    await setQuotedAt(sym, '2031-01-06T14:29:00Z');
    await setQuotedAt(moo, '2031-01-06T14:29:00Z');
    await OrderService.processOrders();
    expect((await orderRow(stop.id)).status).toBe('active');
    expect((await orderRow(mooOrder.id)).status).toBe('active');
    expect(await OrderService.executeOne(stop.id, user.id)).toBe('skipped');

    // Açılıştan sonraki ilk taze fiyat → ikisi de gerçekleşir
    await setQuotedAt(sym, '2031-01-06T14:30:30Z');
    await setQuotedAt(moo, '2031-01-06T14:30:30Z');
    await OrderService.processOrders();
    const s = await orderRow(stop.id);
    expect(s.status).toBe('filled');
    expect(num(s.filled_price)).toBeCloseTo(9 * TEST_USD_TRY, 6);
    expect((await orderRow(mooOrder.id)).status).toBe('filled');
    expect(await getHolding(user.id, moo)).toBeCloseTo(1, 8);
    await expectMoneyInvariants(user.id);
    await settle();
  });
});

// ---------------------------------------------------------------------------
// Döviz makası: alışta satış kuru, satışta alış kuru; değerleme satış kuru
// ---------------------------------------------------------------------------

describe('FX spread', () => {
  const setRate = (code: string, buying: number, selling: number) =>
    pool.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, $1, $2, $3, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET buying = EXCLUDED.buying, selling = EXCLUDED.selling, updated_at = CURRENT_TIMESTAMP`,
      [code, buying, selling]
    );

  it('buys at the selling rate, sells at the buying rate; valuation stays on the selling rate', async () => {
    const user = await createUser({ balance: 100_000 });
    const code = uniqueSymbol('X');
    await setRate(code, 39.6, 40.4);

    const b = await buy(user, code, 100, 'currency');
    expect(b.transaction.price).toBeCloseTo(40.4, 8);

    await PortfolioService.updateAllPortfolioPrices();
    const item = (await pool.query(`SELECT current_price FROM portfolio_items WHERE user_id = $1 AND symbol = $2`, [user.id, code])).rows[0];
    expect(num(item.current_price)).toBeCloseTo(40.4, 8);

    const balance = await getBalance(user.id);
    const s = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: code, asset_type: 'currency', quantity: 100 });
    expect(s.status).toBe(200);
    expect(s.body.transaction.price).toBeCloseTo(39.6, 8);
    expect(await getBalance(user.id)).toBeCloseTo(balance + sellNet(100, 39.6), 2);
    // Al-sat turunun maliyeti: makas + iki komisyon (para yaratılmaz)
    expect(await getBalance(user.id)).toBeLessThan(100_000 - 100 * (40.4 - 39.6) + 1e-6);
    await settle();
  });

  it('never sells above the buy price: inverted or missing buying rate falls back to selling', async () => {
    const user = await createUser({ balance: 100_000 });
    const inverted = uniqueSymbol('X');
    const missing = uniqueSymbol('X');
    await setRate(inverted, 41, 40);
    await setRate(missing, 0, 40);
    await buy(user, inverted, 10, 'currency');
    await buy(user, missing, 10, 'currency');
    for (const code of [inverted, missing]) {
      const s = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: code, asset_type: 'currency', quantity: 10 });
      expect(s.status).toBe(200);
      expect(s.body.transaction.price).toBeCloseTo(40, 8);
    }
    await settle();
  });

  it('sell-side currency orders trigger on the buying rate', async () => {
    const user = await createUser({ balance: 100_000 });
    const code = uniqueSymbol('X');
    await setRate(code, 39.6, 40.4);
    await buy(user, code, 50, 'currency');
    // Kâr al 41: güncel SATIŞ fiyatı (alış kuru 39,6) üstünde olmalı → kabul
    const { order } = (await createOrder(user, { asset_type: 'currency', symbol: code, side: 'sell', type: 'take_profit', quantity: 50, trigger_price: 41 })).body;
    expect(order.status).toBe('active');

    await setRate(code, 40.9, 41.5); // satış kuru 41'i geçti ama alış kuru geçmedi
    await OrderService.processOrders();
    expect((await orderRow(order.id)).status).toBe('active');

    await setRate(code, 41, 41.6);
    await OrderService.processOrders();
    const row = await orderRow(order.id);
    expect(row.status).toBe('filled');
    expect(num(row.filled_price)).toBeCloseTo(41, 8);
    await expectMoneyInvariants(user.id);
    await settle();
  });
});
