import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { api, confirmAdult, createUser, pool, setMarketPrice, TestUser, uniqueSymbol } from './helpers';
import { picksClock } from '../src/services/picks/clock';
import { PicksService } from '../src/services/picks/service';
import { weekTimes } from '../src/services/picks/timeline';

// Haftalık Seçim API'si. Paylaşılan PGlite (test/globalSetup.ts). Zaman yolculuğu: picksClock (gerçek fiyat
// tazeliği yine gerçek saate göre). Her senaryo kendi (2031) haftasını kullanır; tick() önceki haftaları da
// telafi ettiği için genel sayaçlar değil, ilgili haftanın satırları doğrulanır.

const CSRF = { 'X-Requested-With': 'PortfoyGo' };
const MIN = 60_000;
const HOUR = 60 * MIN;

function clockAt(base: Date, offsetMs = 0): Date {
  const d = new Date(base.getTime() + offsetMs);
  picksClock.set(d);
  PicksService.clearCaches();
  return d;
}

async function player(): Promise<TestUser> {
  const u = await createUser();
  await confirmAdult(u.id);
  return u;
}

const put = (u: TestUser, weekId: string, body: Record<string, unknown>) => api().put(`/api/picks/weeks/${weekId}/pick`).set(u.auth).send(body);

async function pickRow(weekId: string, userId: string) {
  const r = await pool.query(`SELECT * FROM weekly_picks WHERE week_id = $1 AND user_id = $2`, [weekId, userId]);
  return r.rows[0];
}

async function weekRow(weekId: string) {
  return (await pool.query(`SELECT * FROM weekly_pick_weeks WHERE week_id = $1`, [weekId])).rows[0];
}

async function notificationsOf(userId: string, type: string, weekId: string) {
  const r = await pool.query(
    `SELECT title, body, link, category, data FROM notifications WHERE user_id = $1 AND type = $2 AND data->>'week_id' = $3 ORDER BY created_at`,
    [userId, type, weekId]
  );
  return r.rows;
}

async function insertHistory(symbol: string, granularity: 'm15' | 'hour' | 'day', bucketStart: Date, price: number) {
  await pool.query(
    `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency)
     VALUES ('stock', $1, $2, $3, $4, 'USD')
     ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price`,
    [symbol.toUpperCase(), granularity, bucketStart.toISOString(), price]
  );
}

afterEach(() => {
  picksClock.reset();
  PicksService.clearCaches();
});

afterAll(() => picksClock.reset());

