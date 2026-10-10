import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationService, MAX_PER_USER } from '../src/services/notifications';
import { notificationBus, NotificationBusEvent } from '../src/services/notificationBus';
import { OrderService } from '../src/services/orders';
import { SeasonService } from '../src/services/seasons';
import { BadgeService } from '../src/services/badges';
import { EmailService } from '../src/services/email';
import { api, app, createUser, pool, setMarketPrice, settle, uniqueSymbol, TestUser } from './helpers';

// Paylaşılan PGlite (test/globalSetup.ts) + gerçek pg havuzu: SAVEPOINT / COMMIT kancası gerçek client ile çalışır.

const sys = (title: string) => ({ type: 'system.test', category: 'system' as const, title, body: `${title} gövde` });

async function countFor(userId: string, extra = ''): Promise<number> {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 ${extra}`, [userId]);
  return r.rows[0].n;
}

/** Bus olaylarını toplar */
function collect(userId: string) {
  const events: NotificationBusEvent[] = [];
  const off = notificationBus.subscribe(userId, (e) => events.push(e));
  return { events, off };
}

describe('NotificationService', () => {
  it('notify: tek/çoklu kullanıcı, geçersiz ID atlanır; orders/competition tercihine uyulur, account/system her zaman', async () => {
    const a = await createUser();
    const b = await createUser();

    expect(await NotificationService.notify([a.id, b.id, 'not-a-uuid', a.id], sys('Merhaba'))).toBe(2);
    expect(await countFor(a.id)).toBe(1);
    expect(await countFor(b.id)).toBe(1);

    await NotificationService.setPrefs(a.id, { orders: false });
    expect(await NotificationService.getPrefs(a.id)).toEqual({ orders: false, competition: true, account: true, system: true });

    const order = { type: 'order.filled', category: 'orders' as const, title: 'Emir', body: 'x' };
    expect(await NotificationService.notify([a.id, b.id], order)).toBe(1); // a kapattı
    expect(await countFor(a.id, `AND category = 'orders'`)).toBe(0);
    expect(await countFor(b.id, `AND category = 'orders'`)).toBe(1);

    // account / system tercihten bağımsız
    await pool.query(`UPDATE users SET notification_prefs = '{"orders":false,"competition":false,"account":false,"system":false}' WHERE id = $1`, [a.id]);
    expect(await NotificationService.notify(a.id, { type: 'account.x', category: 'account', title: 't', body: 'b' })).toBe(1);
    expect(await NotificationService.notify(a.id, { type: 'badge.earned', category: 'competition', title: 't', body: 'b' })).toBe(0);

    // Geçersiz kategori → 0, hata fırlatmaz
    expect(await NotificationService.notify(a.id, { type: 'x', category: 'nope' as any, title: 't', body: 'b' })).toBe(0);
  });

  it('notify: uzun metinler kesilir ve canlı yayın (client yoksa) hemen yapılır', async () => {
    const u = await createUser();
    const { events, off } = collect(u.id);
    await NotificationService.notify(u.id, { ...sys('t'.repeat(300)), body: 'b'.repeat(900), data: { k: 1 } });
    off();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.kind).toBe('notification');
    if (ev.kind !== 'notification') return;
    expect(ev.item.title.length).toBe(160);
    expect(ev.item.body.length).toBe(500);
    expect(ev.item.data).toEqual({ k: 1 });
    expect(ev.item.read_at).toBeNull();
  });

  it(`kullanıcı başına en yeni ${MAX_PER_USER} bildirim tutulur`, async () => {
    const u = await createUser();
    await pool.query(
      `INSERT INTO notifications (user_id, type, category, title, body, created_at)
       SELECT $1, 'system.test', 'system', 'eski ' || g, 'b', now() - (g * INTERVAL '1 minute')
         FROM generate_series(1, $2::int) g`,
      [u.id, MAX_PER_USER + 5]
    );
    await NotificationService.notify(u.id, sys('yeni'));
    expect(await countFor(u.id)).toBe(MAX_PER_USER);
    // En eskiler silindi, en yeni kaldı
    const newest = await pool.query(`SELECT title FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [u.id]);
    expect(newest.rows[0].title).toBe('yeni');
    const oldest = await pool.query(`SELECT title FROM notifications WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`, [u.id]);
    expect(oldest.rows[0].title).toBe(`eski ${MAX_PER_USER - 1}`);
  });

  it('client ile: bildirim çağıranın transaction\'ına katılır; yayın COMMIT sonrası, ROLLBACK → ne satır ne yayın', async () => {
    const u = await createUser();
    const { events, off } = collect(u.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      expect(await NotificationService.notify(u.id, sys('commit'), client)).toBe(1);
      await settle();
      expect(events).toHaveLength(0); // henüz commit edilmedi
      await client.query('COMMIT');
      await settle();
      expect(events.filter((e) => e.kind === 'notification')).toHaveLength(1);

      await client.query('BEGIN');
      await NotificationService.notify(u.id, sys('rollback'), client);
      await client.query('ROLLBACK');
      await settle();
      expect(events.filter((e) => e.kind === 'notification')).toHaveLength(1);

      // Transaction dışında client: autocommit gibi
      expect(await NotificationService.notify(u.id, sys('auto'), client)).toBe(1);
      expect(events.filter((e) => e.kind === 'notification')).toHaveLength(2);
    } finally {
      client.release();
      off();
    }
    const titles = (await pool.query(`SELECT title FROM notifications WHERE user_id = $1 ORDER BY created_at`, [u.id])).rows.map((r) => r.title);
    expect(titles).toEqual(['commit', 'auto']);
  });
});

