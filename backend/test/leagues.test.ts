import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Veritabanı: bellek içi PGlite (uzak veritabanına asla bağlanılmaz). orders.test.ts ile aynı desen.
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
type Competition = typeof import('../src/utils/competition');

const CSRF = { 'X-Requested-With': 'PortfoyGo' };

describe('Özel ligler (PGlite)', () => {
  let L: Leagues;
  let svc: Leagues['LeagueService'];
  let comp: Competition;
  let app: import('express').Express;
  let sign: (id: string) => string;
  let seq = 0;

  const q = async (sql: string, params: unknown[] = []) => (await h.db.query(sql, params)).rows as any[];

  const newUser = async (opts: { balance?: number; verified?: boolean } = {}) => {
    seq += 1;
    const rows = await q(
      `INSERT INTO users (username, email, password_hash, balance, email_verified)
       VALUES ($1, $2, 'x', $3, $4) RETURNING id, username`,
      [`l${seq}`, `l${seq}@test.io`, opts.balance ?? 100_000, opts.verified ?? true]
    );
    const id = rows[0].id as string;
    return { id, username: rows[0].username as string, auth: { Authorization: `Bearer ${sign(id)}` } };
  };
  const leagueByName = async (name: string) => (await q(`SELECT * FROM leagues WHERE name = $1`, [name]))[0];

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    L = await import('../src/services/leagues');
    svc = L.LeagueService;
    comp = await import('../src/utils/competition');
    app = (await import('../src/app')).createApp();
    const { AuthService } = await import('../src/services/auth');
    sign = (id: string) => AuthService.signSessionToken(id, 0);
  }, 60_000);

  afterAll(async () => {
    await h.db?.close();
  });

  // ---------------------------------------------------------------------------

  it('davet kodu: 8 karakter, belirsiz karakter yok; girdi normalleştirilir', () => {
    for (let i = 0; i < 200; i++) {
      expect(comp.generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
    expect(comp.normalizeInviteCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(comp.normalizeInviteCode('ab cd ef gh')).toBe('ABCDEFGH');
    expect(comp.normalizeInviteCode('ABCD-EFG0')).toBeNull(); // 0 alfabede yok
    expect(comp.normalizeInviteCode('ABCDEFGO')).toBeNull(); // O alfabede yok
    expect(comp.normalizeInviteCode('ABCDEFG')).toBeNull();
    expect(comp.normalizeInviteCode('ABCDEFGHJ')).toBeNull();
  });

  it('oluşturma: e-posta doğrulaması gerekir; sahip katılım anındaki varlıkla eklenir', async () => {
    const unverified = await newUser({ verified: false });
    const r403 = await request(app).post('/api/leagues').set(unverified.auth).send({ name: 'Gizli Lig' });
    expect(r403.status).toBe(403);
    expect(r403.body).toMatchObject({ success: false, message: 'Lig oluşturmak için e-postanı doğrulamalısın', code: 'EMAIL_NOT_VERIFIED' });

    const owner = await newUser({ balance: 95_000 });
    await q(`UPDATE users SET reserved_cash = 1000 WHERE id = $1`, [owner.id]);
    const res = await request(app)
      .post('/api/leagues')
      .set(owner.auth)
      .send({ name: '  Ofis Ligi  ', description: 'Kahve molası rekabeti', ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: 'Ofis Ligi',
      description: 'Kahve molası rekabeti',
      owner_username: owner.username,
      role: 'owner',
      member_count: 1,
      max_members: 50,
      my_rank: 1,
      my_return_pct: 0,
    });
    expect(res.body.data.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const m = (await q(`SELECT * FROM league_members WHERE user_id = $1`, [owner.id]))[0];
    expect(m.role).toBe('owner');
    expect(Number(m.baseline_equity)).toBeCloseTo(96_000, 2);

    // Doğrulama hataları
    expect((await request(app).post('/api/leagues').set(owner.auth).send({ name: 'ab' })).status).toBe(400);
    expect((await request(app).post('/api/leagues').set(owner.auth).send({ name: 'x'.repeat(41) })).status).toBe(400);
    const past = await request(app).post('/api/leagues').set(owner.auth).send({ name: 'Geçmiş', ends_at: '2000-01-01T00:00:00Z' });
    expect(past.status).toBe(400);
    expect(past.body.message).toBe('Bitiş tarihi gelecekte olmalı');
  });

  it('önizleme + katılma: kod büyük/küçük harf, boşluk ve tireden bağımsız', async () => {
    const owner = await newUser();
    const league = await svc.create(owner.id, { name: 'Önizleme Ligi' });
    const joiner = await newUser({ balance: 80_000 });
    const messy = `${league.invite_code.slice(0, 4).toLowerCase()}-${league.invite_code.slice(4)} `;

    const pv = await request(app).get('/api/leagues/preview').query({ code: messy }).set(joiner.auth);
    expect(pv.status).toBe(200);
    expect(pv.body.data).toEqual({
      name: 'Önizleme Ligi',
      description: null,
      owner_username: owner.username,
      member_count: 1,
      max_members: 50,
      visibility: 'private',
      status: 'active',
      starts_at: expect.any(String),
      ends_at: null,
      already_member: false,
    });

    const bad = await request(app).get('/api/leagues/preview').query({ code: 'ZZZZZZZZ' }).set(joiner.auth);
    expect(bad.status).toBe(404);
    expect(bad.body.message).toBe('Davet kodu geçersiz');

    const join = await request(app).post('/api/leagues/join').set(joiner.auth).send({ code: messy });
    expect(join.status).toBe(200);
    expect(join.body.data).toMatchObject({ id: league.id, role: 'member', member_count: 2 });
    const m = (await q(`SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2`, [league.id, joiner.id]))[0];
    expect(Number(m.baseline_equity)).toBeCloseTo(80_000, 2);

    const again = await request(app).post('/api/leagues/join').set(joiner.auth).send({ code: league.invite_code });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_MEMBER');

    const pv2 = await request(app).get('/api/leagues/preview').query({ code: league.invite_code }).set(joiner.auth);
    expect(pv2.body.data.already_member).toBe(true);

    const missing = await request(app).post('/api/leagues/join').set(joiner.auth).send({ code: 'ABCD-2345' });
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Davet kodu geçersiz');

    // Doğrulanmamış kullanıcı katılamaz
    const unverified = await newUser({ verified: false });
    const r403 = await request(app).post('/api/leagues/join').set(unverified.auth).send({ code: league.invite_code });
    expect(r403.status).toBe(403);
    expect(r403.body.message).toBe('Lige katılmak için e-postanı doğrulamalısın');

    // Çerezle gelen POST'ta CSRF başlığı zorunlu
    const cookie = `pg_session=${sign(joiner.id)}`;
    expect((await request(app).post('/api/leagues/join').set('Cookie', cookie).send({ code: league.invite_code })).status).toBe(403);
    expect((await request(app).post('/api/leagues/join').set('Cookie', cookie).set(CSRF).send({ code: league.invite_code })).status).toBe(409);
  });

  it('sınırlar: biten lig 400, dolu lig 409, en fazla 10 lig / 5 sahiplik', async () => {
    const owner = await newUser();
    const ended = await svc.create(owner.id, { name: 'Biten Lig' });
    await q(`UPDATE leagues SET ends_at = now() - INTERVAL '1 minute' WHERE id = $1`, [ended.id]);
    const u = await newUser();
    await expect(svc.join(u.id, ended.invite_code)).rejects.toMatchObject({ status: 400, code: 'LEAGUE_ENDED' });

    const small = await svc.create(owner.id, { name: 'Küçük Lig' });
    await q(`UPDATE leagues SET max_members = 2 WHERE id = $1`, [small.id]);
    await svc.join(u.id, small.invite_code);
    const v = await newUser();
    await expect(svc.join(v.id, small.invite_code)).rejects.toMatchObject({ status: 409, code: 'LEAGUE_FULL' });

    // Sahiplik sınırı (5)
    const boss = await newUser();
    for (let i = 0; i < L.MAX_OWNED_LEAGUES; i++) {
      await svc.create(boss.id, { name: `Boss ${i}` });
    }
    await expect(svc.create(boss.id, { name: 'Boss fazla' })).rejects.toMatchObject({ status: 409, code: 'OWNED_LEAGUE_LIMIT' });

    // Üyelik sınırı (10): 5 sahiplik + 5 üyelik
    const others: string[] = [];
    for (let i = 0; i < 6; i++) {
      const o = await newUser();
      others.push((await svc.create(o.id, { name: `Diğer ${i}` })).invite_code);
    }
    for (let i = 0; i < 5; i++) {
      await svc.join(boss.id, others[i]);
    }
    expect(await svc.listMine(boss.id)).toHaveLength(L.MAX_LEAGUES_PER_USER);
    await expect(svc.join(boss.id, others[5])).rejects.toMatchObject({ status: 409, code: 'LEAGUE_LIMIT' });
  });

  it('sıralama: katılımdan bu yana getiri % (eşitlikte önce katılan); detay sadece üyelere', async () => {
    const owner = await newUser({ balance: 100_000 });
    const a = await newUser({ balance: 100_000 });
    const b = await newUser({ balance: 100_000 });
    const league = await svc.create(owner.id, { name: 'Sıralama Ligi' });
    await svc.join(a.id, league.invite_code);
    await svc.join(b.id, league.invite_code);
    const t0 = Date.now() - 3_600_000;
    await q(`UPDATE league_members SET joined_at = $3::timestamptz WHERE league_id = $1 AND user_id = $2`, [league.id, owner.id, new Date(t0).toISOString()]);
    await q(`UPDATE league_members SET joined_at = $3::timestamptz WHERE league_id = $1 AND user_id = $2`, [league.id, a.id, new Date(t0 + 1000).toISOString()]);
    await q(`UPDATE league_members SET joined_at = $3::timestamptz WHERE league_id = $1 AND user_id = $2`, [league.id, b.id, new Date(t0 + 2000).toISOString()]);
    // owner +5%, a +12.5% (yarı baz), b +5% (owner ile eşit, sonra katıldı)
    await q(`UPDATE users SET balance = 105000 WHERE id IN ($1, $2)`, [owner.id, b.id]);
    await q(`UPDATE users SET balance = 45000 WHERE id = $1`, [a.id]);
    await q(`UPDATE league_members SET baseline_equity = 40000 WHERE league_id = $1 AND user_id = $2`, [league.id, a.id]);

    const res = await request(app).get(`/api/leagues/${league.id}`).set(b.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.league).toMatchObject({ id: league.id, owner_id: owner.id, role: 'member', member_count: 3, my_rank: 3, my_return_pct: 5 });
    const members = res.body.data.members;
    expect(members.map((m: any) => m.user_id)).toEqual([a.id, owner.id, b.id]);
    expect(members[0]).toMatchObject({ rank: 1, role: 'member', baseline_equity: 40_000, equity: 45_000, return_pct: 12.5, profit_tl: 5_000, is_me: false });
    expect(members[1]).toMatchObject({ rank: 2, role: 'owner', return_pct: 5, profit_tl: 5_000 });
    expect(members[2]).toMatchObject({ rank: 3, is_me: true });

    const list = await request(app).get('/api/leagues').set(a.auth);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ id: league.id, my_rank: 1, my_return_pct: 12.5, role: 'member', owner_username: owner.username });

    const outsider = await newUser();
    const r404 = await request(app).get(`/api/leagues/${league.id}`).set(outsider.auth);
    expect(r404.status).toBe(404);
    expect(r404.body.message).toBe('Lig bulunamadı');
    expect((await request(app).get('/api/leagues/not-a-uuid').set(outsider.auth)).status).toBe(400);
    expect((await request(app).get('/api/leagues')).status).toBe(401);
  });

  it('ayrılma, davet kodu yenileme, üye çıkarma, silme: sahip kuralları', async () => {
    const owner = await newUser();
    const m1 = await newUser();
    const m2 = await newUser();
    const league = await svc.create(owner.id, { name: 'Kurallar Ligi' });
    await svc.join(m1.id, league.invite_code);
    await svc.join(m2.id, league.invite_code);

    // Sahip ayrılamaz
    const ownerLeave = await request(app).post(`/api/leagues/${league.id}/leave`).set(owner.auth);
    expect(ownerLeave.status).toBe(400);
    expect(ownerLeave.body.message).toBe('Lig sahibi ayrılamaz; ligi silebilirsin');

    // Üye ayrılır → artık detaya erişemez
    expect((await request(app).post(`/api/leagues/${league.id}/leave`).set(m1.auth)).status).toBe(200);
    expect((await request(app).get(`/api/leagues/${league.id}`).set(m1.auth)).status).toBe(404);
    expect((await request(app).post(`/api/leagues/${league.id}/leave`).set(m1.auth)).status).toBe(404);

    // Davet kodu: sadece sahip
    expect((await request(app).post(`/api/leagues/${league.id}/invite-code`).set(m2.auth)).status).toBe(403);
    const regen = await request(app).post(`/api/leagues/${league.id}/invite-code`).set(owner.auth);
    expect(regen.status).toBe(200);
    expect(regen.body.data.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(regen.body.data.invite_code).not.toBe(league.invite_code);
    await expect(svc.preview(m1.id, league.invite_code)).rejects.toMatchObject({ status: 404 });
    expect((await svc.preview(m1.id, regen.body.data.invite_code)).name).toBe('Kurallar Ligi');

    // Üye çıkarma
    expect((await request(app).delete(`/api/leagues/${league.id}/members/${owner.id}`).set(m2.auth)).status).toBe(403);
    const self = await request(app).delete(`/api/leagues/${league.id}/members/${owner.id}`).set(owner.auth);
    expect(self.status).toBe(400);
    expect((await request(app).delete(`/api/leagues/${league.id}/members/${m1.id}`).set(owner.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/leagues/${league.id}/members/${m2.id}`).set(owner.auth)).status).toBe(200);
    expect((await svc.getDetail(league.id, owner.id)).members.map((m) => m.user_id)).toEqual([owner.id]);

    // Silme: sadece sahip
    await svc.join(m2.id, regen.body.data.invite_code);
    expect((await request(app).delete(`/api/leagues/${league.id}`).set(m2.auth)).status).toBe(403);
    const del = await request(app).delete(`/api/leagues/${league.id}`).set(owner.auth);
    expect(del.status).toBe(200);
    expect(await leagueByName('Kurallar Ligi')).toBeUndefined();
    expect(await q(`SELECT 1 FROM league_members WHERE league_id = $1`, [league.id])).toHaveLength(0);
    expect((await request(app).get(`/api/leagues/${league.id}`).set(owner.auth)).status).toBe(404);
  });
});