describe('Haftalık Seçim: gizlilik (açıklanmadan önce)', () => {
  it('başkasının seçimi, notu, varlık sayıları ve yorumları submit evresinde ASLA dönmez', async () => {
    const week = '2031-W10';
    const t = weekTimes(week)!;
    const [a, b] = await Promise.all([player(), player()]);
    const SA = uniqueSymbol('HA');
    const SB = uniqueSymbol('HB');
    await setMarketPrice(SA, 120);
    await setMarketPrice(SB, 80);
    const secret = 'GIZLI-NOT-ornek-12345';

    clockAt(t.opens_at, HOUR);
    const ra = await put(a, week, { asset_type: 'stock', symbol: SA.toLowerCase(), direction: 'up', note: `  ${secret}  ` });
    expect(ra.status).toBe(200);
    expect(ra.body.data.pick).toMatchObject({ symbol: SA, direction: 'up', note: secret, is_me: true, status: 'active', quote_currency: 'USD', entry_price: null });
    expect(ra.body.data.pick.current_price).toBe(120);
    expect(ra.body.data.week).toMatchObject({ week_id: week, phase: 'submit', participants: 1, picks: null, crowd: null, my_rank: null });

    const leaks = (body: unknown) => {
      const s = JSON.stringify(body);
      return s.includes(SA) || s.includes(secret);
    };

    // B kendi seçimini gönderirken bile A'nınkini görmez
    const rb = await put(b, week, { asset_type: 'stock', symbol: SB, direction: 'down' });
    expect(rb.status).toBe(200);
    expect(rb.body.data.week.participants).toBe(2);
    expect(rb.body.data.week.picks).toBeNull();
    expect(leaks(rb.body)).toBe(false);

    const cur = await api().get('/api/picks/current').set(b.auth);
    expect(cur.status).toBe(200);
    expect(cur.headers['cache-control']).toBe('no-store');
    expect(cur.body.data.active).toMatchObject({ week_id: week, phase: 'submit', participants: 2, picks: null, crowd: null, comments_count: null });
    expect(cur.body.data.active.my_pick.symbol).toBe(SB);
    expect(leaks(cur.body)).toBe(false);

    const wk = await api().get(`/api/picks/weeks/${week.toLowerCase()}`).set(b.auth);
    expect(wk.status).toBe(200);
    expect(wk.body.data.picks).toBeNull();
    expect(leaks(wk.body)).toBe(false);

    const list = await api().get('/api/picks/weeks').set(b.auth);
    expect(list.status).toBe(200);
    const item = list.body.data.items.find((i: any) => i.week_id === week);
    expect(item).toMatchObject({ phase: 'submit', participants: 2, winner: null, crowd_return_pct: null, my: { return_pct: null, rank: null, status: 'active' } });
    expect(leaks(list.body)).toBe(false);

    // Oturumsuz
    const anon = await api().get('/api/picks/current');
    expect(anon.status).toBe(200);
    expect(anon.body.data.active.my_pick).toBeNull();
    expect(leaks(anon.body)).toBe(false);

    // Tartışma kapalı
    const comments = await api().get(`/api/picks/weeks/${week}/comments`).set(b.auth);
    expect(comments.status).toBe(409);
    expect(comments.body.code).toBe('PICKS_HIDDEN');
    expect(comments.body.reveal_at).toBe(t.reveal_at.toISOString());
    const post = await api().post(`/api/picks/weeks/${week}/comments`).set(b.auth).send({ text: 'erken yorum' });
    expect(post.status).toBe(409);
    expect(post.body.code).toBe('PICKS_HIDDEN');

    // A kendi seçimini ve notunu görür
    const mine = await api().get(`/api/picks/weeks/${week}`).set(a.auth);
    expect(mine.body.data.my_pick).toMatchObject({ symbol: SA, note: secret, is_me: true });
    expect(mine.body.data.picks).toBeNull();

    // Varlık arama: fiyatlar var, seçim sayısı yok
    const assets = await api().get('/api/picks/assets').query({ q: SA.slice(0, 5), type: 'stock' });
    expect(assets.status).toBe(200);
    expect(assets.body.data.find((x: any) => x.symbol === SA)).toEqual({
      asset_type: 'stock',
      symbol: SA,
      name: `${SA} Test Corp`,
      price: 120,
      quote_currency: 'USD',
      change_24h_pct: 0,
    });
    expect((await api().get('/api/picks/assets').query({ type: 'bond' })).status).toBe(400);

    // Açıklandıktan sonra herkes görür
    clockAt(t.reveal_at, MIN);
    const after = await api().get(`/api/picks/weeks/${week}`).set(b.auth);
    expect(after.body.data.phase).toBe('revealed');
    expect(after.body.data.picks.map((p: any) => p.symbol).sort()).toEqual([SA, SB].sort());
    expect(after.body.data.picks.find((p: any) => p.symbol === SA)).toMatchObject({ note: secret, is_me: false, return_pct: null, rank: null });
    expect(after.body.data.crowd).toMatchObject({ participants: 2, bullish_pct: 50, crowd_return_pct: null, beat_pct: null });
    expect(after.body.data.comments_count).toBe(0);

    // Var olmayan uzak hafta
    const missing = await api().get('/api/picks/weeks/2031-W40');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('WEEK_NOT_FOUND');
    expect((await api().get('/api/picks/weeks/2031-W99')).status).toBe(400);
  });
});

