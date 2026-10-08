import { describe, expect, it } from 'vitest';
import { OrderService } from '../src/services/orders';
import { api, createUser, getBalance, getHolding, pool, setMarketPrice, settle, uniqueSymbol, TEST_USD_TRY } from './helpers';

describe('stop-loss orders', () => {
  it('creates, lists and triggers a stop-loss when the price drops to the trigger', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 10); // 400 TL
    await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 4 }).expect(200);

    // Fiyatın üzerinde tetikleme reddedilir
    const bad = await api()
      .post('/api/orders')
      .set(user.auth)
      .send({ asset_type: 'stock', symbol: sym, side: 'sell', type: 'stop_loss', quantity: 4, trigger_price: 500 });
    expect(bad.status).toBe(400);

    const created = await api()
      .post('/api/orders')
      .set(user.auth)
      .send({ asset_type: 'stock', symbol: sym, side: 'sell', type: 'stop_loss', quantity: 3, trigger_price: 380 });
    expect(created.status).toBe(201);
    const orderId = created.body.order.id;

    const list = await api().get('/api/orders').set(user.auth);
    expect(list.status).toBe(200);
    expect(list.body.orders.map((o: any) => o.id)).toContain(orderId);

    // Fiyat tetikleme seviyesinin üzerindeyken hiçbir şey olmaz
    await OrderService.processOrders();
    expect(await getHolding(user.id, sym)).toBe(4);

    // Fiyat düşer → emir gerçekleşir
    const balanceBefore = await getBalance(user.id);
    await setMarketPrice(sym, 9); // 360 TL ≤ 380
    await OrderService.processOrders();

    const order = await pool.query('SELECT status, filled_quantity, filled_price, transaction_id FROM orders WHERE id = $1', [orderId]);
    expect(order.rows[0].status).toBe('filled');
    expect(parseFloat(order.rows[0].filled_quantity)).toBe(3);
    expect(parseFloat(order.rows[0].filled_price)).toBeCloseTo(9 * TEST_USD_TRY, 6);
    expect(order.rows[0].transaction_id).toBeTruthy();
    expect(await getHolding(user.id, sym)).toBe(1);
    expect(await getBalance(user.id)).toBeGreaterThan(balanceBefore);

    const tx = await pool.query(`SELECT type, quantity FROM transactions WHERE id = $1`, [order.rows[0].transaction_id]);
    expect(tx.rows[0].type).toBe('sell');
    await settle();
  });

  it('legacy /api/stop-loss endpoint creates and lists an order', async () => {
    const user = await createUser();
    const sym = uniqueSymbol();
    await setMarketPrice(sym, 10);
    const buy = await api().post('/api/transactions/buy').set(user.auth).send({ symbol: sym, asset_type: 'stock', quantity: 2 });
    expect(buy.status).toBe(200);

    const created = await api()
      .post('/api/stop-loss')
      .set(user.auth)
      .send({ portfolio_item_id: buy.body.portfolioItem.id, trigger_price: 300 });
    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);

    const list = await api().get('/api/stop-loss').set(user.auth);
    expect(list.status).toBe(200);
    expect(list.body.stopLossOrders.length).toBe(1);
    await settle();
  });
});
