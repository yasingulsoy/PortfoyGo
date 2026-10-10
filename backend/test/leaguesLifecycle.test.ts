import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../src/services/activityLog', () => ({ ActivityLogService: { createLog: async () => ({}) } }));
vi.mock('../src/services/badges', () => ({ BadgeService: { checkAndAwardBadges: async () => undefined } }));

const MIGRATIONS = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter((f) => f.endsWith('.sql')).sort();

type Leagues = typeof import('../src/services/leagues');
type Notifications = typeof import('../src/services/notifications');

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('Ligler v2: yaşam döngüsü, herkese açık ligler, akış (PGlite)', () => {
  let svc: Leagues['LeagueService'];
  let notifySpy: ReturnType<typeof vi.spyOn>;
  let app: import('express').Express;
  let sign: (id: string) => string;
  let seq = 0;

  const q = async (sql: string, params: unknown[] = []) => (await h.db.query(sql, params)).rows as any[];

  const newUser = async (opts: { balance?: number; verified?: boolean } = {}) => {
    seq += 1;
    const rows = await q(
      `INSERT INTO users (username, email, password_hash, balance, email_verified)
       VALUES ($1, $2, 'x', $3, $4) RETURNING id, username`,
      [`lv${seq}`, `lv${seq}@test.io`, opts.balance ?? 100_000, opts.verified ?? true]
    );
    const id = rows[0].id as string;
    return { id, username: rows[0].username as string, auth: { Authorization: `Bearer ${sign(id)}` } };
  };
  const setBalance = (userId: string, balance: number) => q(`UPDATE users SET balance = $2 WHERE id = $1`, [userId, balance]);
  const member = async (leagueId: string, userId: string) =>
    (await q(`SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]))[0];
  const league = async (id: string) => (await q(`SELECT * FROM leagues WHERE id = $1`, [id]))[0];
  /** Spy çağrıları (tip filtresiyle): [userIds, input, client?] */
  const calls = (type: string) => notifySpy.mock.calls.filter((c: any[]) => c[1]?.type === type) as any[][];
  const recipients = (type: string) => calls(type).flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));

  /** Yaklaşan lig (API ile) — sahibi + davet koduyla katılan üyeler */
  const upcomingLeague = async (name: string, owner: { id: string; auth: any }, opts: { visibility?: string; duration?: string } = {}) => {
    const res = await request(app)
      .post('/api/leagues')
      .set(owner.auth)
      .send({ name, starts_at: iso(Date.now() + HOUR), duration: opts.duration ?? '1d', visibility: opts.visibility ?? 'private' });
    expect(res.status).toBe(201);
    return res.body.data;
  };
  const makeDue = (leagueId: string) => q(`UPDATE leagues SET starts_at = now() - INTERVAL '1 second' WHERE id = $1`, [leagueId]);
  const makeEnded = (leagueId: string) =>
    q(`UPDATE leagues SET ends_at = now() - INTERVAL '1 second' WHERE id = $1`, [leagueId]);

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    svc = (await import('../src/services/leagues')).LeagueService;
    const N: Notifications = await import('../src/services/notifications');
    notifySpy = vi.spyOn(N.NotificationService, 'notify'); // gerçek uygulama çalışmaya devam eder
    app = (await import('../src/app')).createApp();
    const { AuthService } = await import('../src/services/auth');
    sign = (id: string) => AuthService.signSessionToken(id, 0);
  }, 60_000);

  beforeEach(() => {
    notifySpy.mockClear();
  });

  afterAll(async () => {
    notifySpy?.mockRestore();
    await h.db?.close();
  });

  // ---------------------------------------------------------------------------

  it('yaklaşan lig: referans başlangıçta yazılır, başlatma işi üyeleri bilgilendirir (idempotent)', async () => {
    const owner = await newUser({ balance: 100_000 });
    const a = await newUser({ balance: 100_000 });
    const created = await upcomingLeague('Yaklaşan Lig', owner, { duration: '3d' });
    expect(created).toMatchObject({ status: 'upcoming', visibility: 'private', started_at: null, finalized_at: null, my_rank: null, my_return_pct: null, my_final_rank: null });
    expect(new Date(created.ends_at).getTime() - new Date(created.starts_at).getTime()).toBe(3 * 24 * HOUR);

    const joined = await request(app).post('/api/leagues/join').set(a.auth).send({ code: created.invite_code });
    expect(joined.status).toBe(200);
    expect(joined.body.data).toMatchObject({ status: 'upcoming', my_rank: null, member_count: 2 });
    expect(calls('league.member_joined')).toHaveLength(1);
    expect(recipients('league.member_joined')).toEqual([owner.id]);
    expect(calls('league.member_joined')[0][1].title).toBe(`${a.username} Yaklaşan Lig ligine katıldı`);

    // Başlamadan: sıra/getiri yok
    const before = await request(app).get(`/api/leagues/${created.id}`).set(a.auth);
    expect(before.body.data.league.status).toBe('upcoming');
    for (const m of before.body.data.members) {
      expect(m).toMatchObject({ rank: null, return_pct: null, profit_tl: null, baseline_set: false, baseline_equity: null });
    }
    expect((await member(created.id, a.id)).baseline_set_at).toBeNull();

    // Zamanı gelmeden iş hiçbir şey yapmaz
    expect(await svc.startDue()).toBe(0);

    // Varlıklar katılımdan sonra değişti → referans başlangıç anındaki değer olmalı
    await setBalance(owner.id, 90_000);
    await setBalance(a.id, 120_000);
    await makeDue(created.id);
    expect(await svc.startDue()).toBe(1);
    expect(await svc.startDue()).toBe(0);
    expect(await svc.startLeague(created.id)).toBe(false);

    const l = await league(created.id);
    expect(l.started_at).not.toBeNull();
    const mo = await member(created.id, owner.id);
    const ma = await member(created.id, a.id);
    expect(Number(mo.baseline_equity)).toBe(90_000);
    expect(Number(ma.baseline_equity)).toBe(120_000);
    expect(mo.baseline_set_at).not.toBeNull();

    expect(calls('league.started')).toHaveLength(1);
    expect(new Set(recipients('league.started'))).toEqual(new Set([owner.id, a.id]));
    const started = calls('league.started')[0][1];
    expect(started).toMatchObject({ category: 'competition', title: 'Yaklaşan Lig başladı!', link: `/leagues/${created.id}` });
    // Bildirimler aynı transaction'da gerçekten yazıldı
    const rows = await q(`SELECT user_id FROM notifications WHERE type = 'league.started' AND data->>'league_id' = $1`, [created.id]);
    expect(rows).toHaveLength(2);

    await setBalance(a.id, 132_000); // +%10
    const after = await request(app).get(`/api/leagues/${created.id}`).set(a.auth);
    expect(after.body.data.league).toMatchObject({ status: 'active', my_rank: 1, my_return_pct: 10 });
    expect(after.body.data.members[0]).toMatchObject({ user_id: a.id, rank: 1, return_pct: 10, profit_tl: 12_000, baseline_set: true, baseline_equity: 120_000 });
    expect(after.body.data.members[1]).toMatchObject({ user_id: owner.id, rank: 2, return_pct: 0 });
  });

  it('istek anında tembel başlatma: cron beklenmeden detay/liste doğru durumu gösterir', async () => {
    const owner = await newUser();
    const created = await upcomingLeague('Tembel Lig', owner);
    await makeDue(created.id);
    const res = await request(app).get('/api/leagues').set(owner.auth);
    const item = res.body.data.find((x: any) => x.id === created.id);
    expect(item).toMatchObject({ status: 'active', my_rank: 1, my_return_pct: 0 });
    expect(calls('league.started')).toHaveLength(1);
  });

  it('başladıktan sonra katılan: referans katılım anındaki varlık', async () => {
    const owner = await newUser();
    const created = await svc.create(owner.id, { name: 'Aktif Lig', duration: '1w' });
    expect(created.status).toBe('active');
    expect(created.started_at).not.toBeNull();
    const late = await newUser({ balance: 77_000 });
    const res = await request(app).post('/api/leagues/join').set(late.auth).send({ code: created.invite_code });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'active', my_rank: 2, my_return_pct: 0 });
    const m = await member(created.id, late.id);
    expect(Number(m.baseline_equity)).toBe(77_000);
    expect(m.baseline_set_at).not.toBeNull();
    expect(recipients('league.member_joined')).toEqual([owner.id]);
    expect(calls('league.member_joined')[0][1].body).toBe('Lig sıralamasında yerini aldı.');
  });

  it('kapanış: değerleri dondurur, sıralar, bildirir; eşzamanlı çalıştırmada tek kez', async () => {
    const owner = await newUser({ balance: 100_000 });
    const a = await newUser({ balance: 100_000 });
    const b = await newUser({ balance: 100_000 });
    const created = await svc.create(owner.id, { name: 'Kapanış Ligi', duration: '1d' });
    await svc.join(a.id, created.invite_code);
    await svc.join(b.id, created.invite_code);
    // a +%20, owner +%5, b −%10
    await setBalance(a.id, 120_000);
    await setBalance(owner.id, 105_000);
    await setBalance(b.id, 90_000);
    notifySpy.mockClear();

    expect(await svc.finalizeDue()).toBe(0); // henüz bitmedi
    await makeEnded(created.id);
    const results = await Promise.all([svc.finalizeDue(), svc.finalizeDue(), svc.finalizeLeague(created.id), svc.finalizeDue()]);
    const finalized = results.reduce<number>((acc, r) => acc + (typeof r === 'boolean' ? (r ? 1 : 0) : r), 0);
    expect(finalized).toBe(1);

    const l = await league(created.id);
    expect(l.finalized_at).not.toBeNull();
    const ma = await member(created.id, a.id);
    expect(ma).toMatchObject({ final_rank: 1 });
    expect(Number(ma.final_equity)).toBe(120_000);
    expect(Number(ma.final_return_pct)).toBe(20);
    expect((await member(created.id, owner.id)).final_rank).toBe(2);
    expect((await member(created.id, b.id)).final_rank).toBe(3);

    // Bildirim: her üyeye bir kez, sırasıyla
    expect(calls('league.finished')).toHaveLength(3);
    const byUser = new Map(calls('league.finished').map((c) => [c[0], c[1]]));
    expect(byUser.get(a.id)).toMatchObject({ title: '🏆 Kapanış Ligi şampiyonu oldun!', data: { rank: 1, return_pct: 20 } });
    expect(byUser.get(owner.id)).toMatchObject({ title: 'Kapanış Ligi sona erdi — 2. oldun', data: { rank: 2, return_pct: 5 } });
    expect(byUser.get(b.id)?.data).toMatchObject({ rank: 3, return_pct: -10 });
    expect(await q(`SELECT 1 FROM notifications WHERE type = 'league.finished' AND data->>'league_id' = $1`, [created.id])).toHaveLength(3);

    // Bitişten sonra varlık değişse de sonuçlar donuk
    await setBalance(b.id, 500_000);
    const res = await request(app).get(`/api/leagues/${created.id}`).set(b.auth);
    expect(res.body.data.league).toMatchObject({ status: 'finished', my_rank: 3, my_return_pct: -10, my_final_rank: 3 });
    expect(res.body.data.members.map((m: any) => m.user_id)).toEqual([a.id, owner.id, b.id]);
    expect(res.body.data.members[2]).toMatchObject({ rank: 3, final_rank: 3, final_return_pct: -10, equity: 90_000, profit_tl: -10_000 });

    const mine = await request(app).get('/api/leagues').set(a.auth);
    expect(mine.body.data.find((x: any) => x.id === created.id)).toMatchObject({ status: 'finished', my_final_rank: 1, my_rank: 1, my_return_pct: 20 });

    // Tekrar çalıştırma hiçbir şey yapmaz
    expect(await svc.finalizeDue()).toBe(0);
    expect(calls('league.finished')).toHaveLength(3);

    // Biten lige katılım → 400 LEAGUE_ENDED; biten ligden üye çıkarılamaz
    const c = await newUser();
    const join = await request(app).post('/api/leagues/join').set(c.auth).send({ code: created.invite_code });
    expect(join.status).toBe(400);
    expect(join.body.code).toBe('LEAGUE_ENDED');
    expect((await request(app).delete(`/api/leagues/${created.id}/members/${b.id}`).set({ Authorization: `Bearer ${sign(owner.id)}` })).status).toBe(400);
  });

  it('başlamadan biten lig önce başlatılır, sonra kapanır; referansı olmayan üye sıralanmaz', async () => {
    const owner = await newUser();
    const created = await upcomingLeague('Kaçırılmış Lig', owner);
    const zero = await newUser({ balance: 50_000 });
    await svc.join(zero.id, created.invite_code);
    await setBalance(zero.id, 0); // başlangıçta varlığı 0 → referans yazılamaz
    await q(`UPDATE leagues SET starts_at = now() - INTERVAL '2 days', ends_at = now() - INTERVAL '1 day' WHERE id = $1`, [created.id]);
    expect(await svc.finalizeDue()).toBe(1);
    const l = await league(created.id);
    expect(l.started_at).not.toBeNull();
    expect(l.finalized_at).not.toBeNull();
    expect((await member(created.id, owner.id)).final_rank).toBe(1);
    expect((await member(created.id, zero.id)).final_rank).toBeNull();
    const z = calls('league.finished').find((c) => c[0] === zero.id);
    expect(z?.[1]).toMatchObject({ title: 'Kaçırılmış Lig sona erdi', data: { rank: null, return_pct: null } });
  });

  it('herkese açık liste: durum filtreleri, arama, sayfalama, is_member', async () => {
    const owner = await newUser();
    const tag = `Pub${Date.now().toString(36)}`;
    const up = await upcomingLeague(`${tag} Yaklaşan`, owner, { visibility: 'public' });
    const act = await svc.create(owner.id, { name: `${tag} Aktif`, visibility: 'public', duration: '1d' });
    const fin = await svc.create(owner.id, { name: `${tag} Biten`, visibility: 'public', duration: '1d' });
    await svc.create(owner.id, { name: `${tag} Özel`, duration: '1d' });
    await makeEnded(fin.id);
    await svc.finalizeDue();

    const anon = await request(app).get('/api/leagues/public').query({ search: tag });
    expect(anon.status).toBe(200);
    expect(anon.body.data).toMatchObject({ total: 2, limit: 20, offset: 0 });
    expect(anon.body.data.items.map((i: any) => i.id)).toEqual([act.id, up.id]); // önce aktif, sonra yaklaşan
    expect(anon.body.data.items[0]).toEqual({
      id: act.id,
      name: `${tag} Aktif`,
      description: null,
      owner_username: owner.username,
      member_count: 1,
      max_members: 50,
      status: 'active',
      starts_at: expect.any(String),
      ends_at: expect.any(String),
      is_member: false,
    });
    expect(anon.body.data.items[0].invite_code).toBeUndefined();

    const finished = await request(app).get('/api/leagues/public').query({ search: tag, status: 'finished' });
    expect(finished.body.data.items.map((i: any) => i.id)).toEqual([fin.id]);
    const upcoming = await request(app).get('/api/leagues/public').query({ search: tag, status: 'upcoming' });
    expect(upcoming.body.data.items.map((i: any) => i.id)).toEqual([up.id]);
    const active = await request(app).get('/api/leagues/public').query({ search: tag, status: 'active' });
    expect(active.body.data.items.map((i: any) => i.id)).toEqual([act.id]);
    expect((await request(app).get('/api/leagues/public').query({ status: 'bogus' })).status).toBe(400);

    const paged = await request(app).get('/api/leagues/public').query({ search: tag, limit: 1, offset: 1 });
    expect(paged.body.data).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(paged.body.data.items.map((i: any) => i.id)).toEqual([up.id]);

    // LIKE joker karakterleri kaçışlanır
    expect((await request(app).get('/api/leagues/public').query({ search: '%' })).body.data.total).toBe(0);

    const logged = await request(app).get('/api/leagues/public').query({ search: tag }).set(owner.auth);
    expect(logged.body.data.items.every((i: any) => i.is_member === true)).toBe(true);
    const other = await newUser();
    const loggedOther = await request(app).get('/api/leagues/public').query({ search: tag }).set(other.auth);
    expect(loggedOther.body.data.items.every((i: any) => i.is_member === false)).toBe(true);
  });

  it('join-public: sadece herkese açık ve bitmemiş liglere; kurallar kod ile katılımla aynı', async () => {
    const owner = await newUser();
    const pub = await svc.create(owner.id, { name: 'Açık Lig', visibility: 'public', duration: '1d' });
    const priv = await svc.create(owner.id, { name: 'Kapalı Lig', duration: '1d' });
    const u = await newUser({ balance: 55_000 });

    const r404 = await request(app).post(`/api/leagues/${priv.id}/join-public`).set(u.auth);
    expect(r404.status).toBe(404);
    expect(r404.body.code).toBe('LEAGUE_NOT_FOUND');
    expect((await request(app).post(`/api/leagues/00000000-0000-4000-8000-000000000000/join-public`).set(u.auth)).status).toBe(404);
    expect((await request(app).post(`/api/leagues/${pub.id}/join-public`)).status).toBe(401);

    const unverified = await newUser({ verified: false });
    expect((await request(app).post(`/api/leagues/${pub.id}/join-public`).set(unverified.auth)).status).toBe(403);

    const ok = await request(app).post(`/api/leagues/${pub.id}/join-public`).set(u.auth);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: pub.id, role: 'member', status: 'active', visibility: 'public', member_count: 2 });
    expect(Number((await member(pub.id, u.id)).baseline_equity)).toBe(55_000);
    expect(recipients('league.member_joined')).toEqual([owner.id]);

    const again = await request(app).post(`/api/leagues/${pub.id}/join-public`).set(u.auth);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_MEMBER');

    await makeEnded(pub.id);
    const late = await newUser();
    const ended = await request(app).post(`/api/leagues/${pub.id}/join-public`).set(late.auth);
    expect(ended.status).toBe(400);
    expect(ended.body.code).toBe('LEAGUE_ENDED');
  });

  it('PATCH: sahip kuralları; tarihler sadece başlamadan değişir', async () => {
    const owner = await newUser();
    const m = await newUser();
    const outsider = await newUser();
    const up = await upcomingLeague('Düzenlenecek Lig', owner, { duration: '1d' });
    await svc.join(m.id, up.invite_code);

    expect((await request(app).patch(`/api/leagues/${up.id}`).set(m.auth).send({ name: 'Yeni Ad' })).status).toBe(403);
    expect((await request(app).patch(`/api/leagues/${up.id}`).set(outsider.auth).send({ name: 'Yeni Ad' })).status).toBe(404);
    expect((await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ visibility: 'secret' })).status).toBe(400);
    expect((await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ duration: '5y' })).status).toBe(400);
    const tooFar = await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ starts_at: iso(Date.now() + 31 * 24 * HOUR) });
    expect(tooFar.status).toBe(400);

    // Başlangıcı kaydır: süre (1 gün) korunur
    const newStart = Date.now() + 5 * HOUR;
    const moved = await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ starts_at: iso(newStart) });
    expect(moved.status).toBe(200);
    expect(new Date(moved.body.data.starts_at).getTime()).toBe(newStart);
    expect(new Date(moved.body.data.ends_at).getTime()).toBe(newStart + 24 * HOUR);

    // Süreyi değiştir
    const longer = await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ duration: '2w', name: 'Uzun Lig', visibility: 'public', description: 'Açıklama' });
    expect(longer.status).toBe(200);
    expect(longer.body.data).toMatchObject({ name: 'Uzun Lig', visibility: 'public', description: 'Açıklama', status: 'upcoming' });
    expect(new Date(longer.body.data.ends_at).getTime()).toBe(newStart + 14 * 24 * HOUR);

    const cleared = await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ description: null });
    expect(cleared.body.data.description).toBeNull();

    // Başladıktan sonra: ad/görünürlük olur, tarihler olmaz
    await makeDue(up.id);
    const dates = await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ duration: '1d' });
    expect(dates.status).toBe(400);
    expect(dates.body.code).toBe('LEAGUE_ALREADY_STARTED');
    const vis = await request(app).patch(`/api/leagues/${up.id}`).set(owner.auth).send({ visibility: 'private' });
    expect(vis.status).toBe(200);
    expect(vis.body.data).toMatchObject({ visibility: 'private', status: 'active' });
  });

  it('oluşturma: duration ends_at\'ten öncelikli; süresiz lig; başlangıç/bitiş doğrulaması', async () => {
    const owner = await newUser();
    const start = Date.now() + 2 * HOUR;
    const res = await request(app)
      .post('/api/leagues')
      .set(owner.auth)
      .send({ name: 'Süreli Lig', starts_at: iso(start), duration: '1m', ends_at: iso(Date.now() + 5 * 24 * HOUR), visibility: 'public' });
    expect(res.status).toBe(201);
    const ends = new Date(res.body.data.ends_at);
    const expected = new Date(start);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(Math.abs(ends.getTime() - expected.getTime())).toBeLessThanOrEqual(HOUR); // ay uzunluğu PG interval ile
    expect(res.body.data).toMatchObject({ status: 'upcoming', visibility: 'public' });

    const open = await svc.create(owner.id, { name: 'Süresiz Lig' });
    expect(open).toMatchObject({ ends_at: null, status: 'active', visibility: 'private' });

    const past = await request(app).post('/api/leagues').set(owner.auth).send({ name: 'Geçmiş Başlangıç', starts_at: iso(Date.now() - 10 * 60_000) });
    expect(past.status).toBe(400);
    expect(past.body.message).toBe('Başlangıç tarihi geçmişte olamaz');
    const badRange = await request(app)
      .post('/api/leagues')
      .set(owner.auth)
      .send({ name: 'Ters Lig', starts_at: iso(Date.now() + 3 * 24 * HOUR), ends_at: iso(Date.now() + 24 * HOUR) });
    expect(badRange.status).toBe(400);
    expect(badRange.body.message).toBe('Bitiş tarihi başlangıç tarihinden sonra olmalı');
    expect((await request(app).post('/api/leagues').set(owner.auth).send({ name: 'Kötü Süre', duration: '10d' })).status).toBe(400);
  });

  it('akış: sadece üyeler; başlangıç/katılımdan sonraki işlemler; tutar yok', async () => {
    const owner = await newUser();
    const a = await newUser();
    const created = await upcomingLeague('Akış Ligi', owner);
    await svc.join(a.id, created.invite_code);
    const tx = (userId: string, type: string, symbol: string, minutesAgo: number) =>
      q(
        `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at)
         VALUES ($1, $2, $3, $3, 'stock', 1, 100, 100, 0, 100, now() - ($4::int * INTERVAL '1 minute'))`,
        [userId, type, symbol, minutesAgo]
      );
    await tx(owner.id, 'buy', 'PRE', 45); // referanstan (30 dk önce) önce → görünmez

    const outsider = await newUser();
    expect((await request(app).get(`/api/leagues/${created.id}/feed`).set(outsider.auth)).status).toBe(404);
    const empty = await request(app).get(`/api/leagues/${created.id}/feed`).set(a.auth);
    expect(empty.status).toBe(200);
    expect(empty.body.data.items).toEqual([]); // henüz başlamadı

    await makeDue(created.id);
    await svc.startDue();
    await q(`UPDATE league_members SET baseline_set_at = now() - INTERVAL '30 minutes' WHERE league_id = $1`, [created.id]);
    await tx(owner.id, 'buy', 'AAA', 20);
    await tx(a.id, 'sell', 'BBB', 10);
    await tx(a.id, 'buy', 'CCC', 40); // referanstan önce → görünmez
    await tx(outsider.id, 'buy', 'ZZZ', 1); // üye değil → görünmez

    const feed = await request(app).get(`/api/leagues/${created.id}/feed`).set(owner.auth);
    expect(feed.status).toBe(200);
    expect(feed.body.data.items.map((i: any) => i.symbol)).toEqual(['BBB', 'AAA']);
    expect(feed.body.data.items[0]).toEqual({
      id: expect.any(String),
      user_id: a.id,
      username: a.username,
      type: 'sell',
      symbol: 'BBB',
      asset_type: 'stock',
      created_at: expect.any(String),
    });
    for (const i of feed.body.data.items) {
      for (const k of ['price', 'quantity', 'total_amount', 'net_amount', 'commission']) expect(i[k]).toBeUndefined();
    }
    const limited = await request(app).get(`/api/leagues/${created.id}/feed`).query({ limit: 1 }).set(owner.auth);
    expect(limited.body.data.items).toHaveLength(1);
  });

  it('üye çıkarma ve lig silme bildirimleri; biten ligler üyelik sınırına sayılmaz', async () => {
    const owner = await newUser();
    const m1 = await newUser();
    const m2 = await newUser();
    const created = await svc.create(owner.id, { name: 'Bildirim Ligi', duration: '1d' });
    await svc.join(m1.id, created.invite_code);
    await svc.join(m2.id, created.invite_code);
    notifySpy.mockClear();

    expect((await request(app).delete(`/api/leagues/${created.id}/members/${m1.id}`).set({ Authorization: `Bearer ${sign(owner.id)}` })).status).toBe(200);
    expect(recipients('league.removed')).toEqual([m1.id]);
    expect(calls('league.removed')[0][1]).toMatchObject({ title: 'Bildirim Ligi liginden çıkarıldın', category: 'competition' });

    expect((await request(app).delete(`/api/leagues/${created.id}`).set({ Authorization: `Bearer ${sign(owner.id)}` })).status).toBe(200);
    expect(recipients('league.deleted')).toEqual([m2.id]);
    expect(calls('league.deleted')[0][1].title).toBe('Bildirim Ligi ligi silindi');

    // Sınır: 5 sahiplik — biten ligler sayılmaz
    const boss = await newUser();
    const owned = [];
    for (let i = 0; i < 5; i++) owned.push(await svc.create(boss.id, { name: `Sınır ${i}`, duration: '1d' }));
    await expect(svc.create(boss.id, { name: 'Sınır fazla' })).rejects.toMatchObject({ status: 409, code: 'OWNED_LEAGUE_LIMIT' });
    await makeEnded(owned[0].id);
    await svc.finalizeDue();
    await expect(svc.create(boss.id, { name: 'Sınır yeni' })).resolves.toMatchObject({ name: 'Sınır yeni' });
  });
});