describe('Haftalık Seçim: gönderme / geri çekme yalnızca submit evresinde', () => {
  it('evre, 18+ onayı, mola, varlık ve doğrulama kuralları', async () => {
    const week = '2031-W12';
    const t = weekTimes(week)!;
    const a = await player();
    const minor = await createUser();
    const resting = await player();
    await pool.query(`UPDATE responsible_play SET break_until = '2099-01-01T00:00:00Z' WHERE user_id = $1`, [resting.id]);
    const S = uniqueSymbol('SU');
    const STALE = uniqueSymbol('ST');
    await setMarketPrice(S, 10);
    await setMarketPrice(STALE, 10, { ageMinutes: 120 });
    const ok = { asset_type: 'stock', symbol: S, direction: 'up' };

    clockAt(t.opens_at, -MIN);
    const early = await put(a, week, ok);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('PICKS_CLOSED');

    clockAt(t.opens_at, MIN);
    expect((await put(minor, week, ok)).body.code).toBe('ADULT_CONFIRM_REQUIRED');
    const br = await put(resting, week, ok);
    expect(br.status).toBe(403);
    expect(br.body.code).toBe('ARENA_BREAK');
    expect(br.body.break_until).toBe('2099-01-01T00:00:00.000Z');

    const bad = async (body: Record<string, unknown>, code: string, status = 400, weekId = week) => {
      const r = await put(a, weekId, body);
      expect(r.status).toBe(status);
      expect(r.body.code).toBe(code);
    };
    await bad({ ...ok, symbol: 'YOKBOYLE1' }, 'ASSET_UNAVAILABLE');
    await bad({ ...ok, symbol: STALE }, 'ASSET_UNAVAILABLE');
    await bad({ ...ok, asset_type: 'currency', symbol: 'TRY' }, 'ASSET_UNAVAILABLE');
    await bad({ ...ok, direction: 'sideways' }, 'VALIDATION_ERROR');
    await bad({ ...ok, asset_type: 'bond' }, 'VALIDATION_ERROR');
    await bad({ ...ok, note: 'x'.repeat(281) }, 'VALIDATION_ERROR');
    await bad(ok, 'VALIDATION_ERROR', 400, '2031-W99');

    const first = await put(a, week, { ...ok, note: 'ilk not' });
    expect(first.status).toBe(200);
    const s1 = first.body.data.pick.submitted_at;

    // Yalnızca not değişirse öncelik korunur
    clockAt(t.opens_at, 2 * MIN);
    const noteOnly = await put(a, week, { ...ok, note: 'güncel not' });
    expect(noteOnly.body.data.pick).toMatchObject({ note: 'güncel not', submitted_at: s1 });

    // Yön değişirse submitted_at yenilenir
    clockAt(t.opens_at, 3 * MIN);
    const flipped = await put(a, week, { ...ok, direction: 'down', note: null });
    expect(flipped.body.data.pick).toMatchObject({ direction: 'down', note: null });
    expect(Date.parse(flipped.body.data.pick.submitted_at)).toBeGreaterThan(Date.parse(s1));
    expect(await pool.query(`SELECT COUNT(*)::int AS n FROM weekly_picks WHERE week_id = $1 AND user_id = $2`, [week, a.id])).toMatchObject({
      rows: [{ n: 1 }],
    });

    // Çerezle yazma: CSRF başlığı zorunlu
    const cookie = `pg_session=${a.token}`;
    expect((await api().put(`/api/picks/weeks/${week}/pick`).set('Cookie', cookie).send(ok)).status).toBe(403);
    expect((await api().put(`/api/picks/weeks/${week}/pick`).set('Cookie', cookie).set(CSRF).send(ok)).status).toBe(200);
    expect((await api().put(`/api/picks/weeks/${week}/pick`).send(ok)).status).toBe(401);

    // Geri çekme
    const del = await api().delete(`/api/picks/weeks/${week}/pick`).set(a.auth);
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ deleted: true, week: { my_pick: null, participants: 0 } });
    expect((await api().delete(`/api/picks/weeks/${week}/pick`).set(a.auth)).body.data.deleted).toBe(false);
    expect((await put(a, week, ok)).status).toBe(200);

    // Açıklandıktan sonra kapalı
    clockAt(t.reveal_at, MIN);
    const late = await put(a, week, { ...ok, direction: 'down' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('PICKS_CLOSED');
    const lateDel = await api().delete(`/api/picks/weeks/${week}/pick`).set(a.auth);
    expect(lateDel.status).toBe(409);
    expect((await pickRow(week, a.id)).direction).toBe('up');

    // Canlı evrede de kapalı
    clockAt(t.starts_at, HOUR);
    expect((await put(a, week, ok)).body.code).toBe('PICKS_CLOSED');
  });
});

