import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, app, confirmAdult, createUser as createBaseUser, pool, settle, TestUser } from './helpers';
import { clearAvailabilityCache, getInstrument, quoteAt } from '../src/services/arena/instruments';
import { ArenaService, DUEL_DRAW_EPSILON_PP, decideDuel, loadRound, roundPaths, tickAt } from '../src/services/arena/service';
import { openPrice, type Side } from '../src/services/arena/engine';
import { ArenaDuels, MM_BOT_AFTER_S, pairTickets, ratingRange, type MatchTicket } from '../src/services/arena/duels';
import { ArenaBot, botDecide, botHistoryAt, botPlan } from '../src/services/arena/bot';
import { resetReactionLimiter } from '../src/services/arena/social';
import { arenaEvents, type ArenaPositionClosedEvent, type ArenaRoundFinishedEvent, type ArenaRoundStartedEvent } from '../src/services/arena/events';
import { ensureBotUser } from '../src/services/arena/users';
import { ResponsiblePlay } from '../src/services/game/responsible';
import { ScenarioRepository } from '../src/services/scenarios/repository';
import { AppError } from '../src/utils/errors';

// Paylaşılan PGlite (test/globalSetup.ts). Zaman yolculuğu: turun starts_at/ends_at değerleri geriye kaydırılır.

/**
 * Sorumlu oyun kontrolü GERÇEK haliyle çalışır: test kullanıcıları 18+ onaylı oluşturulur ve
 * ResponsiblePlay.assertCanPlay üzerindeki casus (spy) yalnızca çağrıları kaydeder (asıl uygulamayı çağırır).
 * Reddetme senaryolarında casus ilgili testte geçersiz kılınır.
 */
async function createUser(opts?: Parameters<typeof createBaseUser>[0]): Promise<TestUser> {
  const u = await createBaseUser(opts);
  await confirmAdult(u.id);
  return u;
}

const HOUR = 3_600_000;
const ORIGIN = 'http://localhost:3000';

async function seedHourly(assetType: string, symbol: string, currency: string, base: number, amp: number) {
  const now = Date.now();
  const start = Math.floor(now / HOUR) * HOUR - 100 * HOUR;
  const times: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < 100; i++) {
    times.push(new Date(start + i * HOUR).toISOString());
    prices.push(Number((base * (1 + amp * Math.sin(i / 4) + amp * 0.6 * Math.cos(i / 1.7))).toPrecision(10)));
  }
  await pool.query(
    `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency)
     SELECT $1, $2, 'hour', x.bs, x.p, $3 FROM unnest($4::timestamptz[], $5::numeric[]) AS x(bs, p)
     ON CONFLICT DO NOTHING`,
    [assetType, symbol, currency, times, prices]
  );
}

async function advance(roundId: string, seconds: number) {
  await pool.query(
    `UPDATE arena_rounds SET starts_at = starts_at - $2 * INTERVAL '1 second', ends_at = ends_at - $2 * INTERVAL '1 second' WHERE id = $1`,
    [roundId, seconds]
  );
}

/** Tüm arama biletlerini kapat (eşleştirme işi globaldir; testler birbirini etkilemesin) */
const clearTickets = () => pool.query(`UPDATE arena_matchmaking SET status = 'cancelled' WHERE status = 'searching'`);

// --- Olay kayıtları
const started: ArenaRoundStartedEvent[] = [];
const finished: ArenaRoundFinishedEvent[] = [];
const closedEv: ArenaPositionClosedEvent[] = [];
const onStarted = (e: ArenaRoundStartedEvent) => started.push(e);
const onFinished = (e: ArenaRoundFinishedEvent) => finished.push(e);
const onClosed = (e: ArenaPositionClosedEvent) => closedEv.push(e);

let canPlay: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  await seedHourly('currency', 'EUR', 'TRY', 51.2, 0.004);
  await seedHourly('currency', 'USD', 'TRY', 43.9, 0.003);
  await seedHourly('crypto', 'BTC', 'USD', 118_000, 0.02);
  await seedHourly('commodity', 'GOLD', 'USD', 2650, 0.006);
  await seedHourly('commodity', 'BRENT_OIL', 'USD', 78, 0.01);
  clearAvailabilityCache();
  arenaEvents.on('round_started', onStarted);
  arenaEvents.on('round_finished', onFinished);
  arenaEvents.on('position_closed', onClosed);
});

afterAll(() => {
  arenaEvents.off('round_started', onStarted);
  arenaEvents.off('round_finished', onFinished);
  arenaEvents.off('position_closed', onClosed);
});

