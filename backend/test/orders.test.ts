import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Veritabanı: bellek içi PGlite (uzak veritabanına asla bağlanılmaz).
// PGlite tek oturumludur: connect() bir mutex alır ve release() edilene kadar başka hiçbir sorgu
// (pool.query dahil) çalışmaz → transaction'lar birbirine karışmaz; eşzamanlı çağrılar sıraya girer.
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('../src/config/database', () => {
  let tail: Promise<void> = Promise.resolve();
  const acquire = async (): Promise<() => void> => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const prev = tail;
    tail = prev.then(() => held);
    await prev;
    return release;
  };
  const run = async (text: string, params?: unknown[]) => {
    const r = await h.db.query(text, params ?? []);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    default: {
      query: async (text: string, params?: unknown[]) => {
        const release = await acquire();
        try {
          return await run(text, params);
        } finally {
          release();
        }
      },
      connect: async () => {
        const release = await acquire();
        let done = false;
        return {
          query: run,
          release: () => {
            if (!done) {
              done = true;
              release();
            }
          },
        };
      },
    },
  };
});
// Yan etkiler (aktivite logu / rozet) bu testlerin konusu değil
vi.mock('../src/services/activityLog', () => ({ ActivityLogService: { createLog: async () => ({}) } }));
vi.mock('../src/services/badges', () => ({ BadgeService: { checkAndAwardBadges: async () => undefined } }));

const MIGRATIONS = ['000_base.sql', '001_hardening.sql', '004_orders.sql'];
const SYMBOL = 'EUR';

type Orders = typeof import('../src/services/orders');
type Tx = typeof import('../src/services/transaction');
type StopLoss = typeof import('../src/services/stopLoss');

