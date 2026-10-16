import { describe, expect, it } from 'vitest';
import { api, createUser, pool } from './helpers';
import { buildAchievements } from '../src/services/publicProfile';
import { hasUserDeletedColumn, resetUserColumnCache } from '../src/utils/userFilters';

// Herkese açık profil (/api/public/users/:username) + görünürlük (PATCH /api/me/profile-visibility).
// Paylaşılan PGlite (test/globalSetup.ts); hafta / sezon kimlikleri diğer testlerle çakışmasın diye geçmiş yıllardan.

/** Yanıtta asla bulunmaması gereken (tutar / özel veri) anahtarlar */
const FORBIDDEN_KEYS = [
  'balance',
  'cash',
  'reserved_cash',
  'equity',
  'portfolio_value',
  'total_value',
  'total_profit_loss',
  'profit_loss',
  'pl',
  'coins',
  'total_earned',
  'amount',
  'email',
  'password_hash',
  'notification_prefs',
  'condition_value',
];

function collectKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) collectKeys(x, out);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      collectKeys(x, out);
    }
  }
  return out;
}

async function insertSettledPick(userId: string, weekId: string, opts: { rank: number | null; settled: boolean; status?: 'active' | 'void' }) {
  // Hafta: Cmt 00:00 açılış → Paz 15:00 açıklama → Pzt 00:00 başlangıç → Cmt 00:00 bitiş (sabit, geçmişte)
  const base = Date.UTC(2000 + Number(weekId.slice(2, 4)), 0, 1) + Number(weekId.slice(6, 8)) * 7 * 86_400_000;
  const opens = new Date(base);
  const reveal = new Date(base + 39 * 3_600_000);
  const starts = new Date(base + 48 * 3_600_000);
  const ends = new Date(base + 7 * 86_400_000);
  await pool.query(
    `INSERT INTO weekly_pick_weeks (week_id, opens_at, reveal_at, starts_at, ends_at, settled_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (week_id) DO NOTHING`,
    [weekId, opens.toISOString(), reveal.toISOString(), starts.toISOString(), ends.toISOString(), opts.settled ? ends.toISOString() : null]
  );
  await pool.query(
    `INSERT INTO weekly_picks (week_id, user_id, asset_type, symbol, name, direction, quote_currency, status, return_pct, rank, entry_price, exit_price)
     VALUES ($1, $2, 'crypto', 'BTC', 'Bitcoin', 'up', 'USD', $3, $4, $5, 100, 104)`,
    [weekId, userId, opts.status ?? 'active', opts.rank === null ? null : 4, opts.rank]
  );
}