beforeEach(() => {
  // Sorumlu oyun modülü: gerçek uygulama çalışır, çağrılar kaydedilir
  canPlay = vi.spyOn(ResponsiblePlay, 'assertCanPlay');
  resetReactionLimiter();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createInvite(u: TestUser, body: Record<string, unknown> = { duration_s: 60 }) {
  const res = await api().post('/api/arena/duels').set(u.auth).send(body).expect(201);
  return res.body.data as { duel: any; code: string; invite_path: string };
}

/** Davet → kabul → (isteğe bağlı) başlat */
async function matchedDuel(a: TestUser, b: TestUser, duration = 60) {
  const inv = await createInvite(a, { duration_s: duration });
  const acc = await api().post(`/api/arena/duels/${inv.code}/accept`).set(b.auth).expect(200);
  return { code: inv.code, duelId: inv.duel.id as string, roundId: acc.body.data.round_id as string, startsAt: acc.body.data.starts_at as string };
}

// ===========================================================================
// Saf fonksiyonlar
// ===========================================================================

describe('Arena düello: saf kurallar', () => {
  it('beraberlik kuralı: |fark| < 0,01 yp → berabere (ikisi de 1.), değilse yüksek getiri kazanır', () => {
    const draw = decideDuel([
      { user_id: 'a', return_pct: 1.2345 },
      { user_id: 'b', return_pct: 1.2295 },
    ]);
    expect(draw).toMatchObject({ isDraw: true, winnerId: null });
    expect([...draw.ranks.values()]).toEqual([1, 1]);
    const exact = decideDuel([
      { user_id: 'a', return_pct: 0 },
      { user_id: 'b', return_pct: 0 },
    ]);
    expect(exact.isDraw).toBe(true);
    const win = decideDuel([
      { user_id: 'a', return_pct: -0.5 },
      { user_id: 'b', return_pct: -0.5 + DUEL_DRAW_EPSILON_PP },
    ]);
    expect(win).toMatchObject({ isDraw: false, winnerId: 'b' });
    expect(win.ranks.get('b')).toBe(1);
    expect(win.ranks.get('a')).toBe(2);
    expect(decideDuel([{ user_id: 'a', return_pct: 3 }, { user_id: 'b', return_pct: 2.5 }]).winnerId).toBe('a');
  });

  it('eşleştirme: ±150 aralık, 5 sn\'de bir +50 genişler, aynı süre şart, 15 sn sonra bot', () => {
    expect(ratingRange(0)).toBe(150);
    expect(ratingRange(4.9)).toBe(150);
    expect(ratingRange(5)).toBe(200);
    expect(ratingRange(12)).toBe(250);
    const t = (ticket: string, rating: number, waited: number, duration = 60): MatchTicket => ({
      ticket,
      user_id: `u-${ticket}`,
      duration_s: duration,
      rating,
      waited_s: waited,
    });
    // 200 fark: ilk anda eşleşmez
    expect(pairTickets([t('a', 1000, 1), t('b', 1200, 0)])).toEqual({ pairs: [], bots: [] });
    // en uzun bekleyen 5 sn sonra (±200) eşleşir
    const widened = pairTickets([t('a', 1000, 6), t('b', 1200, 0)]);
    expect(widened.pairs.map(([x, y]) => [x.ticket, y.ticket])).toEqual([['a', 'b']]);
    // en yakın puan seçilir
    const closest = pairTickets([t('a', 1000, 3), t('b', 1140, 1), t('c', 1020, 0)]);
    expect(closest.pairs.map(([x, y]) => [x.ticket, y.ticket])).toEqual([['a', 'c']]);
    // farklı süre eşleşmez; 15 sn bekleyen bota gider
    const bots = pairTickets([t('a', 1000, MM_BOT_AFTER_S, 60), t('b', 1000, 2, 180)]);
    expect(bots.pairs).toEqual([]);
    expect(bots.bots.map((x) => x.ticket)).toEqual(['a']);
    // 15 sn bekleyen ama insan bulan → insanla eşleşir
    const human = pairTickets([t('a', 1000, 20), t('b', 1100, 0)]);
    expect(human.pairs).toHaveLength(1);
    expect(human.bots).toEqual([]);
  });

  it('bot planı: 2–6 işlem, tohumlu ve deterministik; kararlar gelecekteki tick\'lerden bağımsız', () => {
    for (const seed of [1, 42, 123456789, 987654321012]) {
      const p = botPlan(seed, 180);
      expect(p.trades.length).toBeGreaterThanOrEqual(2);
      expect(p.trades.length).toBeLessThanOrEqual(6);
      expect(botPlan(seed, 180)).toEqual(p);
      for (const tr of p.trades) {
        expect(tr.at).toBeGreaterThanOrEqual(0);
        expect(tr.at).toBeLessThan(180);
        expect(tr.fraction).toBeGreaterThanOrEqual(0.1);
        expect(tr.fraction).toBeLessThanOrEqual(0.4);
      }
    }
    // İki yol: tick 30'a kadar aynı, sonrası tamamen farklı
    const base = Array.from({ length: 61 }, (_, i) => 100 * (1 + 0.002 * Math.sin(i / 3)));
    const alt = base.map((v, i) => (i > 30 ? v * (i % 2 ? 1.5 : 0.5) : v));
    const gold = Array.from({ length: 61 }, (_, i) => 2650 * (1 + 0.001 * Math.cos(i / 5)));
    const goldAlt = gold.map((v, i) => (i > 30 ? v * 3 : v));
    const pa = new Map([
      ['BRENT', base],
      ['XAUUSD', gold],
    ]);
    const pb = new Map([
      ['BRENT', alt],
      ['XAUUSD', goldAlt],
    ]);
    const ha = botHistoryAt(pa, ['BRENT', 'XAUUSD'], 30);
    const hb = botHistoryAt(pb, ['BRENT', 'XAUUSD'], 30);
    expect(ha.get('BRENT')).toHaveLength(31);
    expect(ha).toEqual(hb);
    for (const trade of botPlan(77, 60).trades) {
      const da = botDecide(trade, ha, 10_000);
      const db = botDecide(trade, hb, 10_000);
      expect(da).toEqual(db);
      expect(da).not.toBeNull();
      expect(da!.amount).toBeLessThanOrEqual(10_000 * 0.4 + 0.01);
      expect(da!.amount).toBeGreaterThanOrEqual(10_000 * 0.1 - 0.01);
      const q = quoteAt(getInstrument(da!.instrument)!, ha.get(da!.instrument)!.at(-1)!);
      if (da!.side === 'long') {
        expect(da!.stop_loss).toBeLessThan(q.bid);
        expect(da!.take_profit).toBeGreaterThan(q.ask);
      } else {
        expect(da!.stop_loss).toBeGreaterThan(q.ask);
        expect(da!.take_profit).toBeLessThan(q.bid);
      }
    }
    // Nakit yetersizse işlem yok; nakdi asla aşmaz
    expect(botDecide(botPlan(77, 60).trades[0], ha, 20)).toBeNull();
    const small = botDecide({ ...botPlan(77, 60).trades[0], fraction: 0.4 }, ha, 100);
    expect(small!.amount).toBeLessThanOrEqual(100);
  });
});

// ===========================================================================
// Davet / kabul / iptal / süre dolumu / rövanş
// ===========================================================================

describe('Arena düello: davet akışı', () => {
  it('davet → kod ile görüntüle → kabul (bildirim, olay, 5 sn geri sayım) → tur durumu', async () => {
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const inv = await createInvite(a, { duration_s: 180, instruments: ['BTCUSD', 'XAUUSD'] });
    expect(inv.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(inv.invite_path).toBe(`/oyun/duello/${inv.code}`);
    expect(inv.duel).toMatchObject({
      status: 'waiting',
      source: 'invite',
      creator: { username: a.username },
      opponent: null,
      duration_s: 180,
      instruments: ['BTCUSD', 'XAUUSD'],
      round_id: null,
      starts_at: null,
      viewer_role: 'creator',
    });
    expect(new Date(inv.duel.expires_at).getTime() - Date.now()).toBeGreaterThan(23.9 * HOUR);

    await api().post('/api/arena/duels').set(a.auth).send({ duration_s: 120 }).expect(400);
    const view = (await api().get(`/api/arena/duels/${inv.code.toLowerCase()}`).set(b.auth).expect(200)).body.data;
    expect(view).toMatchObject({ id: inv.duel.id, status: 'waiting', viewer_role: null });
    await api().get('/api/arena/duels/ZZZZZZZZ').set(b.auth).expect(404);
    await api().get('/api/arena/duels/abc').set(b.auth).expect(400);
    await api().get(`/api/arena/duels/${inv.code}`).expect(401);

    const self = await api().post(`/api/arena/duels/${inv.code}/accept`).set(a.auth).expect(409);
    expect(self.body.code).toBe('ARENA_DUEL_SELF');

    const t0 = Date.now();
    const acc = await api().post(`/api/arena/duels/${inv.code}/accept`).set(b.auth).expect(200);
    const { round_id, starts_at } = acc.body.data;
    expect(round_id).toMatch(/^[0-9a-f-]{36}$/);
    const delay = new Date(starts_at).getTime() - t0;
    expect(delay).toBeGreaterThan(3500);
    expect(delay).toBeLessThan(6500);
    expect(canPlay).toHaveBeenCalledWith(b.id);
    // İdempotent tekrar kabul; üçüncü kişi kabul edemez
    expect((await api().post(`/api/arena/duels/${inv.code}/accept`).set(b.auth).expect(200)).body.data.round_id).toBe(round_id);
    expect((await api().post(`/api/arena/duels/${inv.code}/accept`).set(c.auth).expect(409)).body.code).toBe('ARENA_DUEL_CLOSED');

    const after = (await api().get(`/api/arena/duels/${inv.code}`).set(a.auth).expect(200)).body.data;
    expect(after).toMatchObject({ status: 'matched', round_id, starts_at, opponent: { username: b.username, is_bot: false } });

    const note = await pool.query(`SELECT title, link, category FROM notifications WHERE user_id = $1 AND type = 'arena.duel_accepted'`, [a.id]);
    expect(note.rows[0]).toMatchObject({ title: `${b.username} düello davetini kabul etti`, link: `/oyun/duello/${inv.code}`, category: 'competition' });

    const ev = started.find((e) => e.round_id === round_id)!;
    expect(ev.kind).toBe('duel');
    expect([...ev.user_ids].sort()).toEqual([a.id, b.id].sort());

    // Tur durumu: iki taraf görür, üçüncü kişi göremez
    const st = (await api().get(`/api/arena/rounds/${round_id}`).set(a.auth).expect(200)).body.data;
    expect(st.round).toMatchObject({ kind: 'duel', status: 'scheduled', duration_s: 180 });
    expect(st.round.instruments.map((i: any) => i.code)).toEqual(['BTCUSD', 'XAUUSD']);
    expect(st.duel).toMatchObject({ id: inv.duel.id, code: inv.code, opponent: { username: b.username, is_bot: false }, opponent_equity: 10000, opponent_return_pct: 0 });
    expect(st.me.joined).toBe(true);
    await api().get(`/api/arena/rounds/${round_id}`).set(c.auth).expect(404);
    await api().post(`/api/arena/rounds/${round_id}/positions`).set(c.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 100 }).expect(404);
  });

  it('iptal (yalnızca davet eden, bekleyen) ve 24 saat süre dolumu (iş + tembel)', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const inv = await createInvite(a);
    await api().post(`/api/arena/duels/${inv.duel.id}/cancel`).set(b.auth).expect(404);
    const c1 = await api().post(`/api/arena/duels/${inv.duel.id}/cancel`).set(a.auth).expect(200);
    expect(c1.body.data.status).toBe('cancelled');
    expect((await api().post(`/api/arena/duels/${inv.duel.id}/cancel`).set(a.auth).expect(409)).body.code).toBe('ARENA_DUEL_NOT_CANCELLABLE');
    expect((await api().post(`/api/arena/duels/${inv.code}/accept`).set(b.auth).expect(409)).body.code).toBe('ARENA_DUEL_CLOSED');

    const inv2 = await createInvite(a);
    const inv3 = await createInvite(a);
    await pool.query(`UPDATE arena_duels SET expires_at = now() - INTERVAL '1 minute' WHERE id = ANY($1::uuid[])`, [[inv2.duel.id, inv3.duel.id]]);
    // Tembel: görüntülerken 'expired'
    expect((await api().get(`/api/arena/duels/${inv2.code}`).set(b.auth).expect(200)).body.data.status).toBe('expired');
    const job = await ArenaDuels.duelsJob();
    expect(job.expired).toBeGreaterThanOrEqual(1);
    const rows = await pool.query(`SELECT status FROM arena_duels WHERE id = ANY($1::uuid[])`, [[inv2.duel.id, inv3.duel.id]]);
    expect(rows.rows.map((r: any) => r.status)).toEqual(['expired', 'expired']);
    expect((await api().post(`/api/arena/duels/${inv3.code}/accept`).set(b.auth).expect(410)).body.code).toBe('ARENA_DUEL_EXPIRED');
    await api().post(`/api/arena/duels/${inv3.duel.id}/cancel`).set(a.auth).expect(409);
  });

  it('açık davet sınırı (5)', async () => {
    const a = await createUser();
    for (let i = 0; i < 5; i++) await createInvite(a);
    expect((await api().post('/api/arena/duels').set(a.auth).send({ duration_s: 60 }).expect(429)).body.code).toBe('ARENA_DUEL_LIMIT');
  });

  it('oyun → kapanış: kazanan / sıra / olaylar (duel_id), geçmiş + rekor, rövanş (bildirim) ve karşılıklı rövanş', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const d = await matchedDuel(a, b, 60);
    // Başlamadan işlem yok
    expect((await api().post(`/api/arena/rounds/${d.roundId}/positions`).set(a.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 1000 }).expect(409)).body.code).toBe(
      'ARENA_NOT_STARTED'
    );
    await advance(d.roundId, 5 + 5);
    await ArenaDuels.duelsJob();
    expect((await api().get(`/api/arena/duels/${d.code}`).set(a.auth)).body.data.status).toBe('running');
    const pa = await api().post(`/api/arena/rounds/${d.roundId}/positions`).set(a.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 5000 }).expect(200);
    await api().post(`/api/arena/rounds/${d.roundId}/positions`).set(b.auth).send({ instrument: 'XAUUSD', side: 'short', amount: 3000 }).expect(200);
    await advance(d.roundId, 10);
    // Elle kapanış → position_closed olayı
    await api().post(`/api/arena/rounds/${d.roundId}/positions/${pa.body.data.position.id}/close`).set(a.auth).expect(200);
    const pc = closedEv.find((e) => e.round_id === d.roundId && e.user_id === a.id)!;
    expect(pc.position).toMatchObject({ instrument: 'BTCUSD', side: 'long', amount: 5000, close_reason: 'manual', stop_loss: null, take_profit: null });
    expect(pc.position.opened_tick).toBeGreaterThanOrEqual(5);
    expect(pc.position.opened_tick).toBeLessThanOrEqual(6);
    expect(pc.position.closed_tick - pc.position.opened_tick).toBeGreaterThanOrEqual(10);
    expect(pc.position.closed_tick).toBeLessThanOrEqual(17);
    expect(typeof pc.position.pnl).toBe('number');

    // Rakip özeti: b, a'nın kapalı pozisyon sonrası özsermayesini görür
    const sb = (await api().get(`/api/arena/rounds/${d.roundId}`).set(b.auth).expect(200)).body.data;
    const sa = (await api().get(`/api/arena/rounds/${d.roundId}`).set(a.auth).expect(200)).body.data;
    expect(sb.duel.opponent_equity).toBeCloseTo(sa.me.equity, 1);
    expect(sb.duel.opponent_return_pct).toBeCloseTo(sa.me.return_pct, 2);

    await advance(d.roundId, 60);
    expect(await ArenaService.finalizeRound(d.roundId)).toBe(true);
    const entries = await pool.query(`SELECT user_id, return_pct::float AS ret, rank, is_bot FROM arena_entries WHERE round_id = $1`, [d.roundId]);
    const outcome = decideDuel(entries.rows.map((r: any) => ({ user_id: r.user_id, return_pct: r.ret })));
    const duel = await pool.query(`SELECT status, winner_id, is_draw FROM arena_duels WHERE id = $1`, [d.duelId]);
    expect(duel.rows[0]).toMatchObject({ status: 'finished', winner_id: outcome.winnerId, is_draw: outcome.isDraw });
    for (const r of entries.rows) expect(r.rank).toBe(outcome.ranks.get(r.user_id));

    const ev = finished.find((e) => e.round_id === d.roundId)!;
    expect(ev).toMatchObject({ kind: 'duel', duel_id: d.duelId });
    expect(ev.challenge_id).toBeUndefined();
    expect(ev.entries).toHaveLength(2);
    for (const e of ev.entries) {
      expect(e.is_bot).toBeUndefined();
      expect(e.rank).toBe(outcome.ranks.get(e.user_id));
      expect(e.trades_count).toBe(1);
      expect(typeof e.equity_final).toBe('number');
    }

    const fin = (await api().get(`/api/arena/rounds/${d.roundId}`).set(a.auth).expect(200)).body.data;
    expect(fin.duel.result).toBe(outcome.isDraw ? 'draw' : outcome.winnerId === a.id ? 'win' : 'loss');

    const mine = (await api().get('/api/arena/duels/mine').set(a.auth).expect(200)).body.data;
    expect(mine.total).toBe(1);
    expect(mine.items[0]).toMatchObject({ id: d.duelId, opponent: { username: b.username, is_bot: false }, duration_s: 60, round_id: d.roundId, result: fin.duel.result });
    expect(typeof mine.items[0].my_return_pct).toBe('number');
    expect(typeof mine.items[0].opponent_return_pct).toBe('number');
    const exp = { wins: fin.duel.result === 'win' ? 1 : 0, losses: fin.duel.result === 'loss' ? 1 : 0, draws: fin.duel.result === 'draw' ? 1 : 0 };
    expect(mine.record).toEqual(exp);

    // Rövanş: a → b'ye yeni davet (rakip ayrılmış) + bildirim
    const rm = await api().post(`/api/arena/duels/${d.duelId}/rematch`).set(a.auth).expect(201);
    expect(rm.body.data.invite_path).toBe(`/oyun/duello/${rm.body.data.code}`);
    expect(rm.body.data.duel).toMatchObject({ status: 'waiting', rematch_of: d.duelId, opponent: { username: b.username }, duration_s: 60 });
    const n = await pool.query(`SELECT title, link FROM notifications WHERE user_id = $1 AND type = 'arena.duel_invite'`, [b.id]);
    expect(n.rows[0]).toMatchObject({ title: `${a.username} seni rövanşa çağırıyor`, link: `/oyun/duello/${rm.body.data.code}` });
    // Tekrar rövanş isteği aynı daveti döndürür; başkası kabul edemez
    expect((await api().post(`/api/arena/duels/${d.duelId}/rematch`).set(a.auth).expect(200)).body.data.duel.id).toBe(rm.body.data.duel.id);
    const stranger = await createUser();
    expect((await api().post(`/api/arena/duels/${rm.body.data.code}/accept`).set(stranger.auth).expect(403)).body.code).toBe('ARENA_DUEL_NOT_INVITED');
    await api().post(`/api/arena/duels/${d.duelId}/rematch`).set(stranger.auth).expect(404);
    // b de "rövanş" der → davet kabul edilir, tur başlar
    const both = await api().post(`/api/arena/duels/${d.duelId}/rematch`).set(b.auth).expect(200);
    expect(both.body.data.duel).toMatchObject({ id: rm.body.data.duel.id, status: 'matched', viewer_role: 'opponent' });
    expect(both.body.data.duel.round_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('beraberlik: iki taraf da işlem yapmazsa getiri 0 → berabere, kazanan yok, iki taraf 1.', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const d = await matchedDuel(a, b, 60);
    await advance(d.roundId, 70);
    await ArenaService.finalizeJob();
    const duel = await pool.query(`SELECT status, winner_id, is_draw FROM arena_duels WHERE id = $1`, [d.duelId]);
    expect(duel.rows[0]).toEqual({ status: 'finished', winner_id: null, is_draw: true });
    const ev = finished.find((e) => e.round_id === d.roundId)!;
    expect(ev.entries.map((e) => e.rank)).toEqual([1, 1]);
    const mine = (await api().get('/api/arena/duels/mine').set(b.auth).expect(200)).body.data;
    expect(mine.record).toEqual({ wins: 0, losses: 0, draws: 1 });
    expect(mine.items[0].result).toBe('draw');
  });
});