describe('/api/notifications', () => {
  let user: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    user = await createUser();
    other = await createUser();
    for (let i = 0; i < 5; i++) {
      await NotificationService.notify(user.id, { ...sys(`s${i}`), category: i % 2 === 0 ? 'system' : 'account' });
      await new Promise((r) => setTimeout(r, 3)); // created_at sırası kesin olsun
    }
    await NotificationService.notify(other.id, sys('başkasının'));
  });

  it('oturum gerektirir', async () => {
    await api().get('/api/notifications').expect(401);
    await api().get('/api/notifications/stream').expect(401);
  });

  it('liste: yeniden eskiye, before imleciyle sayfalama, unread_count', async () => {
    const p1 = await api().get('/api/notifications?limit=2').set(user.auth).expect(200);
    expect(p1.body.data.items.map((i: any) => i.title)).toEqual(['s4', 's3']);
    expect(p1.body.data.unread_count).toBe(5);
    expect(typeof p1.body.data.next_before).toBe('string');
    expect(Object.keys(p1.body.data.items[0]).sort()).toEqual(
      ['body', 'category', 'created_at', 'data', 'id', 'link', 'read_at', 'title', 'type'].sort()
    );

    const p2 = await api().get('/api/notifications').query({ limit: 2, before: p1.body.data.next_before }).set(user.auth).expect(200);
    expect(p2.body.data.items.map((i: any) => i.title)).toEqual(['s2', 's1']);
    const p3 = await api().get('/api/notifications').query({ limit: 2, before: p2.body.data.next_before }).set(user.auth).expect(200);
    expect(p3.body.data.items.map((i: any) => i.title)).toEqual(['s0']);
    expect(p3.body.data.next_before).toBeNull();

    const acc = await api().get('/api/notifications?category=account').set(user.auth).expect(200);
    expect(acc.body.data.items.map((i: any) => i.title)).toEqual(['s3', 's1']);

    await api().get('/api/notifications?before=dun').set(user.auth).expect(400);
    await api().get('/api/notifications?category=nope').set(user.auth).expect(400);
  });

  it('okundu / tümü okundu / silme yalnızca sahibine; başkasının ID\'si → 404', async () => {
    const list = await api().get('/api/notifications').set(user.auth).expect(200);
    const [first, second] = list.body.data.items;
    const foreign = (await pool.query(`SELECT id FROM notifications WHERE user_id = $1 LIMIT 1`, [other.id])).rows[0].id;

    const read = await api().post(`/api/notifications/${first.id}/read`).set(user.auth).expect(200);
    expect(read.body.data.id).toBe(first.id);
    expect(typeof read.body.data.read_at).toBe('string');
    // İdempotent: aynı read_at
    const again = await api().post(`/api/notifications/${first.id}/read`).set(user.auth).expect(200);
    expect(again.body.data.read_at).toBe(read.body.data.read_at);

    await api().post(`/api/notifications/${foreign}/read`).set(user.auth).expect(404);
    await api().delete(`/api/notifications/${foreign}`).set(user.auth).expect(404);
    await api().post(`/api/notifications/not-a-uuid/read`).set(user.auth).expect(400);

    let count = await api().get('/api/notifications/unread-count').set(user.auth).expect(200);
    expect(count.body.data).toEqual({ count: 4 });

    const unreadOnly = await api().get('/api/notifications?unread=1').set(user.auth).expect(200);
    expect(unreadOnly.body.data.items.map((i: any) => i.id)).not.toContain(first.id);

    const accRead = await api().post('/api/notifications/read-all').set(user.auth).send({ category: 'account' }).expect(200);
    expect(accRead.body.data.updated).toBe(2); // s3 + s1 (first = s4, system)
    await api().post('/api/notifications/read-all').set(user.auth).send({ category: 'x' }).expect(400);
    const all = await api().post('/api/notifications/read-all').set(user.auth).send({}).expect(200);
    expect(all.body.data.updated).toBe(2);
    count = await api().get('/api/notifications/unread-count').set(user.auth).expect(200);
    expect(count.body.data.count).toBe(0);

    const del = await api().delete(`/api/notifications/${second.id}`).set(user.auth).expect(200);
    expect(del.body.data).toEqual({ id: second.id });
    await api().delete(`/api/notifications/${second.id}`).set(user.auth).expect(404);

    // Diğer kullanıcının bildirimi dokunulmadan duruyor
    expect(await countFor(other.id, 'AND read_at IS NULL')).toBe(1);
  });

  it('tercihler: GET varsayılan, PUT kısmi güncelleme + doğrulama', async () => {
    const get = await api().get('/api/notifications/prefs').set(other.auth).expect(200);
    expect(get.body.data).toEqual({ orders: true, competition: true, account: true, system: true });

    const put = await api().put('/api/notifications/prefs').set(other.auth).send({ competition: false }).expect(200);
    expect(put.body.data).toEqual({ orders: true, competition: false, account: true, system: true });
    const put2 = await api().put('/api/notifications/prefs').set(other.auth).send({ orders: false }).expect(200);
    expect(put2.body.data).toEqual({ orders: false, competition: false, account: true, system: true });

    await api().put('/api/notifications/prefs').set(other.auth).send({}).expect(400);
    await api().put('/api/notifications/prefs').set(other.auth).send({ orders: 'no' }).expect(400);
    const sysRes = await api().put('/api/notifications/prefs').set(other.auth).send({ system: false }).expect(400);
    expect(sysRes.body.message).toMatch(/orders/);
  });

  it('çerezle gelen yazma isteğinde CSRF başlığı zorunlu', async () => {
    await api().post('/api/notifications/read-all').set('Cookie', `pg_session=${user.token}`).send({}).expect(403);
    await api()
      .post('/api/notifications/read-all')
      .set('Cookie', `pg_session=${user.token}`)
      .set('X-Requested-With', 'PortfoyGo')
      .send({})
      .expect(200);
  });
});