describe('OrderService (PGlite)', () => {
  let orders: Orders;
  let tx: Tx;
  let stopLoss: StopLoss;
  let seq = 0;

  const q = async (sql: string, params: unknown[] = []) => (await h.db.query(sql, params)).rows as any[];
  const num = (v: unknown) => Number(v);

  const setPrice = (price: number, code = SYMBOL) =>
    q(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, $1, $2, $2, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET buying = EXCLUDED.buying, selling = EXCLUDED.selling, updated_at = CURRENT_TIMESTAMP`,
      [code, price]
    );

  const newUser = async (balance = 100_000) => {
    seq += 1;
    const rows = await q(
      `INSERT INTO users (username, email, password_hash, balance) VALUES ($1, $2, 'x', $3) RETURNING id`,
      [`u${seq}`, `u${seq}@test.io`, balance]
    );
    return rows[0].id as string;
  };

  const balanceOf = async (userId: string) => num((await q('SELECT balance FROM users WHERE id = $1', [userId]))[0].balance);
  const holdingOf = async (userId: string, symbol = SYMBOL) => {
    const rows = await q(`SELECT quantity FROM portfolio_items WHERE user_id = $1 AND symbol = $2`, [userId, symbol]);
    return rows[0] ? num(rows[0].quantity) : 0;
  };
  const orderRow = async (id: string) => (await q('SELECT * FROM orders WHERE id = $1', [id]))[0];

  const limitBuy = (userId: string, quantity: number, trigger: number) =>
    orders.OrderService.createOrder(userId, { asset_type: 'currency', symbol: SYMBOL, side: 'buy', type: 'limit', quantity, trigger_price: trigger });

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    orders = await import('../src/services/orders');
    tx = await import('../src/services/transaction');
    stopLoss = await import('../src/services/stopLoss');
  }, 60_000);

  afterAll(async () => {
    await h.db?.close();
  });

  beforeEach(async () => {
    await setPrice(40);
  });

  // ---------------------------------------------------------------------------

  it('limit alış: tetikleme fiyatından maliyet+komisyon kadar nakit ayırır', async () => {
    const userId = await newUser();
    const { order } = await limitBuy(userId, 100, 39);
    // 100 × 39 = 3900, komisyon ceil(9.75) = 9.75 → 3909.75
    expect(order.reserved_cash).toBeCloseTo(3909.75, 2);
    expect(order.status).toBe('active');
    expect(await balanceOf(userId)).toBeCloseTo(100_000 - 3909.75, 2);
    expect(new Date(order.expires_at!).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('anlamsız tetikleme fiyatlarını ve yetersiz bakiyeyi reddeder', async () => {
    const userId = await newUser(1_000);
    await expect(limitBuy(userId, 1, 40)).rejects.toMatchObject({ status: 400, publicMessage: 'Limit alış fiyatı güncel fiyatın altında olmalı' });
    await expect(limitBuy(userId, 100, 39)).rejects.toMatchObject({ status: 400, publicMessage: 'Yetersiz bakiye' });
    await expect(
      orders.OrderService.createOrder(userId, { asset_type: 'currency', symbol: SYMBOL, side: 'sell', type: 'limit', quantity: 1, trigger_price: 41 })
    ).rejects.toMatchObject({ publicMessage: 'Portföyde bu varlık bulunamadı' });
    expect(await balanceOf(userId)).toBeCloseTo(1_000, 2);
  });

  it('iptal: ayrılan nakdin tamamını iade eder; ikinci iptal 409', async () => {
    const userId = await newUser();
    const { order } = await limitBuy(userId, 10, 38.123);
    expect(await balanceOf(userId)).toBeLessThan(100_000);
    const res = await orders.OrderService.cancelOrder(userId, order.id);
    expect(res.refunded).toBeCloseTo(order.reserved_cash, 2);
    expect(res.order.status).toBe('cancelled');
    expect(res.order.reserved_cash).toBe(0);
    expect(await balanceOf(userId)).toBeCloseTo(100_000, 2);
    await expect(orders.OrderService.cancelOrder(userId, order.id)).rejects.toMatchObject({ status: 409 });
    // Başka kullanıcının emri iptal edilemez
    const other = await newUser();
    const { order: o2 } = await limitBuy(other, 1, 39);
    await expect(orders.OrderService.cancelOrder(userId, o2.id)).rejects.toMatchObject({ status: 404 });
  });

  it('executor: fiyat tetiklemeyi geçince limit alışı gerçek fiyattan doldurur ve artanı iade eder', async () => {
    const userId = await newUser();
    const { order } = await limitBuy(userId, 100, 39);

    // Fiyat henüz tetikleme üstünde → dokunulmaz
    await orders.OrderService.processOrders();
    expect((await orderRow(order.id)).status).toBe('active');

    await setPrice(38.5);
    const stats = await orders.OrderService.processOrders();
    expect(stats.filled).toBeGreaterThanOrEqual(1);

    const row = await orderRow(order.id);
    expect(row.status).toBe('filled');
    expect(num(row.filled_price)).toBeCloseTo(38.5, 6);
    expect(num(row.filled_quantity)).toBeCloseTo(100, 8);
    expect(num(row.reserved_cash)).toBe(0);
    expect(row.transaction_id).toBeTruthy();

    // Gerçek maliyet: 3850 + ceil(9.625)=9.63 → 3859.63; bakiye sadece bu kadar azalır
    expect(await balanceOf(userId)).toBeCloseTo(100_000 - 3859.63, 2);
    expect(await holdingOf(userId)).toBeCloseTo(100, 8);
    const txRow = (await q('SELECT * FROM transactions WHERE id = $1', [row.transaction_id]))[0];
    expect(txRow.type).toBe('buy');
    expect(num(txRow.net_amount)).toBeCloseTo(3859.63, 2);
  });

  it('executor: kâr al / limit satış fiyat yükselince, zarar durdur fiyat düşünce tetiklenir', async () => {
    const userId = await newUser();
    await tx.TransactionService.buy(userId, { symbol: SYMBOL, asset_type: 'currency', quantity: 30 });
    const mk = (type: 'limit' | 'stop_loss' | 'take_profit', trigger: number) =>
      orders.OrderService.createOrder(userId, { asset_type: 'currency', symbol: SYMBOL, side: 'sell', type, quantity: 10, trigger_price: trigger });

    await expect(mk('take_profit', 39)).rejects.toMatchObject({ publicMessage: 'Kâr al fiyatı güncel fiyatın üstünde olmalı' });
    await expect(mk('stop_loss', 41)).rejects.toMatchObject({ publicMessage: 'Zarar durdur fiyatı güncel fiyatın altında olmalı' });

    const tp = (await mk('take_profit', 42)).order;
    const lim = (await mk('limit', 43)).order;
    const sl = (await mk('stop_loss', 37)).order;

    await setPrice(42.5);
    await orders.OrderService.processOrders();
    expect((await orderRow(tp.id)).status).toBe('filled');
    expect((await orderRow(lim.id)).status).toBe('active');
    expect((await orderRow(sl.id)).status).toBe('active');
    expect(await holdingOf(userId)).toBeCloseTo(20, 8);

    await setPrice(36);
    await orders.OrderService.processOrders();
    const slRow = await orderRow(sl.id);
    expect(slRow.status).toBe('filled');
    expect(num(slRow.filled_price)).toBeCloseTo(36, 6);
    expect((await orderRow(lim.id)).status).toBe('active');
    expect(await holdingOf(userId)).toBeCloseTo(10, 8);
  });

  it('satış emri gerçekleşirken eldeki miktara indirilir; pozisyon kalmadıysa nedenle iptal edilir', async () => {
    const userId = await newUser();
    await tx.TransactionService.buy(userId, { symbol: SYMBOL, asset_type: 'currency', quantity: 100 });
    const capped = (
      await orders.OrderService.createOrder(userId, { asset_type: 'currency', symbol: SYMBOL, side: 'sell', type: 'stop_loss', quantity: 100, trigger_price: 35 })
    ).order;
    const orphan = (
      await orders.OrderService.createOrder(userId, { asset_type: 'currency', symbol: SYMBOL, side: 'sell', type: 'take_profit', quantity: 100, trigger_price: 45 })
    ).order;

    // Kullanıcı elle 60 adet satar → elde 40 kalır
    await tx.TransactionService.sell(userId, { symbol: SYMBOL, asset_type: 'currency', quantity: 60 });

    await setPrice(34);
    await orders.OrderService.processOrders();
    const row = await orderRow(capped.id);
    expect(row.status).toBe('filled');
    expect(num(row.filled_quantity)).toBeCloseTo(40, 8);
    expect(await holdingOf(userId)).toBe(0);

    // Pozisyon kapandı: diğer satış emri bir sonraki turda nedenle iptal edilir
    await setPrice(46);
    await orders.OrderService.processOrders();
    const o = await orderRow(orphan.id);
    expect(o.status).toBe('cancelled');
    expect(o.fail_reason).toBe('Pozisyon artık mevcut değil');
    expect(o.transaction_id).toBeNull();
  });

  it('executeOne: pozisyon silinmişse (süpürme olmadan) emri iptal eder', async () => {
    const userId = await newUser();
    await tx.TransactionService.buy(userId, { symbol: SYMBOL, asset_type: 'currency', quantity: 5 });
    const { order } = await orders.OrderService.createOrder(userId, {
      asset_type: 'currency', symbol: SYMBOL, side: 'sell', type: 'limit', quantity: 5, trigger_price: 41,
    });
    await q(`DELETE FROM portfolio_items WHERE user_id = $1`, [userId]);
    await setPrice(42);
    expect(await orders.OrderService.executeOne(order.id, userId)).toBe('cancelled');
    expect((await orderRow(order.id)).fail_reason).toBe('Pozisyon artık mevcut değil');
  });

  it('eşzamanlı executor çalışmaları aynı emri iki kez gerçekleştirmez', async () => {
    const a = await newUser();
    const b = await newUser();
    const ids = [
      (await limitBuy(a, 10, 39)).order.id,
      (await limitBuy(a, 20, 39.5)).order.id,
      (await limitBuy(b, 5, 39)).order.id,
    ];
    await setPrice(38);
    await Promise.all([
      orders.OrderService.processOrders(),
      orders.OrderService.processOrders(),
      orders.OrderService.processOrders(),
      orders.OrderService.executeOne(ids[0], a),
      orders.OrderService.executeOne(ids[2], b),
    ]);

    for (const id of ids) {
      const row = await orderRow(id);
      expect(row.status).toBe('filled');
      const txs = await q(`SELECT COUNT(*)::int AS n FROM transactions WHERE id = $1`, [row.transaction_id]);
      expect(txs[0].n).toBe(1);
    }
    const txCount = await q(`SELECT user_id, COUNT(*)::int AS n FROM transactions WHERE user_id IN ($1, $2) GROUP BY user_id`, [a, b]);
    expect(Object.fromEntries(txCount.map((r) => [r.user_id, r.n]))).toEqual({ [a]: 2, [b]: 1 });
    expect(await holdingOf(a)).toBeCloseTo(30, 8);
    expect(await holdingOf(b)).toBeCloseTo(5, 8);
    // a: 10×38 + 20×38 → 380 + ceil(0.95) ve 760 + ceil(1.90)
    expect(await balanceOf(a)).toBeCloseTo(100_000 - (380 + 0.95) - (760 + 1.9), 2);
  });

  it('süresi dolan emir kapanır ve rezerv iade edilir', async () => {
    const userId = await newUser();
    const { order } = await orders.OrderService.createOrder(userId, {
      asset_type: 'currency', symbol: SYMBOL, side: 'buy', type: 'limit', quantity: 10, trigger_price: 39, expires_in_days: 1,
    });
    await q(`UPDATE orders SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = $1`, [order.id]);
    await setPrice(38); // tetiklenecek olsa bile süresi dolmuş emir gerçekleşmez
    const stats = await orders.OrderService.processOrders();
    expect(stats.expired).toBeGreaterThanOrEqual(1);
    const row = await orderRow(order.id);
    expect(row.status).toBe('expired');
    expect(row.transaction_id).toBeNull();
    expect(await balanceOf(userId)).toBeCloseTo(100_000, 2);
  });

  it(`kullanıcı başına en fazla ${20} aktif emir`, async () => {
    const userId = await newUser();
    for (let i = 0; i < orders.MAX_ACTIVE_ORDERS; i++) {
      await limitBuy(userId, 1, 30);
    }
    await expect(limitBuy(userId, 1, 30)).rejects.toMatchObject({ status: 409, code: 'ORDER_LIMIT' });
    const { orders: list } = await orders.OrderService.listOrders(userId, 'active');
    expect(list).toHaveLength(orders.MAX_ACTIVE_ORDERS);
    await orders.OrderService.cancelOrder(userId, list[0].id);
    await expect(limitBuy(userId, 1, 30)).resolves.toMatchObject({ success: true });
    const { orders: hist } = await orders.OrderService.listOrders(userId, 'history');
    expect(hist).toHaveLength(1);
  });

  it('/api/stop-loss uyumluluk katmanı orders üzerinde çalışır', async () => {
    const userId = await newUser();
    const buy = await tx.TransactionService.buy(userId, { symbol: SYMBOL, asset_type: 'currency', quantity: 8 });
    const itemId = buy.portfolioItem!.id;

    const { stopLoss: created } = await stopLoss.StopLossService.createStopLoss(userId, { portfolio_item_id: itemId, trigger_price: 35 });
    expect(created).toMatchObject({ portfolio_item_id: itemId, status: 'active', quantity: 8 });
    const row = await orderRow(created.id);
    expect(row).toMatchObject({ type: 'stop_loss', side: 'sell' });

    const listed = await stopLoss.StopLossService.getStopLossOrders(userId);
    expect(listed.stopLossOrders.map((o) => o.id)).toContain(created.id);

    expect(await stopLoss.StopLossService.cancelStopLoss(userId, created.id)).toMatchObject({ success: true });
    expect(await stopLoss.StopLossService.cancelStopLoss(userId, created.id)).toMatchObject({ success: false });
  });

  it('004 migration eski aktif stop-loss emirlerini bir kez taşır (idempotent)', async () => {
    const userId = await newUser();
    await tx.TransactionService.buy(userId, { symbol: SYMBOL, asset_type: 'currency', quantity: 3 });
    const item = (await q(`SELECT id FROM portfolio_items WHERE user_id = $1`, [userId]))[0];
    const legacy = (
      await q(
        `INSERT INTO stop_loss_orders (user_id, portfolio_item_id, symbol, asset_type, quantity, trigger_price, status)
         VALUES ($1, $2, $3, 'currency', 3, 30, 'active') RETURNING id`,
        [userId, item.id, SYMBOL]
      )
    )[0];
    const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/004_orders.sql'), 'utf8');
    await h.db.exec(sql);
    await h.db.exec(sql);
    const migrated = await q(`SELECT * FROM orders WHERE legacy_stop_loss_id = $1`, [legacy.id]);
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({ user_id: userId, type: 'stop_loss', side: 'sell', status: 'active' });
    expect(num(migrated[0].trigger_price)).toBe(30);
  });

  it('shouldTrigger kuralları', () => {
    const t = orders.shouldTrigger;
    expect(t({ side: 'buy', type: 'limit', trigger_price: 10 }, 10)).toBe(true);
    expect(t({ side: 'buy', type: 'limit', trigger_price: 10 }, 10.01)).toBe(false);
    expect(t({ side: 'sell', type: 'limit', trigger_price: 10 }, 10)).toBe(true);
    expect(t({ side: 'sell', type: 'limit', trigger_price: 10 }, 9.99)).toBe(false);
    expect(t({ side: 'sell', type: 'take_profit', trigger_price: 10 }, 11)).toBe(true);
    expect(t({ side: 'sell', type: 'stop_loss', trigger_price: 10 }, 9)).toBe(true);
    expect(t({ side: 'sell', type: 'stop_loss', trigger_price: 10 }, 11)).toBe(false);
  });
});