// ===========================================================================
// Eşleştirme + bot
// ===========================================================================

describe('Arena eşleştirme + antrenman botu', () => {
  beforeEach(async () => {
    await clearTickets();
  });

  it('iki oyuncu aynı süre → eşleşir; bilet durumu rakip ve turu döner', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const ta = (await api().post('/api/arena/matchmaking').set(a.auth).send({ duration_s: 180 }).expect(200)).body.data;
    expect(ta).toMatchObject({ status: 'searching' });
    expect(canPlay).toHaveBeenCalledWith(a.id);
    // Aynı istek idempotent
    expect((await api().post('/api/arena/matchmaking').set(a.auth).send({ duration_s: 180 }).expect(200)).body.data.ticket).toBe(ta.ticket);
    await api().post('/api/arena/matchmaking').set(a.auth).send({ duration_s: 90 }).expect(400);
    const tb = (await api().post('/api/arena/matchmaking').set(b.auth).send({ duration_s: 180 }).expect(200)).body.data;
    const s0 = (await api().get(`/api/arena/matchmaking/${ta.ticket}`).set(a.auth).expect(200)).body.data;
    expect(s0).toMatchObject({ status: 'searching', duration_s: 180 });
    expect(s0.searching_for_s).toBeGreaterThanOrEqual(0);
    await api().get(`/api/arena/matchmaking/${ta.ticket}`).set(b.auth).expect(404);

    const job = await ArenaDuels.matchmakingJob();
    expect(job.pairs).toBe(1);
    const ma = (await api().get(`/api/arena/matchmaking/${ta.ticket}`).set(a.auth).expect(200)).body.data;
    const mb = (await api().get(`/api/arena/matchmaking/${tb.ticket}`).set(b.auth).expect(200)).body.data;
    expect(ma.status).toBe('matched');
    expect(ma.duel_id).toBe(mb.duel_id);
    expect(ma.round_id).toBe(mb.round_id);
    expect(ma.opponent).toMatchObject({ username: b.username, is_bot: false });
    expect(typeof ma.opponent.rating).toBe('number');
    expect(mb.opponent.username).toBe(a.username);
    expect(new Date(ma.starts_at).getTime()).toBeGreaterThan(Date.now() + 3000);
    const duel = await pool.query(`SELECT source, status, duration_s FROM arena_duels WHERE id = $1`, [ma.duel_id]);
    expect(duel.rows[0]).toEqual({ source: 'matchmaking', status: 'matched', duration_s: 180 });
    // Eşleşmiş bilet iptal edilemez; devam eden düelloda yeni arama yok
    expect((await api().delete(`/api/arena/matchmaking/${ta.ticket}`).set(a.auth).expect(409)).body.code).toBe('ARENA_ALREADY_MATCHED');
    const again = await api().post('/api/arena/matchmaking').set(a.auth).send({ duration_s: 60 }).expect(409);
    expect(again.body).toMatchObject({ code: 'ARENA_DUEL_ACTIVE', duel_id: ma.duel_id, round_id: ma.round_id });
  });

  it('puan aralığı + genişleme (arena_rating varsa) ve iptal / bayat bilet', async () => {
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const ta = (await api().post('/api/arena/matchmaking').set(a.auth).send({ duration_s: 60 }).expect(200)).body.data;
    const tb = (await api().post('/api/arena/matchmaking').set(b.auth).send({ duration_s: 60 }).expect(200)).body.data;
    // Bilet puanı katılımda users.arena_rating'ten (yoksa 1000) okunur; burada aralık testi için ayarlanır
    await pool.query(`UPDATE arena_matchmaking SET rating = 1000 WHERE ticket = $1`, [ta.ticket]);
    await pool.query(`UPDATE arena_matchmaking SET rating = 1220 WHERE ticket = $1`, [tb.ticket]);
    expect((await ArenaDuels.matchmakingJob()).pairs).toBe(0);
    // a 10 sn bekledi → ±250
    await pool.query(`UPDATE arena_matchmaking SET created_at = now() - INTERVAL '10 seconds' WHERE ticket = $1`, [ta.ticket]);
    expect((await ArenaDuels.matchmakingJob()).pairs).toBe(1);

    const tc = (await api().post('/api/arena/matchmaking').set(c.auth).send({ duration_s: 300 }).expect(200)).body.data;
    expect((await api().delete(`/api/arena/matchmaking/${tc.ticket}`).set(c.auth).expect(200)).body.data).toEqual({ ticket: tc.ticket, status: 'cancelled' });
    expect((await api().get(`/api/arena/matchmaking/${tc.ticket}`).set(c.auth).expect(200)).body.data.status).toBe('cancelled');
    // Yeni arama yeni bilet; 30 sn sorgulanmazsa bayatlar
    const tc2 = (await api().post('/api/arena/matchmaking').set(c.auth).send({ duration_s: 300 }).expect(200)).body.data;
    expect(tc2.ticket).not.toBe(tc.ticket);
    await api().get(`/api/arena/matchmaking/${tc.ticket}`).set(c.auth).expect(404);
    await pool.query(`UPDATE arena_matchmaking SET last_seen_at = now() - INTERVAL '40 seconds' WHERE ticket = $1`, [tc2.ticket]);
    expect((await ArenaDuels.matchmakingJob()).expired).toBe(1);
    expect((await api().get(`/api/arena/matchmaking/${tc2.ticket}`).set(c.auth).expect(200)).body.data.status).toBe('expired');
  });

  it('15 sn içinde rakip yoksa antrenman botu; bot yalnızca geçmiş tick\'lerle, nakit sınırında işlem yapar; olaylar is_bot taşır', async () => {
    const u = await createUser();
    const t = (await api().post('/api/arena/matchmaking').set(u.auth).send({ duration_s: 60 }).expect(200)).body.data;
    expect((await ArenaDuels.matchmakingJob()).bots).toBe(0);
    await pool.query(`UPDATE arena_matchmaking SET created_at = now() - INTERVAL '16 seconds' WHERE ticket = $1`, [t.ticket]);
    expect((await ArenaDuels.matchmakingJob()).bots).toBe(1);
    const m = (await api().get(`/api/arena/matchmaking/${t.ticket}`).set(u.auth).expect(200)).body.data;
    expect(m.status).toBe('matched');
    expect(m.opponent).toMatchObject({ username: 'antrenman_botu', is_bot: true });
    const botId = await ensureBotUser();
    const ent = await pool.query(`SELECT user_id, is_bot FROM arena_entries WHERE round_id = $1 ORDER BY is_bot`, [m.round_id]);
    expect(ent.rows).toEqual([
      { user_id: u.id, is_bot: false },
      { user_id: botId, is_bot: true },
    ]);
    const st = (await api().get(`/api/arena/rounds/${m.round_id}`).set(u.auth).expect(200)).body.data;
    expect(st.duel.opponent).toMatchObject({ username: 'antrenman_botu', is_bot: true });
    // round_started: bot user_ids'e girmez
    expect(started.find((e) => e.round_id === m.round_id)!.user_ids).toEqual([u.id]);

    // Bot adımları: tur saniye saniye ilerletilir, her adımda bot yalnızca o ana kadarki tick'leri kullanır
    const round = (await loadRound(m.round_id))!;
    const plan = botPlan(round.seed, 60);
    const paths = roundPaths(round)!;
    await advance(m.round_id, 5); // tick 0
    let elapsed = 0;
    const seen: { tick: number; positions: number }[] = [];
    while (elapsed < 58) {
      const step = 2 + (elapsed % 3);
      await advance(m.round_id, step);
      elapsed += step;
      const r = (await loadRound(m.round_id))!;
      const tickNow = tickAt(r);
      await ArenaBot.step(m.round_id, botId);
      const pos = await pool.query(`SELECT entry_tick, amount::float AS amount FROM arena_positions WHERE round_id = $1 AND user_id = $2`, [m.round_id, botId]);
      for (const p of pos.rows) expect(p.entry_tick).toBeLessThanOrEqual(tickNow + 1);
      const e = await pool.query(`SELECT cash::float AS cash FROM arena_entries WHERE round_id = $1 AND user_id = $2`, [m.round_id, botId]);
      expect(e.rows[0].cash).toBeGreaterThanOrEqual(0);
      seen.push({ tick: tickNow, positions: pos.rows.length });
    }
    const all = await pool.query(
      `SELECT instrument, side, entry_tick, entry_price::float AS entry_price, amount::float AS amount, stop_loss, take_profit
         FROM arena_positions WHERE round_id = $1 AND user_id = $2 ORDER BY opened_at`,
      [m.round_id, botId]
    );
    expect(all.rows.length).toBeGreaterThanOrEqual(1);
    expect(all.rows.length).toBeLessThanOrEqual(plan.trades.length);
    for (const [i, p] of all.rows.entries()) {
      expect(p.entry_tick).toBeGreaterThanOrEqual(plan.trades[i].at);
      expect(p.amount).toBeLessThanOrEqual(11_000 * 0.4);
      expect(p.amount).toBeGreaterThanOrEqual(10);
      expect(p.stop_loss).not.toBeNull();
      expect(p.take_profit).not.toBeNull();
      // Giriş fiyatı, giriş tick'indeki kotasyon (gelecekteki bir fiyat değil)
      const q = quoteAt(getInstrument(p.instrument)!, paths.get(p.instrument)![p.entry_tick]);
      expect(p.entry_price).toBeCloseTo(openPrice(p.side as Side, q), 6);
    }
    expect(seen.length).toBeGreaterThan(10);

    await advance(m.round_id, 10);
    await ArenaService.finalizeJob();
    const ev = finished.find((e) => e.round_id === m.round_id)!;
    expect(ev.kind).toBe('duel');
    expect(ev.duel_id).toBe(m.duel_id);
    const botEntry = ev.entries.find((e) => e.user_id === botId)!;
    expect(botEntry.is_bot).toBe(true);
    expect(ev.entries.find((e) => e.user_id === u.id)!.is_bot).toBeUndefined();
    // Bot pozisyonları için position_closed yayınlanmaz
    expect(closedEv.some((e) => e.user_id === botId)).toBe(false);
    // Bot liderlik / sezon sorgularında yok
    const lb = (await api().get('/api/leaderboard').expect(200)).body;
    expect(JSON.stringify(lb)).not.toContain('antrenman_botu');

    // Bota rövanş → hemen yeni bot düellosu
    const rm = await api().post(`/api/arena/duels/${m.duel_id}/rematch`).set(u.auth).expect(201);
    expect(rm.body.data.duel).toMatchObject({ status: 'matched', opponent: { username: 'antrenman_botu', is_bot: true }, rematch_of: m.duel_id });
  });
});