describe('/api/notifications/stream (SSE)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('text/event-stream döner, önce unread, yeni bildirimde notification + unread gönderir, kapanınca dinleyiciyi temizler', async () => {
    const u = await createUser();
    await NotificationService.notify(u.id, sys('önceki'));

    let buffer = '';
    let resolveWait: (() => void) | null = null;
    let waitFor = '';
    const until = (needle: string) =>
      new Promise<void>((resolve, reject) => {
        if (buffer.includes(needle)) return resolve();
        waitFor = needle;
        resolveWait = resolve;
        setTimeout(() => reject(new Error(`SSE zaman aşımı: ${needle}\n${buffer}`)), 5000);
      });

    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/api/notifications/stream',
      headers: { ...u.auth, Origin: 'http://localhost:3000', Accept: 'text/event-stream' },
    });
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      req.on('response', resolve);
      req.on('error', reject);
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buffer += chunk;
      if (resolveWait && buffer.includes(waitFor)) {
        const r = resolveWait;
        resolveWait = null;
        r();
      }
    });

    await until('event: unread\ndata: {"count":1}\n\n');
    expect(notificationBus.subscriberCount(u.id)).toBe(1);

    await NotificationService.notify(u.id, sys('canlı'));
    await until('event: unread\ndata: {"count":2}\n\n');
    const notifBlock = buffer.split('\n\n').find((b) => b.startsWith('event: notification'));
    expect(notifBlock).toBeDefined();
    const item = JSON.parse(notifBlock!.split('\n')[1].slice('data: '.length));
    expect(item).toMatchObject({ title: 'canlı', category: 'system', type: 'system.test', read_at: null });
    // notification olayı, sonraki unread olayından önce gelir
    expect(buffer.indexOf('event: notification')).toBeLessThan(buffer.lastIndexOf('event: unread'));

    // Okundu işaretlemek sayıyı tazeler
    await NotificationService.markAllRead(u.id);
    await until('event: unread\ndata: {"count":0}\n\n');

    req.destroy();
    for (let i = 0; i < 50 && notificationBus.subscriberCount(u.id) > 0; i++) await settle();
    expect(notificationBus.subscriberCount(u.id)).toBe(0);
  });
});