describe('Haftalık Seçim: açıklama → canlı → kapanış → ödüller', () => {
  it('fiyatlar, sıralama (eşitlik), kitle, ödüller ve bildirimler; kapanış idempotent', async () => {
    const week = '2031-W14';
    const t = weekTimes(week)!;
    const S1 = uniqueSymbol('L1');
    const S2 = uniqueSymbol('L2');
    const S3 = uniqueSymbol('L3');
    await setMarketPrice(S1, 100);
    await setMarketPrice(S2, 50);
    await setMarketPrice(S3, 10);
    const a = await player();
    const b = await player();
    const c = await player();
    const d = await player();
    const e = await player();

    clockAt(t.opens_at, HOUR);
    expect((await put(a, week, { asset_type: 'stock', symbol: S1, direction: 'up', note: 'A notu' })).status).toBe(200);
    expect((await put(b, week, { asset_type: 'stock', symbol: S1, direction: 'down' })).status).toBe(200);
    clockAt(t.opens_at, 2 * HOUR);
    expect((await put(c, week, { asset_type: 'stock', symbol: S2, direction: 'up' })).status).toBe(200);
    expect((await put(d, week, { asset_type: 'stock', symbol: S3, direction: 'up' })).status).toBe(200);
    clockAt(t.opens_at, 3 * HOUR);
    expect((await put(e, week, { asset_type: 'stock', symbol: S2, direction: 'up' })).status).toBe(200);

    // --- Açıklama (Pazar 15:00) ---
    await PicksService.tick(clockAt(t.reveal_at, 30_000));
    expect((await weekRow(week)).revealed_notified_at).not.toBeNull();
    expect((await weekRow(week)).entry_captured_at).toBeNull();
    const rev = await notificationsOf(a.id, 'picks.revealed', week);
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ link: '/oyun/haftalik-secim', category: 'competition' });
    expect(rev[0].title).toContain('Seçimler açıklandı');
    expect(rev[0].title).toContain(S2); // en çok seçilen (eşit sayıda → daha çok 'up')
    await PicksService.tick(clockAt(t.reveal_at, 10 * MIN));
    expect(await notificationsOf(a.id, 'picks.revealed', week)).toHaveLength(1);

    const revealed = await api().get(`/api/picks/weeks/${week}`).set(b.auth);
    expect(revealed.body.data.phase).toBe('revealed');
    expect(revealed.body.data.picks).toHaveLength(5);
    expect(revealed.body.data.picks.find((p: any) => p.symbol === S1 && p.direction === 'up').note).toBe('A notu');
    expect(revealed.body.data.crowd.top_assets[0]).toMatchObject({ symbol: S2, picks: 2, up: 2, down: 0, avg_return_pct: null });
    expect(revealed.body.data.crowd.top_assets[1]).toMatchObject({ symbol: S1, picks: 2, up: 1, down: 1 });
    expect(revealed.body.data.my_pick).toMatchObject({ symbol: S1, direction: 'down', is_me: true });

    // --- Başlangıç (Pazartesi 00:00): S3'ün fiyatı bayat → giriş yok → void ---
    await setMarketPrice(S3, 10, { ageMinutes: 120 });
    await PicksService.tick(clockAt(t.starts_at, 30_000));
    expect(Number((await pickRow(week, a.id)).entry_price)).toBe(100);
    expect(Number((await pickRow(week, c.id)).entry_price)).toBe(50);
    expect(await pickRow(week, d.id)).toMatchObject({ status: 'void', void_reason: 'no_entry_price', entry_price: null });

    // --- Canlı ---
    await setMarketPrice(S1, 110);
    await setMarketPrice(S2, 52);
    clockAt(t.starts_at, 2 * 24 * HOUR);
    const live = await api().get(`/api/picks/weeks/${week}`).set(a.auth);
    expect(live.body.data.phase).toBe('live');
    expect(live.body.data.my_rank).toBe(1);
    expect(live.body.data.my_pick).toMatchObject({ entry_price: 100, current_price: 110, return_pct: 10, rank: 1, exit_price: null });
    expect(live.body.data.crowd).toMatchObject({ participants: 5, bullish_pct: 80, crowd_return_pct: 2, beat_pct: 25 });
    expect(live.body.data.standings_updated_at).not.toBeNull();
    expect(live.body.data.picks.map((p: any) => p.rank)).toEqual([1, 2, 3, 4, null]);
    expect(live.body.data.picks[4]).toMatchObject({ status: 'void', return_pct: null });

    // --- Kapanış (Cumartesi 00:00) ---
    await setMarketPrice(S1, 120);
    await setMarketPrice(S2, 54);
    const settleAt = clockAt(t.ends_at, 30_000);
    await PicksService.tick(settleAt);
    const w = await weekRow(week);
    expect(w.settled_at).not.toBeNull();
    expect(w.rewarded_at).not.toBeNull();
    expect({ p: w.participants, v: w.valid_picks, bull: Number(w.bullish_pct), crowd: Number(w.crowd_return_pct), beat: Number(w.beat_pct) }).toEqual({
      p: 5,
      v: 4,
      bull: 80,
      crowd: 4, // (20 − 20 + 8 + 8) / 4
      beat: 25,
    });
    const rowA = await pickRow(week, a.id);
    expect({ exit: Number(rowA.exit_price), ret: Number(rowA.return_pct), rank: rowA.rank }).toEqual({ exit: 120, ret: 20, rank: 1 });
    expect((await pickRow(week, c.id)).rank).toBe(2); // eşit getiri (+8) → erken gönderen önde
    expect((await pickRow(week, e.id)).rank).toBe(3);
    expect(await pickRow(week, b.id)).toMatchObject({ rank: 4, status: 'active' });
    expect(Number((await pickRow(week, b.id)).return_pct)).toBe(-20);
    expect((await pickRow(week, d.id)).rank).toBeNull();

    const ledger = async () =>
      (
        await pool.query(
          `SELECT user_id, reason, coins, xp FROM game_ledger WHERE ref_type = 'weekly_pick' AND ref_id = $1 ORDER BY user_id, reason`,
          [week]
        )
      ).rows;
    const sumFor = (rows: any[], userId: string) =>
      rows.filter((r) => r.user_id === userId).reduce((acc, r) => ({ coins: acc.coins + r.coins, xp: acc.xp + r.xp }), { coins: 0, xp: 0 });
    const l1 = await ledger();
    expect(sumFor(l1, a.id)).toEqual({ coins: 150, xp: 135 });
    expect(sumFor(l1, c.id)).toEqual({ coins: 100, xp: 105 });
    expect(sumFor(l1, e.id)).toEqual({ coins: 60, xp: 75 });
    expect(sumFor(l1, b.id)).toEqual({ coins: 0, xp: 15 });
    expect(sumFor(l1, d.id)).toEqual({ coins: 0, xp: 0 });

    const resA = await notificationsOf(a.id, 'picks.results', week);
    expect(resA).toHaveLength(1);
    expect(resA[0].title).toBe('Haftalık seçim: 1. oldun, getirin %+20,00');
    expect(resA[0].data).toMatchObject({ rank: 1, return_pct: 20, crowd_return_pct: 4, coins: 150, xp: 135 });
    expect((await notificationsOf(d.id, 'picks.results', week))[0].title).toContain('değerlendirilemedi');
    expect(await notificationsOf(b.id, 'picks.results', week)).toHaveLength(1);

    const fin = await api().get(`/api/picks/weeks/${week}`).set(e.auth);
    expect(fin.body.data).toMatchObject({ phase: 'finished', my_rank: 3, participants: 5 });
    expect(fin.body.data.crowd).toMatchObject({ crowd_return_pct: 4, beat_pct: 25, bullish_pct: 80 });
    expect(fin.body.data.standings_updated_at).toBe(new Date(w.settled_at).toISOString());
    expect(fin.body.data.picks.map((p: any) => p.rank)).toEqual([1, 2, 3, 4, null]);
    expect(fin.body.data.picks[0]).toMatchObject({ entry_price: 100, exit_price: 120, return_pct: 20, current_price: null });
    expect(fin.body.data.crowd.top_assets.find((x: any) => x.symbol === S1)).toMatchObject({ avg_return_pct: 0, change_pct: 20 });

    // --- İdempotans: tekrar çalıştırmak hiçbir şeyi değiştirmez ---
    const coinsBefore = (await pool.query(`SELECT id, coins, xp FROM users WHERE id = ANY($1::uuid[]) ORDER BY id`, [[a.id, b.id, c.id, e.id]])).rows;
    await PicksService.tick(settleAt);
    await PicksService.tick(clockAt(t.ends_at, 2 * 24 * HOUR));
    expect(await PicksService.settleStep(week, picksClock.now())).toBe(false);
    expect(await PicksService.rewardStep(week, picksClock.now())).toBe(false);
    expect(await PicksService.entryStep(week, picksClock.now())).toBe(false);
    expect(await PicksService.revealStep(week, picksClock.now())).toBe(false);
    // Ödül adımı zorla yeniden çalışsa bile defter (ledger) çift ödül yazmaz
    await pool.query(`UPDATE weekly_pick_weeks SET rewarded_at = NULL WHERE week_id = $1`, [week]);
    expect(await PicksService.rewardStep(week, picksClock.now())).toBe(true);
    expect(await ledger()).toEqual(l1);
    expect((await pool.query(`SELECT id, coins, xp FROM users WHERE id = ANY($1::uuid[]) ORDER BY id`, [[a.id, b.id, c.id, e.id]])).rows).toEqual(coinsBefore);
    expect(Number((await pickRow(week, a.id)).exit_price)).toBe(120);

    // Hafta listesi
    const list = await api().get('/api/picks/weeks').set(c.auth);
    const item = list.body.data.items.find((i: any) => i.week_id === week);
    expect(item).toMatchObject({ phase: 'finished', participants: 5, crowd_return_pct: 4, my: { rank: 2, return_pct: 8, status: 'active' } });
    expect(item.winner).toMatchObject({ return_pct: 20 });
    expect(item.winner.username).toBe(a.username);

    // previous: en son biten hafta
    clockAt(t.ends_at, 3 * 24 * HOUR);
    const cur = await api().get('/api/picks/current').set(a.auth);
    expect(cur.body.data.previous).toMatchObject({ week_id: week, phase: 'finished', my_rank: 1 });
    expect(cur.body.data.active.phase).toBe('live');
  });
});