describe('herkese açık profil', () => {
  it('yalnızca yüzde/sıra döner; tutar veya özel veri yok', async () => {
    const u = await createUser({ balance: 110_000 });
    await pool.query(`UPDATE users SET xp = 500, arena_rating = 1260, title_id = 'title-boga' WHERE id = $1`, [u.id]);

    // Sezon unvanı (bitmiş, geçmiş bir sezon)
    const s = await pool.query(
      `INSERT INTO seasons (slug, name, starts_at, ends_at, status, finalized_at)
       VALUES ('2002-03', 'Mart 2002', '2002-03-01T00:00:00Z', '2002-04-01T00:00:00Z', 'finished', '2002-04-01T00:00:00Z')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    await pool.query(
      `INSERT INTO season_awards (season_id, user_id, rank, title, return_pct, awarded_at) VALUES ($1, $2, 1, 'Sezon Şampiyonu', 12.3456, '2002-04-01T00:00:00Z')`,
      [s.rows[0].id, u.id]
    );
    // Rozet
    const b = await pool.query(`SELECT id FROM badges WHERE name = 'İlk İşlem'`);
    await pool.query(`INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, '2002-05-01T10:00:00Z')`, [u.id, b.rows[0].id]);
    // Bitmiş Arena turu
    const round = await pool.query(
      `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, seed, finished_at)
       VALUES ('solo', $1, 'finished', now() - INTERVAL '2 minutes', now() - INTERVAL '1 minute', 60, '["BTC"]'::jsonb, 1, now() - INTERVAL '1 minute')
       RETURNING id`,
      [u.id]
    );
    await pool.query(`INSERT INTO arena_entries (round_id, user_id, cash, return_pct) VALUES ($1, $2, 10000, 3.456)`, [round.rows[0].id, u.id]);
    // Haftalık Seçim: sonuçlanmış iki hafta (biri birinci) + sonuçlanmamış (kör) bir hafta → sayılmaz
    await insertSettledPick(u.id, '2002-W10', { rank: 1, settled: true });
    await insertSettledPick(u.id, '2002-W11', { rank: 5, settled: true });
    await insertSettledPick(u.id, '2002-W12', { rank: null, settled: false });

    const r = await api().get(`/api/public/users/${u.username.toUpperCase()}`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toContain('max-age=30');
    const d = r.body.data;
    expect(d.username).toBe(u.username);
    expect(d.member_since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.portfolio.return_pct).toBe(10);
    expect(d.portfolio.rank).toBeGreaterThanOrEqual(1);
    expect(d.portfolio.ranked_players).toBeGreaterThanOrEqual(d.portfolio.rank);
    expect(d.title).toEqual({ id: 'title-boga', label: 'Boğa' });
    expect(d.arena).toMatchObject({ rating: 1260, level: 3, tier: { id: 'gold' }, rounds_played: 1, best_return_pct: 3.46, duel_record: null });
    expect(d.picks).toEqual({ weeks_played: 2, best_rank: 1, wins: 1, podiums: 1 });
    expect(d.season_awards).toEqual([
      { season_slug: '2002-03', season_name: 'Mart 2002', rank: 1, title: 'Sezon Şampiyonu', return_pct: 12.35, awarded_at: '2002-04-01T00:00:00.000Z' },
    ]);
    expect(d.badges).toEqual([
      { name: 'İlk İşlem', description: expect.any(String), icon: '🎯', category: 'transaction', earned_at: expect.any(String) },
    ]);
    expect(d.idle).toEqual({ rank: null });
    // Son başarılar: rozet + sezon + seçim birinciliği, yeniden eskiye
    expect(d.achievements.map((a: any) => a.kind)).toEqual(expect.arrayContaining(['badge', 'season', 'picks']));
    const times = d.achievements.map((a: any) => a.at);
    expect([...times].sort().reverse()).toEqual(times);

    // Tutar / özel veri yok (anahtar ve değer taraması)
    const keys = collectKeys(d);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `yasak anahtar: ${k}`).toBe(false);
    const json = JSON.stringify(d);
    expect(json).not.toContain(u.email);
    expect(json).not.toContain('110000');
    expect(json).not.toContain(u.id);
  });

  it('gizli profil → 404 PROFILE_PRIVATE (veri yok); oyun profili de gizlenir; tekrar açılabilir', async () => {
    const u = await createUser();
    expect((await api().get('/api/me/profile-visibility').set(u.auth)).body.data).toEqual({ profile_public: true, username: u.username });

    const off = await api().patch('/api/me/profile-visibility').set(u.auth).send({ profile_public: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({ profile_public: false, username: u.username });

    const r = await api().get(`/api/public/users/${u.username}`);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, message: 'Bu profil gizli', code: 'PROFILE_PRIVATE' });
    expect((await api().get(`/api/game/public-profile/${u.username}`)).status).toBe(404);

    await api().patch('/api/me/profile-visibility').set(u.auth).send({ profile_public: true }).expect(200);
    expect((await api().get(`/api/public/users/${u.username}`)).status).toBe(200);
  });

  it('görünürlük: oturum, CSRF ve doğrulama', async () => {
    const u = await createUser();
    expect((await api().patch('/api/me/profile-visibility').send({ profile_public: false })).status).toBe(401);
    // Çerezle gelen yazma isteği CSRF başlığı olmadan reddedilir
    await api().patch('/api/me/profile-visibility').set('Cookie', `pg_session=${u.token}`).send({ profile_public: false }).expect(403);
    await api()
      .patch('/api/me/profile-visibility')
      .set('Cookie', `pg_session=${u.token}`)
      .set('X-Requested-With', 'PortfoyGo')
      .send({ profile_public: true })
      .expect(200);
    expect((await api().patch('/api/me/profile-visibility').set(u.auth).send({ profile_public: 'hayır' })).status).toBe(400);
    expect((await api().patch('/api/me/profile-visibility').set(u.auth).send({ profile_public: true, extra: 1 })).status).toBe(400);
    expect((await api().patch('/api/me/profile-visibility').set(u.auth).send({})).status).toBe(400);
  });

  it('yok / yasaklı / bot / silinmiş hesap → 404 NOT_FOUND', async () => {
    expect((await api().get('/api/public/users/boyle_biri_yok_123')).body.code).toBe('NOT_FOUND');
    expect((await api().get('/api/public/users/a%2Fb')).status).toBe(400);

    const banned = await createUser();
    await pool.query('UPDATE users SET is_banned = TRUE WHERE id = $1', [banned.id]);
    expect((await api().get(`/api/public/users/${banned.username}`)).status).toBe(404);

    const bot = await createUser();
    await pool.query('UPDATE users SET is_bot = TRUE WHERE id = $1', [bot.id]);
    expect((await api().get(`/api/public/users/${bot.username}`)).status).toBe(404);

    // users.is_deleted başka bir migration'la gelir; kolon varsa silinmiş hesap da gizlenir
    resetUserColumnCache();
    if (await hasUserDeletedColumn()) {
      const del = await createUser();
      await pool.query('UPDATE users SET is_deleted = TRUE WHERE id = $1', [del.id]);
      expect((await api().get(`/api/public/users/${del.username}`)).status).toBe(404);
    }
  });

  it('e-postası doğrulanmamış oyuncu: profil açık, sıralama yok', async () => {
    const u = await createUser({ verified: false, balance: 95_000 });
    const r = await api().get(`/api/public/users/${u.username}`);
    expect(r.status).toBe(200);
    expect(r.body.data.portfolio).toMatchObject({ return_pct: -5, rank: null });
    expect(r.body.data.picks).toEqual({ weeks_played: 0, best_rank: null, wins: 0, podiums: 0 });
    expect(r.body.data.arena).toMatchObject({ rounds_played: 0, best_return_pct: null });
  });
});

describe('buildAchievements (saf)', () => {
  it('rozet, sezon ve seçim kürsülerini tarihe göre sıralar ve sınırlar', () => {
    const list = buildAchievements(
      {
        badges: [
          { name: 'A', description: 'a', icon: '🎯', category: 'x', earned_at: '2024-01-02T00:00:00.000Z' },
          { name: 'Tarihsiz', description: '', icon: '', category: 'x', earned_at: null },
        ],
        awards: [{ season_slug: '2024-01', season_name: 'Ocak 2024', rank: 1, title: 'Sezon Şampiyonu', return_pct: 5, awarded_at: '2024-02-01T00:00:00.000Z' }],
        podiums: [{ week_id: '2024-W03', rank: 2, at: '2024-01-20T00:00:00.000Z' }],
      },
      2
    );
    expect(list).toEqual([
      { kind: 'season', title: 'Sezon Şampiyonu', detail: 'Ocak 2024 · 1. sıra', icon: '🏆', at: '2024-02-01T00:00:00.000Z' },
      { kind: 'picks', title: 'Haftalık Seçim kürsüsü (2.)', detail: '2024-W03 haftası', icon: '🎖️', at: '2024-01-20T00:00:00.000Z' },
    ]);
    expect(buildAchievements({ badges: [], awards: [], podiums: [] })).toEqual([]);
  });
});