// ===========================================================================
// Senaryo turları
// ===========================================================================

describe('Arena senaryo turları', () => {
  const SCN = '11111111-2222-4333-8444-555555555555';
  const t0 = Date.UTC(2020, 2, 9, 0, 0, 0) / 1000;
  const mk = (base: number, drift: number, n = 24) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 3600, p: base * (1 + drift * i) }));
  const windowData = {
    window: {
      BRENT: { from: new Date(t0 * 1000).toISOString(), to: new Date((t0 + 23 * 3600) * 1000).toISOString(), points: mk(45, -0.01) },
      XAUUSD: { from: new Date(t0 * 1000).toISOString(), to: new Date((t0 + 23 * 3600) * 1000).toISOString(), points: mk(1670, 0.001) },
      NOTREAL: { from: 'x', to: 'y', points: mk(1, 0) },
    },
    meta: {
      id: SCN,
      title: '2020 Petrol Çöküşü',
      briefing: 'Petrol fiyat savaşı başlıyor.',
      debrief: 'Brent bir günde %25 düştü.',
      synthetic: false,
      slug: 'petrol-2020',
      difficulty: 'zor' as const,
      published: true,
      instruments: [],
    },
  };

  it('pencere ScenarioRepository\'den gelir; brifing / değerlendirme; solo ile aynı sınır', async () => {
    const load = vi.spyOn(ScenarioRepository, 'loadScenarioWindow').mockImplementation(async (id: string) => (id === SCN ? (windowData as any) : null));
    // arena_rounds.scenario_id → scenarios(id) yabancı anahtarı (senaryo migration'ı) için satır
    const hasTable = await pool.query(`SELECT to_regclass('scenarios') AS t`);
    if (hasTable.rows[0].t) {
      await pool.query(
        `INSERT INTO scenarios (id, slug, title, window_from, window_to, published) VALUES ($1, 'arena-test-petrol', 'Test', now() - INTERVAL '2 days', now() - INTERVAL '1 day', TRUE)
         ON CONFLICT DO NOTHING`,
        [SCN]
      );
    }
    const u = await createUser();
    await api().post('/api/arena/rounds').set(u.auth).send({ scenario_id: 'nope-missing', duration_s: 60 }).expect(404);
    const res = await api().post('/api/arena/rounds').set(u.auth).send({ scenario_id: SCN, duration_s: 60 }).expect(201);
    expect(load).toHaveBeenCalledWith(SCN);
    expect(canPlay).toHaveBeenCalledWith(u.id);
    const s = res.body.data;
    expect(s.round).toMatchObject({ kind: 'scenario', duration_s: 60, status: 'scheduled' });
    expect(s.round.instruments.map((i: any) => i.code)).toEqual(['XAUUSD', 'BRENT']);
    expect(s.scenario).toEqual({ id: SCN, title: '2020 Petrol Çöküşü', briefing: 'Petrol fiyat savaşı başlıyor.', synthetic: false });
    // tick 0 orta fiyatı = senaryonun ilk noktası
    expect(s.quotes.BRENT.mid).toBeCloseTo(45, 2);
    expect(s.quotes.XAUUSD.mid).toBeCloseTo(1670, 2);
    expect(started.find((e) => e.round_id === s.round.id)).toMatchObject({ kind: 'scenario', user_ids: [u.id] });

    // Tek aktif tur kuralı solo + senaryo birlikte
    expect((await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60 }).expect(409)).body.code).toBe('ARENA_ROUND_ACTIVE');
    expect((await api().get('/api/arena/rounds/active').set(u.auth).expect(200)).body.data.round.id).toBe(s.round.id);
    const other = await createUser();
    await api().get(`/api/arena/rounds/${s.round.id}`).set(other.auth).expect(404);

    await advance(s.round.id, 3 + 10);
    await api().post(`/api/arena/rounds/${s.round.id}/positions`).set(u.auth).send({ instrument: 'BRENT', side: 'short', amount: 2000 }).expect(200);
    await advance(s.round.id, 60);
    await ArenaService.finalizeJob();
    const fin = (await api().get(`/api/arena/rounds/${s.round.id}`).set(u.auth).expect(200)).body.data;
    expect(fin.round.status).toBe('finished');
    expect(fin.round.reveal).toMatchObject({ from: windowData.window.BRENT.from, debrief: 'Brent bir günde %25 düştü.' });
    // Son tick fiyatı = senaryonun son noktası (kısa → kâr)
    expect(fin.me.return_pct).toBeGreaterThan(0);
    const ev = finished.find((e) => e.round_id === s.round.id)!;
    expect(ev).toMatchObject({ kind: 'scenario', scenario_id: SCN });
    expect(ev.entries[0]).toMatchObject({ user_id: u.id, rank: null, trades_count: 1 });
    const row = await pool.query('SELECT kind, scenario_id FROM arena_rounds WHERE id = $1', [s.round.id]);
    expect(row.rows[0]).toEqual({ kind: 'scenario', scenario_id: SCN });
  });
});