describe('Haftalık Seçim: geç kalınan fiyat yakalama ve telafi', () => {
  it('geç kalınca fiyat geçmişi (ileriye bakmadan); 6 saat içinde yoksa void', async () => {
    const week = '2031-W16';
    const t = weekTimes(week)!;
    const S4 = uniqueSymbol('H4');
    const S5 = uniqueSymbol('H5');
    const S6 = uniqueSymbol('H6');
    await Promise.all([setMarketPrice(S4, 205), setMarketPrice(S5, 50), setMarketPrice(S6, 310)]);
    const [a, b, c] = [await player(), await player(), await player()];

    clockAt(t.opens_at, HOUR);
    expect((await put(a, week, { asset_type: 'stock', symbol: S4, direction: 'up' })).status).toBe(200);
    expect((await put(b, week, { asset_type: 'stock', symbol: S5, direction: 'up' })).status).toBe(200);
    expect((await put(c, week, { asset_type: 'stock', symbol: S6, direction: 'down' })).status).toBe(200);

    const s = t.starts_at.getTime();
    const en = t.ends_at.getTime();
    // S4 giriş: [T−15dk, T) kovası (bitiş = T) ✓; [T, T+15dk) kovası ileriye bakar ✗; saatlik [T−1s, T) aynı bitiş → ince kova öncelikli
    await insertHistory(S4, 'm15', new Date(s - 15 * MIN), 200);
    await insertHistory(S4, 'm15', new Date(s), 999);
    await insertHistory(S4, 'hour', new Date(s - HOUR), 190);
    // S4 çıkış: bitişten 30 dk önce kapanan kova ✓; bitişteki kova ✗
    await insertHistory(S4, 'm15', new Date(en - 45 * MIN), 220);
    await insertHistory(S4, 'm15', new Date(en), 555);
    // S6 giriş: 1 saat önce kapanan saatlik kova ✓; çıkış: yalnızca 7 saat önce kapanan kova → void
    await insertHistory(S6, 'hour', new Date(s - 2 * HOUR), 300);
    await insertHistory(S6, 'hour', new Date(en - 8 * HOUR), 270);

    // Sunucu açıklama ve başlangıç sırasında kapalıydı: ilk çalışma Pazartesi 02:00
    await PicksService.tick(clockAt(t.starts_at, 2 * HOUR));
    expect((await weekRow(week)).revealed_notified_at).not.toBeNull();
    expect(await notificationsOf(a.id, 'picks.revealed', week)).toHaveLength(1); // hafta bitmedi → yine gönderilir
    const ea = await pickRow(week, a.id);
    expect(Number(ea.entry_price)).toBe(200);
    expect(new Date(ea.entry_at).toISOString()).toBe(t.starts_at.toISOString());
    expect(await pickRow(week, b.id)).toMatchObject({ status: 'void', void_reason: 'no_entry_price' });
    expect(Number((await pickRow(week, c.id)).entry_price)).toBe(300);

    await PicksService.tick(clockAt(t.ends_at, 3 * HOUR));
    const xa = await pickRow(week, a.id);
    expect({ exit: Number(xa.exit_price), ret: Number(xa.return_pct), rank: xa.rank, status: xa.status }).toEqual({ exit: 220, ret: 10, rank: 1, status: 'active' });
    expect(await pickRow(week, c.id)).toMatchObject({ status: 'void', void_reason: 'no_exit_price', rank: null, return_pct: null });
    const w = await weekRow(week);
    expect({ v: w.valid_picks, crowd: Number(w.crowd_return_pct), beat: Number(w.beat_pct) }).toEqual({ v: 1, crowd: 10, beat: 0 });
    expect(w.rewarded_at).not.toBeNull();
  });

  it('sunucu tüm hafta kapalıysa tek çalışmada hepsi telafi edilir; bitmiş hafta için açıklama bildirimi gönderilmez', async () => {
    const week = '2031-W18';
    const t = weekTimes(week)!;
    const S7 = uniqueSymbol('C7');
    await setMarketPrice(S7, 40);
    const a = await player();

    clockAt(t.opens_at, HOUR);
    expect((await put(a, week, { asset_type: 'stock', symbol: S7, direction: 'down' })).status).toBe(200);
    await insertHistory(S7, 'm15', new Date(t.starts_at.getTime() - 15 * MIN), 40);
    await insertHistory(S7, 'day', new Date(t.ends_at.getTime() - 24 * HOUR), 36); // günlük kova bitişi = ends_at

    await PicksService.tick(clockAt(t.ends_at, HOUR));
    const w = await weekRow(week);
    expect([w.revealed_notified_at, w.entry_captured_at, w.settled_at, w.rewarded_at].every((x) => x !== null)).toBe(true);
    expect(await notificationsOf(a.id, 'picks.revealed', week)).toHaveLength(0);
    const p = await pickRow(week, a.id);
    expect({ entry: Number(p.entry_price), exit: Number(p.exit_price), ret: Number(p.return_pct), rank: p.rank }).toEqual({ entry: 40, exit: 36, ret: 10, rank: 1 });
    const res = await notificationsOf(a.id, 'picks.results', week);
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('Haftalık seçim: 1. oldun, getirin %+10,00');
  });
});

