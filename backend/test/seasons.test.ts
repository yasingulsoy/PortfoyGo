import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Veritabanı: bellek içi PGlite (uzak veritabanına asla bağlanılmaz). orders.test.ts ile aynı desen:
// connect() bir mutex alır; transaction'lar birbirine karışmaz, eşzamanlı çağrılar sıraya girer.
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

type Seasons = typeof import('../src/services/seasons');
type Competition = typeof import('../src/utils/competition');

/** Şu andan n ay önceki ayın 15'i, 12:00 UTC (İstanbul'da da aynı ay) */
const monthsAgo = (n: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15, 12));
};

describe('SeasonService (PGlite)', () => {
  let svc: Seasons['SeasonService'];
  let comp: Competition;
  let app: import('express').Express;
  let sign: (id: string) => string;
  let seq = 0;

  const q = async (sql: string, params: unknown[] = []) => (await h.db.query(sql, params)).rows as any[];
  const num = (v: unknown) => Number(v);

  const newUser = async (opts: { balance?: number; verified?: boolean; banned?: boolean } = {}) => {
    seq += 1;
    const rows = await q(
      `INSERT INTO users (username, email, password_hash, balance, email_verified, is_banned)
       VALUES ($1, $2, 'x', $3, $4, $5) RETURNING id`,
      [`s${seq}`, `s${seq}@test.io`, opts.balance ?? 100_000, opts.verified ?? true, opts.banned ?? false]
    );
    return rows[0].id as string;
  };
  const participant = async (slug: string, userId: string) =>
    (
      await q(
        `SELECT sp.* FROM season_participants sp JOIN seasons s ON s.id = sp.season_id WHERE s.slug = $1 AND sp.user_id = $2`,
        [slug, userId]
      )
    )[0];
  const setBaseline = (slug: string, userId: string, baseline: number, joinedAt?: Date) =>
    q(
      `UPDATE season_participants SET baseline_equity = $3, joined_at = COALESCE($4::timestamptz, joined_at)
        WHERE season_id = (SELECT id FROM seasons WHERE slug = $1) AND user_id = $2`,
      [slug, userId, baseline, joinedAt ? joinedAt.toISOString() : null]
    );
  const addTrade = (userId: string, at: Date) =>
    q(
      `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at)
       VALUES ($1, 'buy', 'AAPL', 'Apple', 'stock', 1, 100, 100, 0.25, 100.25, ($2::timestamptz AT TIME ZONE current_setting('TimeZone')))`,
      [userId, at.toISOString()]
    );

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    svc = (await import('../src/services/seasons')).SeasonService;
    comp = await import('../src/utils/competition');
    app = (await import('../src/app')).createApp();
    const { AuthService } = await import('../src/services/auth');
    sign = (id: string) => AuthService.signSessionToken(id, 0);
  }, 60_000);

  afterAll(async () => {
    await h.db?.close();
  });

  // ---------------------------------------------------------------------------

  it('takvim: İstanbul saatine göre ay kodu ve Türkçe ad', () => {
    // 30 Eylül 21:30 UTC = 1 Ekim 00:30 İstanbul
    expect(comp.seasonSlugFor(new Date('2026-09-30T21:30:00Z'))).toBe('2026-10');
    expect(comp.seasonSlugFor(new Date('2026-09-30T20:59:59Z'))).toBe('2026-09');
    expect(comp.seasonNameFor('2026-10')).toBe('Ekim 2026');
    expect(comp.seasonNameFor('2027-02')).toBe('Şubat 2027');
    expect(comp.previousSeasonSlug('2027-01')).toBe('2026-12');
    expect(comp.awardTitleFor(1)).toBe('Sezon Şampiyonu');
    expect(comp.awardTitleFor(3)).toBe('Sezon Podyumu');
    expect(comp.awardTitleFor(10)).toBe("Sezonun İlk 10'u");
    expect(comp.awardTitleFor(11)).toBeNull();
  });

  it('ensureCurrentSeason güncel sezonu oluşturur ve idempotenttir', async () => {
    const a = await svc.ensureCurrentSeason();
    const b = await svc.ensureCurrentSeason();
    expect(b.id).toBe(a.id);
    expect(a.slug).toBe(comp.seasonSlugFor(new Date()));
    expect(a.name).toBe(comp.seasonNameFor(a.slug));
    expect(a.status).toBe('active');
    const rows = await q(
      `SELECT to_char(starts_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS s,
              to_char(ends_at AT TIME ZONE 'Europe/Istanbul', 'DD HH24:MI') AS e
         FROM seasons WHERE slug = $1`,
      [a.slug]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].s).toBe(`${a.slug}-01 00:00`);
    expect(rows[0].e).toBe('01 00:00');
    expect(new Date(a.starts_at).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(a.ends_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('enrollEligible: sadece doğrulanmış + yasaklı olmayanları, güncel toplam varlıkla ekler', async () => {
    const ok = await newUser({ balance: 90_000 });
    const unverified = await newUser({ verified: false });
    const banned = await newUser({ banned: true });
    await q(`UPDATE users SET reserved_cash = 500 WHERE id = $1`, [ok]);
    await q(
      `INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price, total_value)
       VALUES ($1, 'AAPL', 'Apple', 'stock', 10, 200, 250, 2500)`,
      [ok]
    );

    const added = await svc.enrollEligible();
    expect(added).toBeGreaterThanOrEqual(1);
    const slug = comp.seasonSlugFor(new Date());
    expect(num((await participant(slug, ok)).baseline_equity)).toBeCloseTo(93_000, 2);
    expect(await participant(slug, unverified)).toBeUndefined();
    expect(await participant(slug, banned)).toBeUndefined();

    // Tekrar çalıştırmak hiçbir şey eklemez, referansı değiştirmez
    await q(`UPDATE users SET balance = 50000 WHERE id = $1`, [ok]);
    expect(await svc.enrollEligible()).toBe(0);
    expect(num((await participant(slug, ok)).baseline_equity)).toBeCloseTo(93_000, 2);
  });

  it('canlı sıralama: getiri %, eşitlikte önce katılan; getCurrent `me` ve tembel katılım', async () => {
    const slug = comp.seasonSlugFor(new Date());
    // Önceki testlerin katılımcılarını sıralamadan çıkar (bu test kendi kullanıcılarına bakar)
    await q(`DELETE FROM season_participants`);
    const a = await newUser({ balance: 110_000 });
    const b = await newUser({ balance: 105_000 });
    const c = await newUser({ balance: 105_000 });
    await svc.enrollEligible();
    const t0 = new Date(Date.now() - 3_600_000);
    await setBaseline(slug, a, 100_000, t0); // +10%
    await setBaseline(slug, b, 100_000, new Date(t0.getTime() + 1000)); // +5%, önce katıldı
    await setBaseline(slug, c, 100_000, new Date(t0.getTime() + 2000)); // +5%

    const lb = await svc.getLeaderboard(slug, 50, 0, b);
    expect(lb.total).toBe(3);
    expect(lb.entries.map((e) => e.user_id)).toEqual([a, b, c]);
    expect(lb.entries[0]).toMatchObject({ rank: 1, return_pct: 10, profit_tl: 10_000, equity: 110_000, baseline_equity: 100_000, is_me: false });
    expect(lb.entries[1].is_me).toBe(true);

    const page = await svc.getLeaderboard(slug, 1, 1);
    expect(page.entries.map((e) => e.rank)).toEqual([2]);
    expect(page.total).toBe(3);

    // Yeni doğrulanmış kullanıcı: ilk ziyaretinde sezona katılır
    const d = await newUser({ balance: 80_000 });
    const cur = await svc.getCurrent(d);
    expect(cur.participants).toBe(4);
    expect(cur.me).toMatchObject({ rank: 4, return_pct: 0, baseline_equity: 80_000, equity: 80_000, profit_tl: 0 });

    // Getiri 4 ondalığa yuvarlanır
    await q(`UPDATE users SET balance = 80000.01 WHERE id = $1`, [d]);
    expect((await svc.getCurrent(d)).me?.return_pct).toBe(0);
    await q(`UPDATE users SET balance = 80001 WHERE id = $1`, [d]);
    expect((await svc.getCurrent(d)).me?.return_pct).toBe(0.0013);

    // Doğrulanmamış kullanıcı katılmaz
    const u = await newUser({ verified: false });
    expect((await svc.getCurrent(u)).me).toBeNull();

    // Eski /api/leaderboard?board=season biçimi
    const legacy = await svc.getCurrentLeaderboardLegacy(2);
    expect(legacy.leaderboard).toHaveLength(2);
    expect(legacy.leaderboard[0]).toMatchObject({ rank: 1, profit_loss_percent: 10, board: 'season', season_profit_loss_tl: 10_000 });
  });

  it('sonlandırma: değerleri dondurur, sıralar ve ödülleri (≥1 işlem, doğrulanmış, yasaklı değil) yazar', async () => {
    const past = monthsAgo(2);
    const pastSlug = comp.seasonSlugFor(past);
    const created = await svc.ensureCurrentSeason(past);
    expect(created).toMatchObject({ slug: pastSlug, status: 'active' });

    // Sadece bu testin kullanıcıları katılsın
    const ids = {
      champ: await newUser({ balance: 120_000 }), // +20%, işlem var
      noTrade: await newUser({ balance: 150_000 }), // +50% ama işlem yok → ödül yok
      second: await newUser({ balance: 110_000 }), // +10%, işlem var
      bannedLater: await newUser({ balance: 130_000 }), // +30%, işlem var ama sonradan yasaklı
      third: await newUser({ balance: 101_000 }), // +1%, işlem var
      loser: await newUser({ balance: 90_000 }), // -10%, işlem var
      outsideTrade: await newUser({ balance: 140_000 }), // +40%, işlem sezon DIŞINDA
    };
    const seasonId = created.id;
    for (const [i, id] of Object.values(ids).entries()) {
      await q(
        `INSERT INTO season_participants (season_id, user_id, baseline_equity, joined_at)
         VALUES ($1, $2, 100000, $3::timestamptz)`,
        [seasonId, id, new Date(new Date(created.starts_at).getTime() + i * 1000).toISOString()]
      );
    }
    for (const id of [ids.champ, ids.second, ids.bannedLater, ids.third, ids.loser]) {
      await addTrade(id, past);
    }
    await addTrade(ids.champ, new Date(past.getTime() + 3_600_000));
    await addTrade(ids.outsideTrade, new Date()); // bu ay → sayılmaz
    await q(`UPDATE users SET is_banned = true WHERE id = $1`, [ids.bannedLater]);

    // Bitmemiş sezon sonlandırılamaz
    expect(await svc.finalizeSeason(seasonId, past)).toBe(false);

    await svc.ensureCurrentSeason(); // gerçek "şimdi" → geçmiş sezon biter
    const s = (await q(`SELECT * FROM seasons WHERE id = $1`, [seasonId]))[0];
    expect(s.status).toBe('finished');
    expect(s.finalized_at).not.toBeNull();

    const p = async (id: string) => (await q(`SELECT * FROM season_participants WHERE season_id = $1 AND user_id = $2`, [seasonId, id]))[0];
    expect(num((await p(ids.champ)).final_equity)).toBeCloseTo(120_000, 2);
    expect(num((await p(ids.champ)).final_return_pct)).toBeCloseTo(20, 4);
    expect((await p(ids.champ)).trades_count).toBe(2);
    expect((await p(ids.noTrade)).trades_count).toBe(0);
    expect((await p(ids.outsideTrade)).trades_count).toBe(0);
    // final_rank: tüm uygun (doğrulanmış, yasaklı olmayan) katılımcılar arasında
    expect((await p(ids.noTrade)).final_rank).toBe(1);
    expect((await p(ids.outsideTrade)).final_rank).toBe(2);
    expect((await p(ids.champ)).final_rank).toBe(3);
    expect((await p(ids.bannedLater)).final_rank).toBeNull();
    expect((await p(ids.loser)).final_rank).toBe(6);

    const awards = await q(`SELECT user_id, rank, title, return_pct FROM season_awards WHERE season_id = $1 ORDER BY rank`, [seasonId]);
    expect(awards.map((a) => a.user_id)).toEqual([ids.champ, ids.second, ids.third, ids.loser]);
    expect(awards.map((a) => a.title)).toEqual(['Sezon Şampiyonu', 'Sezon Podyumu', 'Sezon Podyumu', "Sezonun İlk 10'u"]);
    expect(num(awards[0].return_pct)).toBeCloseTo(20, 4);

    // Dondurulmuş: bakiyeler değişse de sıralama aynı kalır
    await q(`UPDATE users SET balance = 10 WHERE id = $1`, [ids.noTrade]);
    const lb = await svc.getLeaderboard(pastSlug, 50, 0, ids.champ);
    expect(lb.season.status).toBe('finished');
    expect(lb.total).toBe(6);
    expect(lb.entries[0]).toMatchObject({ rank: 1, user_id: ids.noTrade, equity: 150_000, return_pct: 50, profit_tl: 50_000 });
    expect(lb.entries.find((e) => e.user_id === ids.champ)?.is_me).toBe(true);

    expect(await svc.getAwards(ids.champ)).toEqual([
      expect.objectContaining({ season_slug: pastSlug, season_name: comp.seasonNameFor(pastSlug), rank: 1, title: 'Sezon Şampiyonu', return_pct: 20 }),
    ]);
    expect(await svc.getAwards(ids.noTrade)).toEqual([]);

    // Sezon listesi: yeniden eskiye, biten sezonun ilk 3'ü
    const list = await svc.listSeasons(12);
    expect(list[0].season.slug).toBe(comp.seasonSlugFor(new Date()));
    expect(list[0].winners).toEqual([]);
    const pastItem = list.find((x) => x.season.slug === pastSlug)!;
    expect(pastItem.participants).toBe(6);
    expect(pastItem.winners.map((w) => w.rank)).toEqual([1, 2, 3]);
    expect(pastItem.winners[0]).toMatchObject({ title: 'Sezon Şampiyonu', return_pct: 20 });
  });

  it('eşzamanlı sonlandırma güvenlidir (tek kez çalışır, ödüller çoğalmaz)', async () => {
    const past = monthsAgo(3);
    const season = await svc.ensureCurrentSeason(past);
    const u1 = await newUser({ balance: 105_000 });
    const u2 = await newUser({ balance: 102_000 });
    for (const id of [u1, u2]) {
      await q(`INSERT INTO season_participants (season_id, user_id, baseline_equity) VALUES ($1, $2, 100000)`, [season.id, id]);
      await addTrade(id, past);
    }

    const now = new Date();
    const results = await Promise.all([
      svc.finalizeSeason(season.id, now),
      svc.finalizeSeason(season.id, now),
      svc.ensureCurrentSeason(now).then(() => 'ensure'),
      svc.finalizeSeason(season.id, now),
    ]);
    expect(results.filter((r) => r === true)).toHaveLength(1);
    const awards = await q(`SELECT rank, user_id FROM season_awards WHERE season_id = $1 ORDER BY rank`, [season.id]);
    expect(awards.map((a) => a.user_id)).toEqual([u1, u2]);

    // Sonlandırılmış sezonu tekrar sonlandırmak hiçbir şeyi değiştirmez
    await q(`UPDATE users SET balance = 1 WHERE id = $1`, [u1]);
    expect(await svc.finalizeSeason(season.id, new Date())).toBe(false);
    const p = (await q(`SELECT final_equity FROM season_participants WHERE season_id = $1 AND user_id = $2`, [season.id, u1]))[0];
    expect(num(p.final_equity)).toBeCloseTo(105_000, 2);
  });

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  it('GET /api/seasons/current: anonim → me null; oturumla → me dolu', async () => {
    const anon = await request(app).get('/api/seasons/current');
    expect(anon.status).toBe(200);
    expect(anon.body.success).toBe(true);
    expect(anon.body.data.season).toMatchObject({ slug: comp.seasonSlugFor(new Date()), status: 'active' });
    expect(Object.keys(anon.body.data.season).sort()).toEqual(['ends_at', 'id', 'name', 'slug', 'starts_at', 'status']);
    expect(anon.body.data.me).toBeNull();
    expect(typeof anon.body.data.participants).toBe('number');

    const id = await newUser({ balance: 100_000 });
    const res = await request(app).get('/api/seasons/current').set('Authorization', `Bearer ${sign(id)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.me).toMatchObject({ baseline_equity: 100_000, equity: 100_000, return_pct: 0, profit_tl: 0 });
    expect(res.body.data.me.rank).toBeGreaterThan(0);

    // Geçersiz oturum anonim sayılır (401 değil)
    const bad = await request(app).get('/api/seasons/current').set('Authorization', 'Bearer not-a-token');
    expect(bad.status).toBe(200);
    expect(bad.body.data.me).toBeNull();
  });

  it('GET /api/seasons, /:slug/leaderboard, /me/awards', async () => {
    const list = await request(app).get('/api/seasons?limit=5');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(3);
    expect(list.body.data[0]).toHaveProperty('winners');

    const slug = comp.seasonSlugFor(new Date());
    const lb = await request(app).get(`/api/seasons/${slug}/leaderboard?limit=2&offset=0`);
    expect(lb.status).toBe(200);
    expect(lb.body.data.entries.length).toBeLessThanOrEqual(2);
    expect(lb.body.data.entries[0]).toEqual(
      expect.objectContaining({ rank: 1, is_me: false, user_id: expect.any(String), username: expect.any(String) })
    );
    expect(typeof lb.body.data.total).toBe('number');

    expect((await request(app).get('/api/seasons/1999-01/leaderboard')).status).toBe(404);
    const invalid = await request(app).get('/api/seasons/abc/leaderboard');
    expect(invalid.status).toBe(400);
    expect(invalid.body.success).toBe(false);

    expect((await request(app).get('/api/seasons/me/awards')).status).toBe(401);
    const id = await newUser();
    const awards = await request(app).get('/api/seasons/me/awards').set('Authorization', `Bearer ${sign(id)}`);
    expect(awards.status).toBe(200);
    expect(awards.body).toEqual({ success: true, data: [] });

    const legacy = await request(app).get('/api/leaderboard?board=season&limit=3');
    expect(legacy.status).toBe(200);
    expect(legacy.body.board).toBe('season');
    expect(legacy.body.leaderboard[0]).toMatchObject({ rank: 1, board: 'season' });
  });
});
