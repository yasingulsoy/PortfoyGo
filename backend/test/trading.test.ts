import { describe, expect, it } from 'vitest';
import { api, createUser, getBalance, getHolding, setMarketPrice, settle, uniqueSymbol, TEST_USD_TRY } from './helpers';

const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

describe('POST /api/transactions/buy', () => {
  it('uses the server-side price and ignores the client-sent price/name', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 12.5, { name: 'Server Name Inc' });

    const res = await api()
      .post('/api/transactions/buy')
      .set(user.auth)
      .send({ symbol: sym, asset_type: 'stock', quantity: 2, price: 0.0001, name: 'Client Name' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const expectedPrice = 12.5 * TEST_USD_TRY; // 500 TL
    expect(res.body.executedPrice).toBeCloseTo(expectedPrice, 6);
    expect(res.body.transaction.price).toBeCloseTo(expectedPrice, 6);
    expect(res.body.transaction.name).toBe('Server Name Inc');
    expect(await getHolding(user.id, sym)).toBe(2);
    await settle();
  });

  it('applies the 0.25% commission (rounded up to kuruş) and debits balance by the net amount', async () => {
    const user = await createUser({ balance: 10_000 });
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 10.123); // 404.92 TL

    const res = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 3 });
    expect(res.status).toBe(200);

    const price = 10.123 * TEST_USD_TRY;
    const total = ceil2(3 * price); // 1214.76
    const commission = ceil2(total * 0.0025); // 3.0369 → 3.04
    const net = round2(total + commission);
    expect(res.body.transaction.total_amount).toBeCloseTo(total, 2);
    expect(res.body.transaction.commission).toBeCloseTo(commission, 2);
    expect(res.body.transaction.net_amount).toBeCloseTo(net, 2);
    expect(commission).toBe(3.04);
    expect(await getBalance(user.id)).toBeCloseTo(10_000 - net, 2);

    // Satışta komisyon tutardan düşülür
    const sell = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 3 });
    expect(sell.status).toBe(200);
    const sellTotal = Math.floor(3 * price * 100 + 1e-7) / 100;
    const sellCommission = ceil2(sellTotal * 0.0025);
    expect(sell.body.transaction.commission).toBeCloseTo(sellCommission, 2);
    expect(sell.body.transaction.net_amount).toBeCloseTo(round2(sellTotal - sellCommission), 2);
    expect(await getBalance(user.id)).toBeCloseTo(10_000 - net + round2(sellTotal - sellCommission), 2);
    expect(await getHolding(user.id, sym)).toBe(0);
    await settle();
  });

  it('rejects a buy when the balance is insufficient and leaves state untouched', async () => {
    const user = await createUser({ balance: 1_000 });
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 100); // 4000 TL

    const res = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('TRADE_REJECTED');
    expect(await getBalance(user.id)).toBe(1_000);
    expect(await getHolding(user.id, sym)).toBe(0);
  });

  it.each([
    ['negative', -1],
    ['zero', 0],
    ['NaN (string)', 'NaN'],
    ['string number', '5'],
    ['null', null],
    ['too large', 1e10],
    ['below minimum', 1e-9],
  ])('rejects invalid quantity: %s', async (_label, quantity) => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 1);
    const res = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await getBalance(user.id)).toBe(100_000);
  });

  it('rejects a raw NaN/Infinity that sneaks through JSON as a non-number', async () => {
    const user = await createUser();
    const res = await api()
      .post('/api/transactions/buy')
      .set(user.auth)
      .set('Content-Type', 'application/json')
      .send('{"symbol":"AAPL","asset_type":"stock","quantity":NaN}');
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await api().post('/api/transactions/buy').send({ symbol: 'AAPL', asset_type: 'stock', quantity: 1 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/transactions/sell', () => {
  it('rejects selling more than held', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 5);
    await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 2 }).expect(200);
    const before = await getBalance(user.id);

    const res = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 2.5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TRADE_REJECTED');
    expect(await getHolding(user.id, sym)).toBe(2);
    expect(await getBalance(user.id)).toBe(before);
    await settle();
  });

  it('rejects selling an asset that is not held', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 5);
    const res = await api().post('/api/transactions/sell').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('concurrent double-sell of the whole position: exactly one succeeds', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 20);
    await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 }).expect(200);
    const before = await getBalance(user.id);

    const sell = () => api().post('/api/transactions/sell').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 1 });
    const results = await Promise.all([sell(), sell()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);

    const price = 20 * TEST_USD_TRY;
    const total = Math.floor(price * 100 + 1e-7) / 100;
    const net = round2(total - ceil2(total * 0.0025));
    expect(await getHolding(user.id, sym)).toBe(0);
    expect(await getBalance(user.id)).toBeCloseTo(before + net, 2);
    await settle();
  });

  it('concurrent partial sells never oversell', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 3);
    await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 5 }).expect(200);

    const sell = () => api().post('/api/transactions/sell').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 2 });
    const results = await Promise.all([sell(), sell(), sell(), sell()]);
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(2);
    expect(await getHolding(user.id, sym)).toBe(1);
    await settle();
  });
});

describe('GET /api/portfolio', () => {
  it('reflects buys in the portfolio summary', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 2);
    await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 10 }).expect(200);

    const res = await api().get('/api/portfolio').set(user.auth);
    expect(res.status).toBe(200);
    const item = res.body.portfolio.find((p: any) => p.symbol === sym);
    expect(item.quantity).toBe(10);
    expect(item.total_value).toBeCloseTo(10 * 2 * TEST_USD_TRY, 2);
    expect(res.body.totalValue).toBeCloseTo(res.body.balance + res.body.portfolioValue, 2);
    await settle();
  });
});