describe('Haftalık Seçim: tartışma ve yönetici moderasyonu', () => {
  it('yorumlar (hız sınırı, sayfalama, silme), not gizleme, denetim kaydı', async () => {
    const week = '2031-W20';
    const t = weekTimes(week)!;
    const S = uniqueSymbol('CM');
    await setMarketPrice(S, 10);
    const admin = await player();
    await pool.query(`UPDATE users SET is_admin = TRUE WHERE id = $1`, [admin.id]);
    const [a, b, c] = [await player(), await player(), await player()];
    const minor = await createUser();

    clockAt(t.opens_at, HOUR);
    expect((await put(a, week, { asset_type: 'stock', symbol: S, direction: 'up', note: 'uygunsuz not' })).status).toBe(200);

    const post = (u: TestUser, text: string) => api().post(`/api/picks/weeks/${week}/comments`).set(u.auth).send({ text });
    const base = t.reveal_at.getTime() + MIN;
    clockAt(new Date(base));
    const c1 = await post(b, '  Bence bu hafta  \n\n\n\n yükseliş var  ');
    expect(c1.status).toBe(201);
    expect(c1.body.data).toMatchObject({ username: b.username, text: 'Bence bu hafta\n\n yükseliş var', is_me: true });

    const fast = await post(b, 'tekrar');
    expect(fast.status).toBe(429);
    expect(fast.body.code).toBe('RATE_LIMITED');
    expect(fast.body.retry_after).toBeGreaterThan(0);
    expect(fast.headers['retry-after']).toBeDefined();

    clockAt(new Date(base + 20_000));
    const c2 = await post(b, 'ikinci yorum');
    expect(c2.status).toBe(201);
    clockAt(new Date(base + 40_000));
    const c3 = await post(c, '<script>alert(1)</script>');
    expect(c3.status).toBe(201);
    expect(c3.body.data.text).toBe('<script>alert(1)</script>'); // düz metin; istemci kaçışlar
    expect((await post(minor, 'merhaba')).body.code).toBe('ADULT_CONFIRM_REQUIRED');
    expect((await post(c, '   ')).status).toBe(400);
    expect((await post(c, 'x'.repeat(501))).status).toBe(400);

    const all = await api().get(`/api/picks/weeks/${week}/comments`);
    expect(all.status).toBe(200);
    expect(all.body.data.items.map((x: any) => x.id)).toEqual([c3.body.data.id, c2.body.data.id, c1.body.data.id]);
    expect(all.body.data.items.every((x: any) => x.is_me === false)).toBe(true);
    const page1 = await api().get(`/api/picks/weeks/${week}/comments`).query({ limit: 2 });
    expect(page1.body.data).toMatchObject({ has_more: true });
    const page2 = await api().get(`/api/picks/weeks/${week}/comments`).query({ limit: 2, before: page1.body.data.items[1].id });
    expect(page2.body.data.items.map((x: any) => x.id)).toEqual([c1.body.data.id]);
    expect(page2.body.data.has_more).toBe(false);

    // Silme: yalnızca yazarı; yönetici herkesinkini
    expect((await api().delete(`/api/picks/comments/${c1.body.data.id}`).set(c.auth)).status).toBe(403);
    expect((await api().delete(`/api/picks/comments/${c1.body.data.id}`).set(b.auth)).status).toBe(200);
    expect((await api().delete(`/api/picks/comments/${c1.body.data.id}`).set(b.auth)).status).toBe(404);
    expect((await api().delete(`/api/admin/picks/comments/${c3.body.data.id}`).set(c.auth)).status).toBe(403);
    const adel = await api().delete(`/api/admin/picks/comments/${c3.body.data.id}`).set(admin.auth);
    expect(adel.status).toBe(200);
    expect(adel.body.data).toMatchObject({ id: c3.body.data.id, deleted: true });
    const audit1 = await pool.query(`SELECT * FROM admin_audit_log WHERE action = 'picks.comment_delete' AND target_id = $1`, [c3.body.data.id]);
    expect(audit1.rows).toHaveLength(1);
    expect(audit1.rows[0].admin_id).toBe(admin.id);

    const visible = await api().get(`/api/picks/weeks/${week}/comments`).set(b.auth);
    expect(visible.body.data.items.map((x: any) => [x.id, x.is_me])).toEqual([[c2.body.data.id, true]]);
    const weekView = await api().get(`/api/picks/weeks/${week}`);
    expect(weekView.body.data.comments_count).toBe(1);

    const adminComments = await api().get('/api/admin/picks/comments').query({ week_id: week }).set(admin.auth);
    expect(adminComments.status).toBe(200);
    expect(adminComments.body.data.total).toBe(3);
    expect(adminComments.body.data.items.filter((x: any) => x.deleted)).toHaveLength(2);
    expect((await api().get('/api/admin/picks/comments').set(a.auth)).status).toBe(403);

    // Not gizleme
    const pickId = (await pickRow(week, a.id)).id;
    const hide = await api().post(`/api/admin/picks/picks/${pickId}/hide-note`).set(admin.auth);
    expect(hide.status).toBe(200);
    const audit2 = await pool.query(`SELECT metadata FROM admin_audit_log WHERE action = 'picks.note_hide' AND target_id = $1`, [pickId]);
    expect(audit2.rows[0].metadata).toMatchObject({ week_id: week, note: 'uygunsuz not' });
    const afterHide = await api().get(`/api/picks/weeks/${week}`).set(b.auth);
    expect(afterHide.body.data.picks[0]).toMatchObject({ note: null, note_hidden: true });
    expect(JSON.stringify(afterHide.body)).not.toContain('uygunsuz not');
    expect((await api().post('/api/admin/picks/picks/00000000-0000-0000-0000-000000000000/hide-note').set(admin.auth)).status).toBe(404);

    const adminWeeks = await api().get('/api/admin/picks/weeks').set(admin.auth);
    expect(adminWeeks.status).toBe(200);
    expect(adminWeeks.body.data.items.find((x: any) => x.week_id === week)).toMatchObject({
      phase: 'revealed',
      participants: 1,
      notes_hidden: 1,
      comments: 1,
      comments_deleted: 2,
    });

    // Günlük sınır (İstanbul günü)
    await pool.query(
      `INSERT INTO weekly_pick_comments (week_id, user_id, text, created_at)
       SELECT $1, $2, 'dolgu ' || g, $3::timestamptz - (g || ' minutes')::interval FROM generate_series(1, 40) g`,
      [week, c.id, new Date(base + 60 * MIN).toISOString()]
    );
    clockAt(new Date(base + 2 * HOUR));
    const capped = await post(c, 'bir tane daha');
    expect(capped.status).toBe(429);
    expect(capped.body.code).toBe('COMMENT_DAILY_LIMIT');
    expect(capped.body.limit).toBe(40);
  });
});

