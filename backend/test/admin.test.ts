import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Veritabanı: bellek içi PGlite (uzak veritabanına asla bağlanılmaz). leagues.test.ts ile aynı desen.
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

const MIGRATIONS = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const LAST = MIGRATIONS[MIGRATIONS.length - 1];

const CSRF = { 'X-Requested-With': 'PortfoyGo' };
const DAY_MS = 24 * 60 * 60 * 1000;
/** Europe/Istanbul takvim günü (UTC+3, DST yok) */
const istanbulDate = (ms: number) => new Date(ms + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

type AdminSvc = typeof import('../src/services/admin');
type Jobs = typeof import('../src/services/jobs');

describe('Admin API (PGlite)', () => {
  let app: import('express').Express;
  let sign: (id: string, tv?: number) => string;
  let A: AdminSvc;
  let J: Jobs;
  let pool: any;
  let seq = 0;

  const q = async (sql: string, params: unknown[] = []) => (await h.db.query(sql, params)).rows as any[];

  const newUser = async (opts: { balance?: number; verified?: boolean; admin?: boolean; prefix?: string; createdAt?: string } = {}) => {
    seq += 1;
    const username = `${opts.prefix ?? 'u'}${seq}`;
    const rows = await q(
      `INSERT INTO users (username, email, password_hash, balance, email_verified, is_admin, created_at)
       VALUES ($1, $2, 'x', $3, $4, $5, COALESCE($6::timestamptz::timestamp, CURRENT_TIMESTAMP)) RETURNING id, username`,
      [username, `${username}@test.io`, opts.balance ?? 100_000, opts.verified ?? true, opts.admin ?? false, opts.createdAt ?? null]
    );
    const id = rows[0].id as string;
    return { id, username: rows[0].username as string, auth: { Authorization: `Bearer ${sign(id)}` } };
  };

  const addTx = async (userId: string, o: { type?: 'buy' | 'sell'; symbol: string; asset?: string; total?: number; at?: string }) => {
    const total = o.total ?? 1000;
    const rows = await q(
      `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at)
       VALUES ($1, $2, $3::text, $3::text || ' Corp', $4, 1, $5, $5, 0, $5, COALESCE($6::timestamptz::timestamp, CURRENT_TIMESTAMP)) RETURNING id`,
      [userId, o.type ?? 'buy', o.symbol, o.asset ?? 'stock', total, o.at ?? null]
    );
    return rows[0].id as string;
  };

  const addOrder = async (userId: string, o: { symbol: string; status?: string; reserved?: number; side?: 'buy' | 'sell'; type?: string }) => {
    const rows = await q(
      `INSERT INTO orders (user_id, asset_type, symbol, name, side, type, quantity, trigger_price, status, reserved_cash, expires_at)
       VALUES ($1, 'stock', $2, $2, $3, $4, 2, 100, $5, $6, CURRENT_TIMESTAMP + INTERVAL '30 days') RETURNING id`,
      [userId, o.symbol, o.side ?? 'buy', o.type ?? 'limit', o.status ?? 'active', o.reserved ?? 0]
    );
    return rows[0].id as string;
  };

  const auditRows = async (action: string) =>
    q(`SELECT * FROM admin_audit_log WHERE action = $1 ORDER BY created_at DESC`, [action]);

  let admin: Awaited<ReturnType<typeof newUser>>;
  let plain: Awaited<ReturnType<typeof newUser>>;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    // migration runner kaydı: son dosya hariç hepsi uygulanmış say (bekleyen tespiti)
    await h.db.exec(`CREATE TABLE schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, checksum VARCHAR(64))`);
    for (const f of MIGRATIONS.slice(0, -1)) {
      await h.db.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [f]);
    }

    app = (await import('../src/app')).createApp();
    A = await import('../src/services/admin');
    J = await import('../src/services/jobs');
    pool = (await import('../src/config/database')).default;
    const { AuthService } = await import('../src/services/auth');
    sign = (id: string, tv = 0) => AuthService.signSessionToken(id, tv);

    admin = await newUser({ admin: true, prefix: 'adm' });
    plain = await newUser({ prefix: 'plain' });
  }, 60_000);

  afterAll(async () => {
    await h.db?.close();
  });

  // ---------------------------------------------------------------------------
  // Yetki
  // ---------------------------------------------------------------------------

  const UUID = '00000000-0000-4000-8000-000000000000';
  const ROUTES: [method: 'get' | 'post' | 'delete', url: string][] = [
    ['get', '/api/admin/stats'],
    ['get', '/api/admin/metrics'],
    ['get', '/api/admin/health'],
    ['get', '/api/admin/transactions'],
    ['get', '/api/admin/orders'],
    ['post', `/api/admin/orders/${UUID}/cancel`],
    ['get', '/api/admin/users'],
    ['get', `/api/admin/users/${UUID}`],
    ['post', `/api/admin/users/${UUID}/ban`],
    ['post', `/api/admin/users/${UUID}/role`],
    ['post', `/api/admin/users/${UUID}/verify-email`],
    ['post', `/api/admin/users/${UUID}/revoke-sessions`],
    ['get', '/api/admin/leagues'],
    ['delete', `/api/admin/leagues/${UUID}`],
    ['get', '/api/admin/audit'],
    ['get', '/api/admin/jobs'],
    ['post', '/api/admin/jobs/orders/run'],
  ];

  it('her admin ucu: oturumsuz 401, admin olmayan 403', async () => {
    for (const [method, url] of ROUTES) {
      const anon = await request(app)[method](url).set(CSRF).send({});
      expect(anon.status, `${method} ${url} anon`).toBe(401);
      const user = await request(app)[method](url).set(plain.auth).send({});
      expect(user.status, `${method} ${url} user`).toBe(403);
      expect(user.body.success).toBe(false);
    }
    expect(await q(`SELECT * FROM admin_audit_log`)).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Metrikler
  // ---------------------------------------------------------------------------

  it('metrics: günler Europe/Istanbul takvimine göre kovalanır; totals', async () => {
    const now = Date.now();
    const D = istanbulDate(now - 3 * DAY_MS);
    const D1 = istanbulDate(now - 2 * DAY_MS);
    // D 20:30Z = İstanbul D 23:30 → D ; D 21:30Z = İstanbul D+1 00:30 → D+1
    const late = `${D}T20:30:00Z`;
    const afterMidnight = `${D}T21:30:00Z`;
    const u1 = await newUser({ createdAt: late });
    const u2 = await newUser({ createdAt: afterMidnight });
    await addTx(u1.id, { symbol: 'MTA', total: 1000, at: late });
    await addTx(u1.id, { symbol: 'MTA', total: 500, at: late });
    await addTx(u2.id, { symbol: 'MTB', total: 250, at: afterMidnight });
    await q(
      `INSERT INTO activity_logs (user_id, activity_type, description, created_at)
       VALUES ($1, 'login', 'x', $3::timestamptz::timestamp), ($1, 'login', 'y', $3::timestamptz::timestamp),
              ($2, 'login', 'z', $3::timestamptz::timestamp), ($1, 'login', 'w', $4::timestamptz::timestamp)`,
      [u1.id, u2.id, late, afterMidnight]
    );

    const res = await request(app).get('/api/admin/metrics?days=7').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const days = res.body.data.days as any[];
    expect(days).toHaveLength(7);
    expect(days[days.length - 1].date).toBe(istanbulDate(now));
    expect(days[0].date).toBe(istanbulDate(now - 6 * DAY_MS));
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate[D]).toEqual({ date: D, signups: 1, active_users: 2, transactions: 2, volume_try: 1500 });
    expect(byDate[D1]).toEqual({ date: D1, signups: 1, active_users: 1, transactions: 1, volume_try: 250 });

    const totals = res.body.data.totals;
    const users = Number((await q(`SELECT COUNT(*) AS n FROM users`))[0].n);
    expect(totals).toMatchObject({ users, admins: 1, transactions: 3, volume_try: 1750 });
    for (const k of ['verified_users', 'banned_users', 'active_orders', 'leagues', 'open_positions']) {
      expect(typeof totals[k]).toBe('number');
    }

    // days sınırları: 7..180 (sıkıştırılır)
    expect((await request(app).get('/api/admin/metrics?days=2').set(admin.auth)).body.data.days).toHaveLength(7);
    expect((await request(app).get('/api/admin/metrics?days=999').set(admin.auth)).body.data.days).toHaveLength(180);
    expect((await request(app).get('/api/admin/metrics').set(admin.auth)).body.data.days).toHaveLength(30);
  });

  // ---------------------------------------------------------------------------
  // Sağlık
  // ---------------------------------------------------------------------------

  it('computeHealthStatus: down > degraded (bayat / hatalı iş) > ok', () => {
    const fresh = { stock: false, crypto: false, fx: false, price_history: false };
    expect(A.computeHealthStatus({ dbOk: true, stale: fresh, jobs: [{ last_status: 'ok' }, { last_status: 'never' }] })).toBe('ok');
    expect(A.computeHealthStatus({ dbOk: true, stale: { ...fresh, fx: true }, jobs: [] })).toBe('degraded');
    expect(A.computeHealthStatus({ dbOk: true, stale: fresh, jobs: [{ last_status: 'error' }] })).toBe('degraded');
    expect(A.computeHealthStatus({ dbOk: true, stale: fresh, jobs: [{ last_status: 'running' }] })).toBe('ok');
    expect(A.computeHealthStatus({ dbOk: false, stale: fresh, jobs: [] })).toBe('down');
  });

  it('health: veri tazeliği eşikleri, iş hatası ve veritabanı erişilemezliği', async () => {
    await q(
      `INSERT INTO market_data_cache (asset_type, symbol, name, price, cached_at, expires_at) VALUES
         ('stock', 'HSTK', 'H', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour'),
         ('crypto', 'HCRY', 'H', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')`
    );
    await q(
      `INSERT INTO currency_rates (code, name, buying, selling, updated_at) VALUES ('USD', 'Dolar', 40, 40, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`
    );
    await q(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency, updated_at)
       VALUES ('stock', 'HSTK', 'm15', date_trunc('hour', now()), 1, 'USD', now())`
    );

    const registry = new J.JobRegistry(true);
    registry.register('ok-job', '* * * * *', async () => undefined);
    await registry.run('ok-job');

    let health = await A.AdminService.getHealth(registry);
    expect(health.status).toBe('ok');
    expect(health.db.ok).toBe(true);
    expect(health.data.stale).toEqual({ stock: false, crypto: false, fx: false, price_history: false });
    expect(health.jobs).toEqual([expect.objectContaining({ name: 'ok-job', last_status: 'ok', run_count: 1 })]);

    // Hisse cache'i 31 dk eski → bayat (eşik 30 dk)
    await q(`UPDATE market_data_cache SET cached_at = CURRENT_TIMESTAMP - INTERVAL '31 minutes' WHERE asset_type = 'stock'`);
    health = await A.AdminService.getHealth(registry);
    expect(health.status).toBe('degraded');
    expect(health.data.stale).toMatchObject({ stock: true, crypto: false });
    // Döviz 25 saat → taze (eşik 26 sa); 27 saat → bayat
    await q(`UPDATE market_data_cache SET cached_at = CURRENT_TIMESTAMP WHERE asset_type = 'stock'`);
    await q(`UPDATE currency_rates SET updated_at = CURRENT_TIMESTAMP - INTERVAL '25 hours'`);
    expect((await A.AdminService.getHealth(registry)).status).toBe('ok');
    await q(`UPDATE currency_rates SET updated_at = CURRENT_TIMESTAMP - INTERVAL '27 hours'`);
    health = await A.AdminService.getHealth(registry);
    expect(health.data.stale.fx).toBe(true);
    expect(health.status).toBe('degraded');
    await q(`UPDATE currency_rates SET updated_at = CURRENT_TIMESTAMP`);

    // Fiyat geçmişi 61 dk → bayat (eşik 1 sa)
    await q(`UPDATE price_history SET updated_at = now() - INTERVAL '61 minutes'`);
    expect((await A.AdminService.getHealth(registry)).data.stale.price_history).toBe(true);
    await q(`UPDATE price_history SET updated_at = now()`);

    // Hatalı iş → degraded
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registry.register('bad-job', '* * * * *', async () => {
      throw new Error('kota doldu');
    });
    await registry.run('bad-job');
    health = await A.AdminService.getHealth(registry);
    expect(health.status).toBe('degraded');
    expect(health.jobs.find((j) => j.name === 'bad-job')).toMatchObject({ last_status: 'error', last_error: 'kota doldu' });

    // Veritabanı yok → down
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    health = await A.AdminService.getHealth(new J.JobRegistry(true));
    spy.mockRestore();
    errSpy.mockRestore();
    expect(health.status).toBe('down');
    expect(health.db).toEqual({ ok: false, latency_ms: null });
  });

  it('GET /admin/health: sözleşme şekli, migration listesi', async () => {
    const res = await request(app).get('/api/admin/health').set(admin.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(['ok', 'degraded', 'down']).toContain(d.status);
    expect(d).toMatchObject({
      node: process.version,
      env: 'test',
      db: { ok: true },
      providers: { stocks: expect.any(String), crypto: expect.any(String), fx: expect.any(String), commodities: expect.any(String), news: expect.any(String) },
    });
    expect(typeof d.uptime_s).toBe('number');
    expect(typeof d.memory_mb).toBe('number');
    expect(typeof d.db.latency_ms).toBe('number');
    expect(d.migrations.applied).toEqual(MIGRATIONS.slice(0, -1));
    expect(d.migrations.latest).toBe(MIGRATIONS[MIGRATIONS.length - 2]);
    expect(d.migrations.pending).toEqual([LAST]);
    expect(Array.isArray(d.jobs)).toBe(true);
    expect(Object.keys(d.data).sort()).toEqual(['crypto_cache_at', 'fx_rates_at', 'price_history_at', 'stale', 'stock_cache_at']);
    expect(new Date(d.data.stock_cache_at).getTime()).toBeGreaterThan(Date.now() - 60 * 60 * 1000);
  });

  // ---------------------------------------------------------------------------
  // İşlemler / emirler
  // ---------------------------------------------------------------------------

  it('transactions: arama (kullanıcı adı / sembol, büyük-küçük harf duyarsız), filtreler, sayfalama', async () => {
    const trader = await newUser({ prefix: 'TraderX' });
    const other = await newUser({ prefix: 'other' });
    const old = new Date(Date.now() - 10 * DAY_MS).toISOString();
    await addTx(trader.id, { symbol: 'AAPLX', type: 'buy', at: old });
    await addTx(trader.id, { symbol: 'AAPLX', type: 'sell' });
    await addTx(trader.id, { symbol: 'BTCX', type: 'buy', asset: 'crypto' });
    await addTx(other.id, { symbol: 'aaplx2', type: 'buy' });

    const get = (qs: string) => request(app).get(`/api/admin/transactions?${qs}`).set(admin.auth);

    let res = await get(`search=${trader.username.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 3, limit: 50, offset: 0 });
    expect(res.body.data.items[0]).toEqual(
      expect.objectContaining({ user_id: trader.id, username: trader.username, quantity: 1, total_amount: 1000, commission: 0, net_amount: 1000 })
    );
    expect(Object.keys(res.body.data.items[0]).sort()).toEqual(
      ['asset_type', 'commission', 'created_at', 'id', 'name', 'net_amount', 'price', 'quantity', 'symbol', 'total_amount', 'type', 'user_id', 'username'].sort()
    );

    res = await get('search=aaplx');
    expect(res.body.data.total).toBe(3); // AAPLX x2 + aaplx2
    res = await get('search=aaplx&type=sell');
    expect(res.body.data.total).toBe(1);
    res = await get(`search=${trader.username}&asset_type=crypto`);
    expect(res.body.data.items.map((t: any) => t.symbol)).toEqual(['BTCX']);
    res = await get(`search=${trader.username}&from=${new Date(Date.now() - 2 * DAY_MS).toISOString()}`);
    expect(res.body.data.total).toBe(2);
    res = await get(`search=${trader.username}&to=${istanbulDate(Date.now() - 5 * DAY_MS)}`);
    expect(res.body.data.total).toBe(1);

    // Sayfalama + limit sıkıştırma
    res = await get(`search=${trader.username}&limit=1&offset=1`);
    expect(res.body.data).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(res.body.data.items).toHaveLength(1);
    expect((await get('limit=1000')).body.data.limit).toBe(100);
    expect((await get('limit=0')).body.data.limit).toBe(1);

    // LIKE joker karakterleri literal aranır
    expect((await get('search=%25')).body.data.total).toBe(0);
    expect((await get('type=hold')).status).toBe(400);
    expect((await get('from=dün')).status).toBe(400);
  });

  it('orders: durum / tip / arama filtreleri ve sayfalama', async () => {
    const u = await newUser({ prefix: 'ordX' });
    await addOrder(u.id, { symbol: 'ORDA', status: 'active', reserved: 100 });
    await addOrder(u.id, { symbol: 'ORDB', status: 'filled' });
    await addOrder(u.id, { symbol: 'ORDC', status: 'cancelled', side: 'sell', type: 'stop_loss' });

    const get = (qs: string) => request(app).get(`/api/admin/orders?${qs}`).set(admin.auth);
    let res = await get(`search=${u.username}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3); // varsayılan status=all
    res = await get(`search=${u.username}&status=active`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      user_id: u.id,
      username: u.username,
      asset_type: 'stock',
      symbol: 'ORDA',
      side: 'buy',
      type: 'limit',
      quantity: 2,
      trigger_price: 100,
      status: 'active',
      reserved_cash: 100,
      filled_price: null,
      fail_reason: null,
    });
    expect(res.body.data.items[0].expires_at).toBeTruthy();
    res = await get(`search=ordc&type=stop_loss`);
    expect(res.body.data.items.map((o: any) => o.symbol)).toEqual(['ORDC']);
    res = await get(`search=${u.username}&limit=2&offset=2`);
    expect(res.body.data).toMatchObject({ total: 3, limit: 2, offset: 2 });
    expect(res.body.data.items).toHaveLength(1);
    expect((await get('status=pending')).status).toBe(400);
  });

  it('POST /admin/orders/:id/cancel: rezerv iade edilir, fail_reason yazılır, audit kaydı', async () => {
    const u = await newUser({ balance: 1000, prefix: 'cnc' });
    await q(`UPDATE users SET reserved_cash = 500 WHERE id = $1`, [u.id]);
    const orderId = await addOrder(u.id, { symbol: 'CNCL', reserved: 500 });

    const res = await request(app)
      .post(`/api/admin/orders/${orderId}/cancel`)
      .set(admin.auth)
      .send({ reason: 'Hatalı fiyat' });
    expect(res.status).toBe(200);
    expect(res.body.data.refunded).toBe(500);
    expect(res.body.data.order).toMatchObject({ id: orderId, status: 'cancelled', reserved_cash: 0, fail_reason: 'Yönetici tarafından iptal: Hatalı fiyat' });

    const [row] = await q(`SELECT balance, reserved_cash FROM users WHERE id = $1`, [u.id]);
    expect(Number(row.balance)).toBe(1500);
    expect(Number(row.reserved_cash)).toBe(0);

    const audit = (await auditRows('order.cancel')).find((a) => a.target_id === orderId);
    expect(audit).toMatchObject({ admin_id: admin.id, target_type: 'order' });
    expect(audit.metadata).toMatchObject({ user_id: u.id, reason: 'Hatalı fiyat', refunded: 500 });

    // Tekrar iptal → 409; bilinmeyen → 404; neden yoksa varsayılan metin
    expect((await request(app).post(`/api/admin/orders/${orderId}/cancel`).set(admin.auth).send({})).status).toBe(409);
    expect((await request(app).post(`/api/admin/orders/${UUID}/cancel`).set(admin.auth).send({})).status).toBe(404);
    const o2 = await addOrder(u.id, { symbol: 'CNC2', side: 'sell', type: 'take_profit' });
    const r2 = await request(app).post(`/api/admin/orders/${o2}/cancel`).set(admin.auth);
    expect(r2.status).toBe(200);
    expect(r2.body.data).toMatchObject({ refunded: 0, order: { fail_reason: 'Yönetici tarafından iptal edildi' } });
  });

  // ---------------------------------------------------------------------------
  // Kullanıcılar
  // ---------------------------------------------------------------------------

  it('GET /admin/users: search + status filtreleri, eski yanıt şekli korunur', async () => {
    const banned = await newUser({ prefix: 'zzBanned' });
    await q(`UPDATE users SET is_banned = true WHERE id = $1`, [banned.id]);
    const unv = await newUser({ prefix: 'zzUnv', verified: false });

    let res = await request(app).get('/api/admin/users?search=ZZBANNED').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.users[0]).toMatchObject({ id: banned.id, is_banned: true, reserved_cash: 0, last_login: null });
    expect(res.body.data).toMatchObject({ total: 1, limit: 50, offset: 0 });

    res = await request(app).get('/api/admin/users?status=banned').set(admin.auth);
    expect(res.body.users.every((u: any) => u.is_banned)).toBe(true);
    expect(res.body.users.map((u: any) => u.id)).toContain(banned.id);
    res = await request(app).get('/api/admin/users?status=admins').set(admin.auth);
    expect(res.body.users.map((u: any) => u.id)).toEqual([admin.id]);
    res = await request(app).get('/api/admin/users?status=unverified&search=zz').set(admin.auth);
    expect(res.body.users.map((u: any) => u.id)).toEqual([unv.id]);
    expect((await request(app).get('/api/admin/users?status=vip').set(admin.auth)).status).toBe(400);
  });

  it('GET /admin/users/:id: detay (varlıklar, işlemler, emirler, aktivite, ligler, ödüller)', async () => {
    const u = await newUser({ balance: 5000, prefix: 'det' });
    await q(`UPDATE users SET reserved_cash = 200, rank = 7 WHERE id = $1`, [u.id]);
    await q(
      `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price, total_value)
       VALUES ($1, 'DETA', 'Det A', 'stock', 3, 100, 110, 330)`,
      [u.id]
    );
    for (let i = 0; i < 22; i++) await addTx(u.id, { symbol: 'DETA' });
    await addOrder(u.id, { symbol: 'DETA', reserved: 200 });
    await addOrder(u.id, { symbol: 'DETB', status: 'filled' });
    await q(`INSERT INTO activity_logs (user_id, activity_type, description, metadata) VALUES ($1, 'login', 'Giriş', '{"a":1}')`, [u.id]);
    const [league] = await q(
      `INSERT INTO leagues (name, owner_id, invite_code) VALUES ('Detay Ligi', $1, 'ABCDEFGH') RETURNING id`,
      [u.id]
    );
    await q(`INSERT INTO league_members (league_id, user_id, role, baseline_equity) VALUES ($1, $2, 'owner', 1000)`, [league.id, u.id]);
    const [season] = await q(
      `INSERT INTO seasons (slug, name, starts_at, ends_at, status) VALUES ('2026-01', 'Ocak 2026', '2026-01-01', '2026-02-01', 'finished') RETURNING id`
    );
    await q(`INSERT INTO season_awards (season_id, user_id, rank, title, return_pct) VALUES ($1, $2, 1, 'Sezon Şampiyonu', 12.5)`, [
      season.id,
      u.id,
    ]);

    const res = await request(app).get(`/api/admin/users/${u.id}`).set(admin.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.user).toMatchObject({
      id: u.id,
      username: u.username,
      email_verified: true,
      is_admin: false,
      is_banned: false,
      balance: 5000,
      reserved_cash: 200,
      portfolio_value: 330,
      total_value: 5530,
      rank: 7,
      last_login: null,
    });
    expect(d.holdings).toEqual([expect.objectContaining({ symbol: 'DETA', quantity: 3, average_price: 100, current_price: 110, total_value: 330 })]);
    expect(d.transactions).toHaveLength(20);
    expect(typeof d.transactions[0].total_amount).toBe('number');
    expect(d.orders.map((o: any) => o.symbol)).toEqual(['DETA']);
    expect(d.activity).toEqual([expect.objectContaining({ activity_type: 'login', metadata: { a: 1 } })]);
    expect(d.leagues).toEqual([{ id: league.id, name: 'Detay Ligi', role: 'owner' }]);
    expect(d.awards).toEqual([expect.objectContaining({ season_name: 'Ocak 2026', title: 'Sezon Şampiyonu', rank: 1 })]);

    expect((await request(app).get(`/api/admin/users/${UUID}`).set(admin.auth)).status).toBe(404);
    expect((await request(app).get(`/api/admin/users/not-a-uuid`).set(admin.auth)).status).toBe(400);
  });

  it('ban / unban: audit user.ban ve user.unban; kendini yasaklayamaz', async () => {
    const u = await newUser({ prefix: 'ban' });
    let res = await request(app).post(`/api/admin/users/${u.id}/ban`).set(admin.auth).send({ ban: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Kullanıcı yasaklandı' });
    expect((await request(app).get('/api/auth/verify').set(u.auth)).status).toBe(401);
    res = await request(app).post(`/api/admin/users/${u.id}/ban`).set(admin.auth).send({ ban: false });
    expect(res.status).toBe(200);
    expect((await auditRows('user.ban')).find((a) => a.target_id === u.id)).toMatchObject({ target_label: u.username, admin_id: admin.id });
    expect((await auditRows('user.unban')).find((a) => a.target_id === u.id)).toBeTruthy();

    expect((await request(app).post(`/api/admin/users/${admin.id}/ban`).set(admin.auth).send({ ban: true })).status).toBe(400);
    expect((await request(app).post(`/api/admin/users/${UUID}/ban`).set(admin.auth).send({ ban: true })).status).toBe(404);
  });

  it('role: kendi rolünü değiştiremez (400); rol değişir ve audit yazılır', async () => {
    const self = await request(app).post(`/api/admin/users/${admin.id}/role`).set(admin.auth).send({ is_admin: false });
    expect(self.status).toBe(400);
    expect(self.body.message).toBe('Kendi rolünüzü değiştiremezsiniz');

    const u = await newUser({ prefix: 'role' });
    expect((await request(app).get('/api/admin/stats').set(u.auth)).status).toBe(403);
    const res = await request(app).post(`/api/admin/users/${u.id}/role`).set(admin.auth).send({ is_admin: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: u.id, is_admin: true });
    expect((await request(app).get('/api/admin/stats').set(u.auth)).status).toBe(200);
    const audit = (await auditRows('user.role')).find((a) => a.target_id === u.id);
    expect(audit.metadata).toEqual({ from: false, to: true });

    await request(app).post(`/api/admin/users/${u.id}/role`).set(admin.auth).send({ is_admin: false });
    expect((await request(app).get('/api/admin/stats').set(u.auth)).status).toBe(403);
    expect((await request(app).post(`/api/admin/users/${u.id}/role`).set(admin.auth).send({ is_admin: 'yes' })).status).toBe(400);
    expect((await request(app).post(`/api/admin/users/${UUID}/role`).set(admin.auth).send({ is_admin: true })).status).toBe(404);
  });

  it('verify-email: doğrular ve audit yazar', async () => {
    const u = await newUser({ verified: false, prefix: 'ver' });
    const res = await request(app).post(`/api/admin/users/${u.id}/verify-email`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: u.id, email_verified: true, already_verified: false });
    expect((await q(`SELECT email_verified FROM users WHERE id = $1`, [u.id]))[0].email_verified).toBe(true);
    const again = await request(app).post(`/api/admin/users/${u.id}/verify-email`).set(admin.auth);
    expect(again.body.data.already_verified).toBe(true);
    expect((await auditRows('user.verify_email')).filter((a) => a.target_id === u.id)).toHaveLength(2);
  });

  it('revoke-sessions: token_version artar, eski oturum geçersiz olur', async () => {
    const u = await newUser({ prefix: 'rev' });
    expect((await request(app).get('/api/auth/verify').set(u.auth)).status).toBe(200);
    const res = await request(app).post(`/api/admin/users/${u.id}/revoke-sessions`).set(admin.auth);
    expect(res.status).toBe(200);
    expect((await q(`SELECT token_version FROM users WHERE id = $1`, [u.id]))[0].token_version).toBe(1);
    expect((await request(app).get('/api/auth/verify').set(u.auth)).status).toBe(401);
    expect((await request(app).get('/api/auth/verify').set({ Authorization: `Bearer ${sign(u.id, 1)}` })).status).toBe(200);
    expect((await auditRows('user.revoke_sessions')).find((a) => a.target_id === u.id)).toMatchObject({ target_label: u.username });
  });

  // ---------------------------------------------------------------------------
  // Ligler
  // ---------------------------------------------------------------------------

  it('leagues: liste (üye sayısı, sahip) + silme (audit league.delete)', async () => {
    const owner = await newUser({ prefix: 'lgOwner' });
    const member = await newUser({ prefix: 'lgMem' });
    const [lg] = await q(`INSERT INTO leagues (name, owner_id, invite_code) VALUES ('Silinecek Lig', $1, 'HJKMNPQR') RETURNING id`, [owner.id]);
    await q(
      `INSERT INTO league_members (league_id, user_id, role, baseline_equity) VALUES ($1, $2, 'owner', 1000), ($1, $3, 'member', 1000)`,
      [lg.id, owner.id, member.id]
    );

    let res = await request(app).get('/api/admin/leagues?search=silinecek').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(res.body.data.items[0]).toMatchObject({
      id: lg.id,
      name: 'Silinecek Lig',
      owner_id: owner.id,
      owner_username: owner.username,
      member_count: 2,
      invite_code: 'HJKMNPQR',
      ends_at: null,
    });
    expect((await request(app).get(`/api/admin/leagues?search=${owner.username}`).set(admin.auth)).body.data.total).toBe(1);

    res = await request(app).delete(`/api/admin/leagues/${lg.id}`).set(admin.auth).send({ reason: 'Uygunsuz isim' });
    expect(res.status).toBe(200);
    expect(await q(`SELECT 1 FROM leagues WHERE id = $1`, [lg.id])).toHaveLength(0);
    expect(await q(`SELECT 1 FROM league_members WHERE league_id = $1`, [lg.id])).toHaveLength(0);
    const audit = (await auditRows('league.delete')).find((a) => a.target_id === lg.id);
    expect(audit).toMatchObject({ target_label: 'Silinecek Lig', target_type: 'league' });
    expect(audit.metadata).toMatchObject({ reason: 'Uygunsuz isim', owner_id: owner.id, member_count: 2 });

    expect((await request(app).delete(`/api/admin/leagues/${lg.id}`).set(admin.auth)).status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  it('audit: filtreler (action, admin_id), sayfalama, admin_username', async () => {
    const admin2 = await newUser({ admin: true, prefix: 'adm2' });
    const target = await newUser({ prefix: 'aud' });
    await request(app).post(`/api/admin/users/${target.id}/revoke-sessions`).set(admin2.auth);
    await request(app).post(`/api/admin/users/${target.id}/verify-email`).set(admin2.auth);

    let res = await request(app).get(`/api/admin/audit?admin_id=${admin2.id}`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0]).toMatchObject({
      admin_id: admin2.id,
      admin_username: admin2.username,
      action: 'user.verify_email', // en yeni önce
      target_type: 'user',
      target_id: target.id,
      target_label: target.username,
    });
    expect(Object.keys(res.body.data.items[0]).sort()).toEqual(
      ['action', 'admin_id', 'admin_username', 'created_at', 'id', 'ip', 'metadata', 'target_id', 'target_label', 'target_type'].sort()
    );
    expect(typeof res.body.data.items[0].ip).toBe('string');

    res = await request(app).get(`/api/admin/audit?admin_id=${admin2.id}&action=user.revoke_sessions`).set(admin.auth);
    expect(res.body.data.items.map((a: any) => a.action)).toEqual(['user.revoke_sessions']);
    res = await request(app).get(`/api/admin/audit?limit=1&offset=1`).set(admin.auth);
    expect(res.body.data).toMatchObject({ limit: 1, offset: 1 });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBeGreaterThan(5);
    expect((await request(app).get(`/api/admin/audit?admin_id=abc`).set(admin.auth)).status).toBe(400);
    expect((await request(app).get(`/api/admin/audit?action=DROP TABLE`).set(admin.auth)).status).toBe(400);
  });

  it('audit log yazılamazsa asıl işlem etkilenmez', async () => {
    const { AuditService } = await import('../src/services/audit');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('disk dolu'));
    await expect(AuditService.log({ ip: '1.2.3.4' } as any, { action: 'job.run' })).resolves.toBeUndefined();
    spy.mockRestore();
    errSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // İşler
  // ---------------------------------------------------------------------------

  it('POST /admin/jobs/:name/run: 202, çalışırken 409, bilinmeyen 404, audit job.run', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    J.jobs.register('test-admin-job', '0 0 * * *', async () => {
      calls += 1;
      await gate;
    });

    const res = await request(app).post('/api/admin/jobs/test-admin-job/run').set(admin.auth);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ name: 'test-admin-job', started: true });
    expect(J.jobs.isRunning('test-admin-job')).toBe(true);

    const busy = await request(app).post('/api/admin/jobs/test-admin-job/run').set(admin.auth);
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe('JOB_RUNNING');

    const list = await request(app).get('/api/admin/jobs').set(admin.auth);
    expect(list.body.data.find((j: any) => j.name === 'test-admin-job')).toMatchObject({ last_status: 'running', run_count: 1 });

    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(1);
    expect(J.jobs.list().find((j) => j.name === 'test-admin-job')).toMatchObject({ last_status: 'ok', run_count: 1 });

    expect((await request(app).post('/api/admin/jobs/nope/run').set(admin.auth)).status).toBe(404);
    expect((await request(app).post('/api/admin/jobs/BAD!/run').set(admin.auth)).status).toBe(400);
    expect((await auditRows('job.run')).filter((a) => a.target_id === 'test-admin-job')).toHaveLength(1);

    // Çerezle gelen POST: CSRF başlığı olmadan 403 (Bearer muaf)
    const cookie = await request(app).post('/api/admin/jobs/test-admin-job/run').set('Cookie', `pg_session=${sign(admin.id)}`);
    expect(cookie.status).toBe(403);
  });

  it('cache yenileme uçları audit yazar (sağlayıcılar taklit edilir, dış API çağrılmaz)', async () => {
    const { MarketCacheService } = await import('../src/services/marketCache');
    const { providers } = await import('../src/providers');
    const refresh = vi.spyOn(MarketCacheService, 'refreshCache').mockResolvedValue(undefined as any);
    const fx = vi.spyOn(providers.fx, 'refreshRates').mockResolvedValue(3 as any);
    try {
      expect((await request(app).post('/api/stocks/refresh-cache').set(plain.auth)).status).toBe(403);
      const s = await request(app).post('/api/stocks/refresh-cache').set(admin.auth);
      expect(s.status).toBe(200);
      const c = await request(app).post('/api/currencies/refresh').set(admin.auth);
      expect(c.status).toBe(200);
    } finally {
      refresh.mockRestore();
      fx.mockRestore();
    }
    const [stocks] = await auditRows('cache.refresh_stocks');
    expect(stocks).toMatchObject({ admin_id: admin.id, target_type: 'cache', target_id: 'stock' });
    expect(typeof stocks.metadata.count).toBe('number');
    const [cur] = await auditRows('cache.refresh_currencies');
    expect(cur).toMatchObject({ admin_id: admin.id, target_type: 'cache', target_id: 'fx' });
    expect(cur.metadata).toEqual({ count: 3 });
  });
});