describe('Admin duyuruları', () => {
  let admin: TestUser;

  beforeAll(async () => {
    admin = await createUser();
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
  });

  it('yalnızca admin', async () => {
    const u = await createUser();
    await api().post('/api/admin/announcements').set(u.auth).send({ title: 'Selam', body: 'x' }).expect(403);
    await api().get('/api/admin/announcements').set(u.auth).expect(403);
  });

  it('doğrulama: başlık 3–160, metin 1–500, bağlantı göreli yol ya da https', async () => {
    const post = (body: object) => api().post('/api/admin/announcements').set(admin.auth).send(body);
    await post({ title: 'ab', body: 'x' }).expect(400);
    await post({ title: 'abc', body: '' }).expect(400);
    await post({ title: 'a'.repeat(161), body: 'x' }).expect(400);
    await post({ title: 'abc', body: 'x'.repeat(501) }).expect(400);
    for (const link of ['//evil.com', '/\\evil.com', 'http://example.com', 'javascript:alert(1)', 'portfolio']) {
      await post({ title: 'abc', body: 'x', link }).expect(400);
    }
  });

  it('yasaklı olmayan herkese system.announcement; alıcı sayısı, liste ve audit kaydı', async () => {
    const banned = await createUser();
    await pool.query('UPDATE users SET is_banned = true WHERE id = $1', [banned.id]);
    const optedOut = await createUser();
    await pool.query(`UPDATE users SET notification_prefs = '{"orders":false,"competition":false}' WHERE id = $1`, [optedOut.id]);

    const expected = (await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE COALESCE(is_banned, false) = false')).rows[0].n;
    const res = await api()
      .post('/api/admin/announcements')
      .set(admin.auth)
      .send({ title: 'Bakım duyurusu', body: 'Cumartesi 02:00-03:00 arası bakım yapılacak.', link: '/news' })
      .expect(201);
    expect(res.body.data.recipients).toBe(expected);
    const id = res.body.data.id;

    const got = async (userId: string) =>
      (await pool.query(`SELECT type, category, title, link, data FROM notifications WHERE user_id = $1 AND data->>'announcement_id' = $2`, [userId, id])).rows;
    expect(await got(banned.id)).toHaveLength(0);
    expect(await got(optedOut.id)).toEqual([
      { type: 'system.announcement', category: 'system', title: 'Bakım duyurusu', link: '/news', data: { announcement_id: id } },
    ]);

    const list = await api().get('/api/admin/announcements?limit=5&offset=0').set(admin.auth).expect(200);
    expect(list.body.data).toMatchObject({ limit: 5, offset: 0 });
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);
    expect(list.body.data.items[0]).toMatchObject({
      id,
      title: 'Bakım duyurusu',
      body: 'Cumartesi 02:00-03:00 arası bakım yapılacak.',
      link: '/news',
      created_by_username: admin.username,
      recipients: expected,
    });

    const audit = await pool.query(`SELECT target_id, admin_id FROM admin_audit_log WHERE action = 'announcement.create' AND target_id = $1`, [id]);
    expect(audit.rows).toEqual([{ target_id: id, admin_id: admin.id }]);

    // https bağlantı da kabul edilir
    await api().post('/api/admin/announcements').set(admin.auth).send({ title: 'Dış', body: 'x', link: 'https://example.com/a' }).expect(201);
  });
});