// ===========================================================================
// Sorumlu oyun
// ===========================================================================

describe('Arena: sorumlu oyun kontrolü', () => {
  it('gerçek modül (mock yok): 18+ onayı olmadan 403 ADULT_CONFIRM_REQUIRED; onaydan sonra tur açılır', async () => {
    const u = await createBaseUser(); // 18+ onayı yok
    const denied = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60 }).expect(403);
    expect(denied.body.code).toBe('ADULT_CONFIRM_REQUIRED');
    await ResponsiblePlay.confirmAdult(u.id);
    const ok = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60 }).expect(201);
    expect(ok.body.data.round.kind).toBe('solo');
    await clearTickets();
    expect((await api().post('/api/arena/matchmaking').set(u.auth).send({ duration_s: 60 }).expect(200)).body.data.status).toBe('searching');
    await clearTickets();
  });

  it('solo / eşleştirme / düello kabulü / meydan okumaya katılma öncesi çağrılır; hata ve ek alanlar yanıta geçer', async () => {
    const { GameError } = await import('../src/services/game/common');
    const u = await createUser();
    canPlay.mockRejectedValue(new GameError(403, 'Moladasın', 'ARENA_BREAK', { break_until: '2030-01-01T00:00:00.000Z' }));
    const solo = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60 }).expect(403);
    expect(solo.body).toMatchObject({ code: 'ARENA_BREAK', break_until: '2030-01-01T00:00:00.000Z' });
    await clearTickets();
    expect((await api().post('/api/arena/matchmaking').set(u.auth).send({ duration_s: 60 }).expect(403)).body.code).toBe('ARENA_BREAK');

    canPlay.mockResolvedValue(undefined);
    const creator = await createUser();
    const inv = await createInvite(creator);
    canPlay.mockRejectedValue(new AppError(429, 'Günlük sınır', 'ARENA_PERSONAL_LIMIT'));
    expect((await api().post(`/api/arena/duels/${inv.code}/accept`).set(u.auth).expect(429)).body.code).toBe('ARENA_PERSONAL_LIMIT');
    expect((await pool.query('SELECT status FROM arena_duels WHERE id = $1', [inv.duel.id])).rows[0].status).toBe('waiting');

    // Meydan okuma: yalnızca yeni katılımda
    const admin = await createUser();
    await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [admin.id]);
    canPlay.mockResolvedValue(undefined);
    const ch = (
      await api()
        .post('/api/admin/arena/challenges')
        .set(admin.auth)
        .send({ title: 'Sorumlu Kapışma', starts_at: new Date(Date.now() + 5 * 60_000).toISOString(), duration_s: 120, instruments: ['EURUSD', 'BTCUSD'] })
        .expect(201)
    ).body.data;
    await api().post(`/api/arena/challenges/${ch.id}/join`).set(u.auth).expect(200);
    expect(canPlay).toHaveBeenCalledWith(u.id);
    canPlay.mockClear();
    canPlay.mockRejectedValue(new AppError(403, '18+', 'ADULT_CONFIRM_REQUIRED'));
    await api().post(`/api/arena/challenges/${ch.id}/join`).set(u.auth).expect(200); // zaten katıldı
    expect(canPlay).not.toHaveBeenCalled();
    const v = await createUser();
    expect((await api().post(`/api/arena/challenges/${ch.id}/join`).set(v.auth).expect(403)).body.code).toBe('ADULT_CONFIRM_REQUIRED');
  });
});