describe('Haftalık Seçim: geliştirme saati', () => {
  it('yalnızca yerel geliştirmede; saat kayar, null ile sıfırlanır', async () => {
    const saved = process.env.NODE_ENV;
    try {
      const g = await api().get('/api/dev/picks/clock');
      expect(g.status).toBe(200);
      expect(g.body.data.overridden).toBe(false);

      expect((await api().post('/api/dev/picks/clock').type('form').send('now=x')).status).toBe(415);
      expect((await api().post('/api/dev/picks/clock').send({ now: 'bozuk' })).status).toBe(400);

      const set = await api().post('/api/dev/picks/clock').send({ now: '2031-06-01T10:00:00+03:00' });
      expect(set.status).toBe(200);
      expect(set.body.data.overridden).toBe(true);
      expect(Math.abs(Date.parse(set.body.data.now) - Date.parse('2031-06-01T07:00:00Z'))).toBeLessThan(5_000);
      expect(set.body.data.tick).toMatchObject({ revealed: expect.any(Number) });
      const cur = await api().get('/api/picks/current');
      expect(cur.body.data.active.week_id).toBe('2031-W23');

      const noRewind = await api().post('/api/dev/picks/clock').send({ now: '2031-06-02T10:00:00+03:00', rewind: false });
      expect(noRewind.body.data.rewound).toBeNull();
      expect((await api().post('/api/dev/picks/clock').send({ now: null, rewind: 'evet' })).status).toBe(400);

      // Gerçek saate dönüş: "gelecekte" damgalanmış adımlar geri alınır (seçimler kalır, sonuçlar silinir)
      const ledgerBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM game_ledger WHERE ref_type = 'weekly_pick' AND ref_id = '2031-W14'`)).rows[0].n;
      const reset = await api().post('/api/dev/picks/clock').send({ now: null });
      expect(reset.body.data.overridden).toBe(false);
      expect(Math.abs(Date.parse(reset.body.data.now) - Date.now())).toBeLessThan(5_000);
      expect(reset.body.data.rewound.weeks).toEqual(expect.arrayContaining(['2031-W14', '2031-W16', '2031-W20']));
      const w14 = await weekRow('2031-W14');
      expect([w14.revealed_notified_at, w14.entry_captured_at, w14.settled_at, w14.rewarded_at, w14.crowd_return_pct]).toEqual([null, null, null, null, null]);
      const p14 = await pool.query(`SELECT entry_price, exit_price, return_pct, rank, status, void_reason FROM weekly_picks WHERE week_id = '2031-W14'`);
      expect(p14.rows).toHaveLength(5);
      expect(p14.rows.every((r) => r.entry_price === null && r.exit_price === null && r.rank === null && r.status === 'active' && r.void_reason === null)).toBe(true);
      expect((await pool.query(`SELECT COUNT(*)::int AS n FROM game_ledger WHERE ref_type = 'weekly_pick' AND ref_id = '2031-W14'`)).rows[0].n).toBe(ledgerBefore);
      // Gerçek zamanlı (geçmiş) adımlara dokunulmaz: ikinci sıfırlama hiçbir şeyi geri almaz
      expect((await api().post('/api/dev/picks/clock').send({ now: null })).body.data.rewound.weeks).toEqual([]);

      process.env.NODE_ENV = 'production';
      expect((await api().get('/api/dev/picks/clock')).status).toBe(404);
      expect((await api().post('/api/dev/picks/clock').send({ now: null })).status).toBe(404);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});