describe('Tetikleyiciler', () => {
  const latest = async (userId: string, type: string) =>
    (await pool.query(`SELECT * FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC`, [userId, type])).rows;

  it('emir gerçekleşince order.filled (orders, /portfolio); tercih kapalıysa gönderilmez', async () => {
    const u = await createUser();
    const sym = uniqueSymbol('N');
    await setMarketPrice(sym, 100); // 4000 TL
    const { order } = await OrderService.createOrder(u.id, {
      asset_type: 'stock',
      symbol: sym,
      side: 'buy',
      type: 'limit',
      quantity: 1,
      trigger_price: 3900,
    });
    await setMarketPrice(sym, 95); // 3800 TL ≤ 3900
    const { events, off } = collect(u.id);
    expect(await OrderService.executeOne(order.id, u.id)).toBe('filled');
    await settle();
    off();

    const rows = await latest(u.id, 'order.filled');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'orders', title: 'Emriniz gerçekleşti', link: '/portfolio' });
    expect(rows[0].body).toContain(`${sym} limit alış emriniz`);
    expect(rows[0].body).toMatch(/₺3\.800,00 fiyattan gerçekleşti/);
    expect(rows[0].data).toMatchObject({ order_id: order.id, symbol: sym, side: 'buy', order_type: 'limit', price: 3800 });
    // Commit sonrası canlı yayın
    expect(events.some((e) => e.kind === 'notification' && e.item.type === 'order.filled')).toBe(true);

    // Tercih kapalı → bildirim yok (emir yine gerçekleşir)
    await NotificationService.setPrefs(u.id, { orders: false });
    await setMarketPrice(sym, 100);
    const second = await OrderService.createOrder(u.id, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'limit', quantity: 1, trigger_price: 3900 });
    await setMarketPrice(sym, 95);
    expect(await OrderService.executeOne(second.order.id, u.id)).toBe('filled');
    expect(await latest(u.id, 'order.filled')).toHaveLength(1);
  });

  it('süresi dolan emir order.expired (iade tutarıyla), yönetici iptali order.cancelled_admin', async () => {
    const u = await createUser();
    const sym = uniqueSymbol('N');
    await setMarketPrice(sym, 100);
    const { order } = await OrderService.createOrder(u.id, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'limit', quantity: 1, trigger_price: 3000 });
    await pool.query(`UPDATE orders SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = $1`, [order.id]);
    expect(await OrderService.expireOne(order.id, u.id)).toBe(true);
    const expired = await latest(u.id, 'order.expired');
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ category: 'orders', title: 'Emrinizin süresi doldu', link: '/portfolio' });
    expect(expired[0].body).toMatch(new RegExp(`^${sym} limit alış emrinizin süresi doldu\\. ₺3\\.\\d{3},\\d{2} bakiyenize iade edildi\\.$`));

    const { order: o2 } = await OrderService.createOrder(u.id, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'limit', quantity: 1, trigger_price: 3000 });
    // Kullanıcı iptali bildirim üretmez
    await OrderService.cancelOrder(u.id, o2.id);
    expect(await latest(u.id, 'order.cancelled_admin')).toHaveLength(0);

    const { order: o3 } = await OrderService.createOrder(u.id, { asset_type: 'stock', symbol: sym, side: 'buy', type: 'limit', quantity: 1, trigger_price: 3000 });
    await OrderService.cancelOrderAsAdmin(o3.id, 'Test nedeni');
    const cancelled = await latest(u.id, 'order.cancelled_admin');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].body).toContain('yönetici tarafından iptal edildi (Test nedeni)');
    expect(cancelled[0].data).toMatchObject({ order_id: o3.id, reason: 'Test nedeni' });
  });

  it('rozet kazanılınca badge.earned (bir kez), e-posta doğrulanınca account.email_verified', async () => {
    const u = await createUser({ verified: false });
    await pool.query(
      `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
       VALUES ($1, 'buy', 'AAPL', 'Apple', 'stock', 1, 100, 100, 0.25, 100.25)`,
      [u.id]
    );
    await BadgeService.checkAndAwardBadges(u.id);
    await BadgeService.checkAndAwardBadges(u.id); // tekrar → yeni bildirim yok
    const badges = await latest(u.id, 'badge.earned');
    const first = badges.find((b) => b.title === 'Yeni rozet: İlk İşlem');
    expect(first).toMatchObject({ category: 'competition', link: '/profile' });
    expect(badges.filter((b) => b.title === 'Yeni rozet: İlk İşlem')).toHaveLength(1);

    await pool.query(
      `INSERT INTO email_verifications (user_id, email, verification_code, expires_at, purpose, attempts)
       VALUES ($1, $2, '123456', CURRENT_TIMESTAMP + INTERVAL '10 minutes', 'verify', 0)`,
      [u.id, u.email]
    );
    const r = await new EmailService().verifyCode(u.id, '123456');
    expect(r.success).toBe(true);
    const ev = await latest(u.id, 'account.email_verified');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ category: 'account', title: 'E-posta adresin doğrulandı' });
  });

  it('sezon sonlandırılınca ödül alanlara season.award (competition, /profile)', async () => {
    const at = new Date(Date.UTC(2001, 4, 15, 12)); // Mayıs 2001 — diğer testlerle çakışmaz
    const season = await SeasonService.ensureCurrentSeason(at);
    const champ = await createUser({ balance: 120_000 });
    const second = await createUser({ balance: 110_000 });
    for (const [i, id] of [champ.id, second.id].entries()) {
      await pool.query(
        `INSERT INTO season_participants (season_id, user_id, baseline_equity, joined_at) VALUES ($1, $2, 100000, $3::timestamptz)`,
        [season.id, id, new Date(new Date(season.starts_at).getTime() + i * 1000).toISOString()]
      );
      await pool.query(
        `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at)
         VALUES ($1, 'buy', 'AAPL', 'Apple', 'stock', 1, 100, 100, 0.25, 100.25, ($2::timestamptz AT TIME ZONE current_setting('TimeZone')))`,
        [id, at.toISOString()]
      );
    }
    const { events, off } = collect(second.id);
    expect(await SeasonService.finalizeSeason(season.id, new Date())).toBe(true);
    await settle();
    off();

    const c = await latest(champ.id, 'season.award');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ category: 'competition', link: '/profile', title: 'Sezon ödülü: Sezon Şampiyonu' });
    expect(c[0].body).toMatch(/^Mayıs 2001 sezonunu 1\. bitirdin — Sezon Şampiyonu/);
    const s = await latest(second.id, 'season.award');
    expect(s[0].body).toMatch(/^Mayıs 2001 sezonunu 2\. bitirdin — Sezon Podyumu/);
    expect(s[0].data).toMatchObject({ season_id: season.id, rank: 2, title: 'Sezon Podyumu' });
    expect(events.some((e) => e.kind === 'notification' && e.item.type === 'season.award')).toBe(true);

    // İkinci sonlandırma denemesi bildirim çoğaltmaz
    expect(await SeasonService.finalizeSeason(season.id, new Date())).toBe(false);
    expect(await latest(champ.id, 'season.award')).toHaveLength(1);
  });
});