// ===========================================================================
// Tepkiler + yayın
// ===========================================================================

describe('Arena tepkiler, sunucu mesajları ve yayın ekranı', () => {
  let server: http.Server;
  let port: number;
  let admin: TestUser;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
    admin = await createUser();
    await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [admin.id]);
  });
  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  });

  function openSse(path: string, headers: Record<string, string> = {}) {
    let buffer = '';
    const waiters: { needle: string; resolve: () => void }[] = [];
    const req = http.get({ host: '127.0.0.1', port, path, headers: { Origin: ORIGIN, Accept: 'text/event-stream', ...headers } });
    const response = new Promise<http.IncomingMessage>((resolve, reject) => {
      req.on('response', (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          for (const w of [...waiters]) {
            if (buffer.includes(w.needle)) {
              waiters.splice(waiters.indexOf(w), 1);
              w.resolve();
            }
          }
        });
        resolve(res);
      });
      req.on('error', reject);
    });
    const until = (needle: string, ms = 8000) =>
      new Promise<void>((resolve, reject) => {
        if (buffer.includes(needle)) return resolve();
        waiters.push({ needle, resolve });
        setTimeout(() => reject(new Error(`SSE zaman aşımı: ${needle}\n${buffer}`)), ms);
      });
    const events = (name: string) =>
      buffer
        .split('\n\n')
        .filter((b) => b.startsWith(`event: ${name}\n`))
        .map((b) => JSON.parse(b.split('\n')[1].slice('data: '.length)));
    return { req, response, until, events, get buffer() { return buffer; } };
  }

  async function liveChallenge(users: TestUser[]) {
    const c = (
      await api()
        .post('/api/admin/arena/challenges')
        .set(admin.auth)
        .send({ title: 'Canlı Yayın Kapışması', sponsor: 'ACME', prize_text: 'Kupa', starts_at: new Date(Date.now() + 5 * 60_000).toISOString(), duration_s: 120, instruments: ['EURUSD', 'BTCUSD'] })
        .expect(201)
    ).body.data;
    for (const u of users) await api().post(`/api/arena/challenges/${c.id}/join`).set(u.auth).expect(200);
    await pool.query(`UPDATE arena_challenges SET starts_at = now() - INTERVAL '10 seconds' WHERE id = $1`, [c.id]);
    await pool.query(`UPDATE arena_rounds SET starts_at = now() - INTERVAL '10 seconds', ends_at = now() + INTERVAL '110 seconds' WHERE id = $1`, [c.round_id]);
    await ArenaService.challengesJob();
    return c as { id: string; round_id: string };
  }

  it('tepkiler: katılımcılar, 2 sn\'de bir, geçerli emoji; SSE reaction olayı', async () => {
    const [a, b, viewer] = await Promise.all([createUser(), createUser(), createUser()]);
    const c = await liveChallenge([a, b]);
    const st = openSse(`/api/arena/rounds/${c.round_id}/stream`, b.auth);
    await st.until('event: tick');

    await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(a.auth).send({ emoji: '🔥' }).expect(204);
    await st.until('event: reaction');
    expect(st.events('reaction')[0]).toEqual({ emoji: '🔥', username: a.username });
    const fast = await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(a.auth).send({ emoji: '🚀' }).expect(429);
    expect(fast.body.code).toBe('ARENA_REACTION_RATE');
    expect(fast.body.retry_after).toBeGreaterThanOrEqual(1);
    await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(b.auth).send({ emoji: '💎' }).expect(204);
    await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(b.auth).send({ emoji: '🤡' }).expect(400);
    expect((await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(viewer.auth).send({ emoji: '👏' }).expect(403)).body.code).toBe('ARENA_NOT_JOINED');
    await api().post(`/api/arena/rounds/${c.round_id}/reactions`).send({ emoji: '👏' }).expect(401);
    // Solo tur: başkası → 404
    const solo = (await api().post('/api/arena/rounds').set(viewer.auth).send({ duration_s: 60 }).expect(201)).body.data;
    await api().post(`/api/arena/rounds/${solo.round.id}/reactions`).set(a.auth).send({ emoji: '👏' }).expect(404);
    await new Promise((r) => setTimeout(r, 2100));
    await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(a.auth).send({ emoji: '📉' }).expect(204);
    st.req.destroy();
  });

  it('yayın jetonu (yönetici + audit) → herkese açık durum (tutar yok) + SSE (state/trade/reaction/host_message/end)', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const c = await liveChallenge([a, b]);
    await api().post(`/api/admin/arena/challenges/${c.id}/broadcast-token`).set(a.auth).expect(403);
    const t1 = (await api().post(`/api/admin/arena/challenges/${c.id}/broadcast-token`).set(admin.auth).expect(200)).body.data;
    expect(t1.token).toMatch(/^[0-9a-f]{32}$/);
    expect(t1.overlay_path).toBe(`/yayin/${t1.token}`);
    const t2 = (await api().post(`/api/admin/arena/challenges/${c.id}/broadcast-token`).set(admin.auth).expect(200)).body.data;
    expect(t2.token).not.toBe(t1.token);
    await api().get(`/api/arena/broadcast/${t1.token}`).expect(404); // eski jeton geçersiz
    await api().get('/api/arena/broadcast/not-a-token').expect(400);
    const audit = await pool.query(`SELECT admin_id FROM admin_audit_log WHERE action = 'arena.broadcast_token' AND target_id = $1`, [c.id]);
    expect(audit.rows).toHaveLength(2);
    const list = (await api().get('/api/admin/arena/challenges?limit=50').set(admin.auth).expect(200)).body.data;
    expect(list.items.find((i: any) => i.id === c.id)).toMatchObject({ broadcast_token: t2.token, overlay_path: `/yayin/${t2.token}` });

    await api().post(`/api/arena/rounds/${c.round_id}/positions`).set(a.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 4321.77 }).expect(200);

    const pub = await api().get(`/api/arena/broadcast/${t2.token}`).set('Origin', ORIGIN).expect(200);
    expect(pub.headers['access-control-allow-origin']).toBe(ORIGIN);
    const d = pub.body.data;
    expect(d.challenge).toEqual({ id: c.id, title: 'Canlı Yayın Kapışması', sponsor: 'ACME', prize_text: 'Kupa' });
    expect(d.status).toBe('running');
    expect(d.round).toMatchObject({ ticks_total: 121 });
    expect(d.round.tick).toBeGreaterThanOrEqual(9);
    expect(d.participants).toBe(2);
    expect(d.leaderboard).toHaveLength(2);
    expect(Object.keys(d.leaderboard[0]).sort()).toEqual(['equity', 'rank', 'return_pct', 'username']);
    expect(d.recent_trades).toHaveLength(1);
    expect(Object.keys(d.recent_trades[0]).sort()).toEqual(['at', 'instrument', 'side', 'username']);
    expect(d.recent_trades[0]).toMatchObject({ username: a.username, instrument: 'BTCUSD', side: 'long' });
    const raw = JSON.stringify(d);
    expect(raw).not.toContain('4321.77');
    expect(raw).not.toMatch(/"amount"|"qty"|"cash"|"entry_price"/);

    // Sunucu mesajı: doğrulama + audit + yayın
    await api().post(`/api/admin/arena/challenges/${c.id}/message`).set(admin.auth).send({ text: 'x'.repeat(141) }).expect(400);
    await api().post(`/api/admin/arena/challenges/${c.id}/message`).set(a.auth).send({ text: 'merhaba' }).expect(403);

    const sse = openSse(`/api/arena/broadcast/${t2.token}/stream`);
    const res = await sse.response;
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    await sse.until('event: state');
    expect(sse.events('state')[0].challenge.id).toBe(c.id);
    const round = openSse(`/api/arena/rounds/${c.round_id}/stream`, b.auth);
    await round.until('event: tick');

    const msg = await api().post(`/api/admin/arena/challenges/${c.id}/message`).set(admin.auth).send({ text: '  Son 1 dakika!  ' }).expect(201);
    expect(msg.body.data).toMatchObject({ challenge_id: c.id, text: 'Son 1 dakika!' });
    await sse.until('event: host_message');
    await round.until('event: host_message');
    expect(sse.events('host_message')[0]).toEqual({ text: 'Son 1 dakika!', at: msg.body.data.at });
    expect(round.events('host_message')[0].text).toBe('Son 1 dakika!');
    const a2 = await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'arena.host_message' AND target_id = $1`, [c.id]);
    expect(a2.rows).toHaveLength(1);

    await api().post(`/api/arena/rounds/${c.round_id}/positions`).set(b.auth).send({ instrument: 'EURUSD', side: 'short', amount: 777.13 }).expect(200);
    await sse.until('event: trade');
    expect(sse.events('trade')[0]).toMatchObject({ username: b.username, instrument: 'EURUSD', side: 'short' });
    expect(Object.keys(sse.events('trade')[0]).sort()).toEqual(['at', 'instrument', 'side', 'username']);
    await api().post(`/api/arena/rounds/${c.round_id}/reactions`).set(b.auth).send({ emoji: '😱' }).expect(204);
    await sse.until('event: reaction');
    expect(sse.events('reaction')[0]).toEqual({ emoji: '😱', username: b.username });
    await sse.until('event: state', 3000);
    expect(sse.buffer).not.toContain('"amount"');
    expect(sse.buffer).not.toContain('777.13');

    const pubMsgs = (await api().get(`/api/arena/broadcast/${t2.token}`).expect(200)).body.data.messages;
    expect(pubMsgs.at(-1)).toMatchObject({ text: 'Son 1 dakika!' });

    // Bitiş → end olayı, bağlantı kapanır
    await pool.query(`UPDATE arena_rounds SET starts_at = starts_at - INTERVAL '130 seconds', ends_at = ends_at - INTERVAL '130 seconds' WHERE id = $1`, [c.round_id]);
    await ArenaService.finalizeJob();
    await sse.until('event: end', 6000);
    const end = sse.events('end')[0];
    expect(end.status).toBe('finished');
    expect(end.leaderboard).toHaveLength(2);
    await new Promise<void>((resolve) => (res.complete ? resolve() : res.on('end', () => resolve())));
    round.req.destroy();
    await settle();

    const ev = finished.find((e) => e.round_id === c.round_id)!;
    expect(ev).toMatchObject({ kind: 'challenge', challenge_id: c.id });
    expect(ev.entries.map((e) => e.rank).sort()).toEqual([1, 2]);
    expect(started.find((e) => e.round_id === c.round_id)).toMatchObject({ kind: 'challenge' });
  });
});

// ===========================================================================
// Düello SSE: opponent olayı
// ===========================================================================

describe('Arena düello SSE', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('düello akışı saniyede bir opponent {equity, return_pct} gönderir; end olayı düello sonucunu taşır', async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const d = await matchedDuel(a, b, 60);
    await advance(d.roundId, 5 + 55); // ~5 sn kaldı
    await api().post(`/api/arena/rounds/${d.roundId}/positions`).set(b.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 2500 }).expect(200);
    let buffer = '';
    const req = http.get({ host: '127.0.0.1', port, path: `/api/arena/rounds/${d.roundId}/stream`, headers: { ...a.auth, Origin: ORIGIN } });
    const done = new Promise<void>((resolve, reject) => {
      req.on('response', (res) => {
        res.setEncoding('utf8');
        res.on('data', (c: string) => (buffer += c));
        res.on('end', () => resolve());
      });
      req.on('error', reject);
      setTimeout(() => reject(new Error(`zaman aşımı\n${buffer}`)), 12_000);
    });
    await done;
    const evs = (name: string) =>
      buffer
        .split('\n\n')
        .filter((x) => x.startsWith(`event: ${name}\n`))
        .map((x) => JSON.parse(x.split('\n')[1].slice(6)));
    const opp = evs('opponent');
    expect(opp.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(opp[0]).sort()).toEqual(['equity', 'return_pct']);
    const end = evs('end')[0];
    expect(end.duel).toMatchObject({ id: d.duelId, opponent: { username: b.username, is_bot: false } });
    expect(['win', 'loss', 'draw']).toContain(end.duel.result);
  });
});
