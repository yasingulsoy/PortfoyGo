import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, app, confirmAdult, createUser as createBaseUser, pool, settle, TestUser } from './helpers';
import { clearAvailabilityCache, getInstrument, quoteAt } from '../src/services/arena/instruments';
import { ArenaService, clearPathCache, loadRound, roundPaths } from '../src/services/arena/service';
import { closePrice, findTrigger, openPrice, positionPnl, quantityFor } from '../src/services/arena/engine';
import { arenaBus } from '../src/services/arena/bus';

// Paylaşılan PGlite (test/globalSetup.ts). Zaman yolculuğu: turun starts_at/ends_at değerleri geriye kaydırılır.

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

/** Turu `seconds` saniye ileri sar (başlangıç/bitişi geriye kaydır) */
async function advance(roundId: string, seconds: number) {
  await pool.query(
    `UPDATE arena_rounds SET starts_at = starts_at - $2 * INTERVAL '1 second', ends_at = ends_at - $2 * INTERVAL '1 second' WHERE id = $1`,
    [roundId, seconds]
  );
}

const W = { 'X-Requested-With': 'PortfoyGo' };

async function newRound(u: TestUser, body: Record<string, unknown> = { duration_s: 60 }) {
  const res = await api().post('/api/arena/rounds').set(u.auth).send(body);
  expect(res.status).toBe(201);
  return res.body.data;
}

async function startedRound(u: TestUser, seconds = 10, body: Record<string, unknown> = { duration_s: 60 }) {
  const state = await newRound(u, body);
  await advance(state.round.id, 3 + seconds); // 3 sn geri sayım + seconds
  return state.round.id as string;
}

async function pathsOf(roundId: string) {
  const round = (await loadRound(roundId))!;
  return { round, paths: roundPaths(round)! };
}

/**
 * Arena turları sorumlu oyun kontrolünden geçer (ResponsiblePlay.assertCanPlay: 18+ onayı, mola, kişisel sınır).
 * Kontrol gerçek haliyle çalışır; test kullanıcıları 18+ onaylı oluşturulur (bkz. helpers.confirmAdult).
 */
async function createUser(opts?: Parameters<typeof createBaseUser>[0]): Promise<TestUser> {
  const u = await createBaseUser(opts);
  await confirmAdult(u.id);
  return u;
}

beforeAll(async () => {
  await seedHourly('currency', 'EUR', 'TRY', 51.2, 0.004);
  await seedHourly('currency', 'USD', 'TRY', 43.9, 0.003);
  await seedHourly('crypto', 'BTC', 'USD', 118_000, 0.02);
  await seedHourly('commodity', 'GOLD', 'USD', 2650, 0.006);
  await seedHourly('commodity', 'BRENT_OIL', 'USD', 78, 0.01);
  clearAvailabilityCache();
});

describe('Arena: enstrümanlar ve tur oluşturma', () => {
  it('GET /instruments herkese açık; veri olan 4 çekirdek enstrüman uygun', async () => {
    const res = await api().get('/api/arena/instruments').expect(200);
    const byCode = Object.fromEntries(res.body.data.map((i: any) => [i.code, i]));
    expect(byCode.EURUSD).toMatchObject({ label: 'EUR/USD', decimals: 5, available: true });
    expect(byCode.XAUUSD.available).toBe(true);
    expect(byCode.BRENT.available).toBe(true);
    expect(byCode.BTCUSD.available).toBe(true);
    expect(byCode.XAGUSD.available).toBe(false);
  });

  it('POST /rounds: RoundState sözleşmesi; tek aktif tur kuralı (409 + round_id)', async () => {
    const u = await createUser();
    const s = await newRound(u);
    expect(s.round).toMatchObject({ kind: 'solo', status: 'scheduled', duration_s: 60, tick: 0, ticks_total: 61 });
    expect(s.round.instruments.map((i: any) => i.code)).toEqual(['EURUSD', 'XAUUSD', 'BRENT', 'BTCUSD']);
    expect(s.round.reveal).toBeUndefined();
    expect(s.me).toEqual({ joined: true, cash: 10000, equity: 10000, return_pct: 0, rank: null, trades_count: 0 });
    for (const code of ['EURUSD', 'XAUUSD', 'BRENT', 'BTCUSD']) {
      const q = s.quotes[code];
      expect(q.ask).toBeGreaterThan(q.bid);
      expect(q.change_pct_since_start).toBe(0);
      expect(s.history[code]).toHaveLength(1);
    }
    expect(s.positions).toEqual({ open: [], closed: [] });
    expect(new Date(s.round.starts_at).getTime() - new Date(s.round.server_now).getTime()).toBeGreaterThan(2000);

    const again = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 180 }).expect(409);
    expect(again.body).toMatchObject({ success: false, code: 'ARENA_ROUND_ACTIVE', round_id: s.round.id });

    const active = await api().get('/api/arena/rounds/active').set(u.auth).expect(200);
    expect(active.body.data.round.id).toBe(s.round.id);
    // Başkası göremez
    const other = await createUser();
    await api().get(`/api/arena/rounds/${s.round.id}`).set(other.auth).expect(404);
    expect((await api().get('/api/arena/rounds/active').set(other.auth).expect(200)).body.data).toBeNull();
  });

  it('enstrüman seçimi + doğrulama', async () => {
    const u = await createUser();
    await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 45 }).expect(400);
    await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60, instruments: ['XAGUSD'] }).expect(400);
    const s = await newRound(u, { duration_s: 300, instruments: ['btcusd', 'EURUSD'] });
    expect(s.round.instruments.map((i: any) => i.code)).toEqual(['BTCUSD', 'EURUSD']);
    expect(Object.keys(s.quotes).sort()).toEqual(['BTCUSD', 'EURUSD']);
  });

  it('saatlik sınır: 12 tur/saat → 429 ARENA_LIMIT + retry_after', async () => {
    const u = await createUser();
    for (let i = 0; i < 12; i++) {
      await pool.query(
        `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, seed, created_at, finished_at)
         VALUES ('solo', $1, 'finished', now() - INTERVAL '30 minutes', now() - INTERVAL '29 minutes', 60, '[]', 1,
                 now() - ($2::int * INTERVAL '1 minute'), now())`,
        [u.id, 50 - i]
      );
    }
    const res = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60 }).expect(429);
    expect(res.body.code).toBe('ARENA_LIMIT');
    expect(res.body.message).toMatch(/12/);
    expect(res.body.retry_after).toBeGreaterThan(500);
    expect(res.body.retry_after).toBeLessThanOrEqual(600);
    expect(Number(res.headers['retry-after'])).toBe(res.body.retry_after);
  });
});

describe('Arena: işlemler', () => {
  it('başlamadan işlem yok; uzun/kısa açılış ask/bid, kapanış bid/ask, nakit ve pnl', async () => {
    const u = await createUser();
    const s = await newRound(u);
    const id = s.round.id;
    const early = await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 1000 });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('ARENA_NOT_STARTED');

    await advance(id, 3 + 5);
    const { paths } = await pathsOf(id);
    const long = await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 1000 }).expect(200);
    const tick = 5;
    const q = quoteAt(getInstrument('BTCUSD')!, paths.get('BTCUSD')![tick]);
    expect(long.body.data.position.entry_price).toBeCloseTo(openPrice('long', q), 6);
    expect(long.body.data.position.qty).toBeCloseTo(quantityFor(1000, openPrice('long', q)), 9);
    expect(long.body.data.position).toMatchObject({ instrument: 'BTCUSD', side: 'long', amount: 1000, status: 'open', stop_loss: null });
    expect(long.body.data.me.cash).toBe(9000);
    expect(long.body.data.me.trades_count).toBe(1);

    const short = await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'EURUSD', side: 'short', amount: 2500 }).expect(200);
    const qe = quoteAt(getInstrument('EURUSD')!, paths.get('EURUSD')![tick]);
    expect(short.body.data.position.entry_price).toBeCloseTo(openPrice('short', qe), 8);
    expect(short.body.data.me.cash).toBe(6500);

    // Tutar kuralları
    await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 5 }).expect(400);
    const tooMuch = await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 7000 }).expect(400);
    expect(tooMuch.body.code).toBe('ARENA_INSUFFICIENT_CASH');
    await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'XAGUSD', side: 'long', amount: 50 }).expect(400);

    await advance(id, 10); // tick 15
    const closeTick = 15;
    const qc = quoteAt(getInstrument('BTCUSD')!, paths.get('BTCUSD')![closeTick]);
    const closed = await api().post(`/api/arena/rounds/${id}/positions/${long.body.data.position.id}/close`).set(u.auth).expect(200);
    const expectedPnl = positionPnl('long', long.body.data.position.entry_price, closePrice('long', qc), long.body.data.position.qty, 1000);
    expect(closed.body.data.position).toMatchObject({ status: 'closed', close_reason: 'manual' });
    expect(closed.body.data.position.close_price).toBeCloseTo(closePrice('long', qc), 6);
    expect(closed.body.data.position.pnl).toBeCloseTo(expectedPnl, 2);
    expect(closed.body.data.me.cash).toBeCloseTo(6500 + 1000 + expectedPnl, 2);

    // Durum: açık kısa pozisyon canlı pnl ile, kapalı listede uzun
    const state = (await api().get(`/api/arena/rounds/${id}`).set(u.auth).expect(200)).body.data;
    expect(state.round.status).toBe('running');
    expect(state.round.tick).toBe(15);
    expect(state.history.BTCUSD).toHaveLength(16);
    expect(state.history_ticks).toHaveLength(16);
    expect(state.positions.open).toHaveLength(1);
    expect(state.positions.closed).toHaveLength(1);
    const qe15 = quoteAt(getInstrument('EURUSD')!, paths.get('EURUSD')![15]);
    expect(state.positions.open[0].current_price).toBeCloseTo(closePrice('short', qe15), 5);
    const shortPnl = positionPnl('short', short.body.data.position.entry_price, closePrice('short', qe15), short.body.data.position.qty, 2500);
    expect(state.me.equity).toBeCloseTo(state.me.cash + 2500 + shortPnl, 1);

    // close-all
    const all = await api().post(`/api/arena/rounds/${id}/close-all`).set(u.auth).expect(200);
    expect(all.body.data.closed).toBe(1);
    expect(all.body.data.me.cash).toBeCloseTo(all.body.data.me.equity, 2);
  });

  it('SL/TP doğrulaması ve PATCH', async () => {
    const u = await createUser();
    const id = await startedRound(u, 4);
    const { paths } = await pathsOf(id);
    const q = quoteAt(getInstrument('XAUUSD')!, paths.get('XAUUSD')![4]);
    const bad = await api()
      .post(`/api/arena/rounds/${id}/positions`)
      .set(u.auth)
      .send({ instrument: 'XAUUSD', side: 'long', amount: 100, stop_loss: q.ask + 1 })
      .expect(400);
    expect(bad.body.message).toMatch(/zarar durdur/i);
    await api()
      .post(`/api/arena/rounds/${id}/positions`)
      .set(u.auth)
      .send({ instrument: 'XAUUSD', side: 'short', amount: 100, take_profit: q.bid + 1 })
      .expect(400);
    const ok = await api()
      .post(`/api/arena/rounds/${id}/positions`)
      .set(u.auth)
      .send({ instrument: 'XAUUSD', side: 'long', amount: 100, stop_loss: q.bid * 0.5, take_profit: q.ask * 2 })
      .expect(200);
    const pid = ok.body.data.position.id;
    expect(ok.body.data.position.stop_loss).toBeCloseTo(q.bid * 0.5, 6);
    const patched = await api().patch(`/api/arena/rounds/${id}/positions/${pid}`).set(u.auth).send({ stop_loss: null, take_profit: q.ask * 1.5 }).expect(200);
    expect(patched.body.data.position.stop_loss).toBeNull();
    expect(patched.body.data.position.take_profit).toBeCloseTo(q.ask * 1.5, 6);
    await api().patch(`/api/arena/rounds/${id}/positions/${pid}`).set(u.auth).send({}).expect(400);
    await api().patch(`/api/arena/rounds/${id}/positions/${pid}`).set(u.auth).send({ take_profit: q.bid * 0.9 }).expect(400);
  });

  it('SL/TP: atlanan tick\'ler arasında ilk dokunuş birebir (tembel okuma ve arena-tick işi)', async () => {
    for (const via of ['read', 'job'] as const) {
      const u = await createUser();
      const id = await startedRound(u, 2, { duration_s: 180 });
      const { paths } = await pathsOf(id);
      const code = 'BTCUSD';
      const inst = getInstrument(code)!;
      const quote = (t: number) => quoteAt(inst, paths.get(code)![t]);
      const q0 = quote(2);
      const horizon = 120;
      const bids = Array.from({ length: horizon }, (_, k) => quote(2 + 1 + k).bid);
      const minBid = Math.min(...bids);
      const maxBid = Math.max(...bids);
      const sl = minBid < q0.bid ? (minBid + q0.bid) / 2 : null;
      const tp = maxBid > q0.ask ? (maxBid + q0.ask) / 2 : null;
      expect(sl !== null || tp !== null).toBe(true);

      const opened = await api()
        .post(`/api/arena/rounds/${id}/positions`)
        .set(u.auth)
        .send({ instrument: code, side: 'long', amount: 2000, stop_loss: sl, take_profit: tp })
        .expect(200);
      const p = opened.body.data.position;
      const expected = findTrigger(
        { side: 'long', entry_price: p.entry_price, qty: p.qty, amount: 2000, stop_loss: p.stop_loss, take_profit: p.take_profit, last_checked_tick: 2 },
        2,
        2 + horizon,
        quote
      )!;
      expect(expected).not.toBeNull();

      await advance(id, horizon); // tick 122; arada hiçbir değerlendirme çalışmadı
      if (via === 'job') {
        const r = await ArenaService.tickJob();
        expect(r.triggered).toBeGreaterThanOrEqual(1);
      }
      const state = (await api().get(`/api/arena/rounds/${id}`).set(u.auth).expect(200)).body.data;
      expect(state.positions.open).toHaveLength(0);
      const c = state.positions.closed[0];
      expect(c.close_reason).toBe(expected.reason);
      expect(c.close_price).toBeCloseTo(expected.price, 6);
      const row = await pool.query('SELECT close_tick FROM arena_positions WHERE id = $1', [p.id]);
      expect(row.rows[0].close_tick).toBe(expected.tick);
      const pnl = positionPnl('long', p.entry_price, expected.price, p.qty, 2000);
      // me.* 2 ondalığa yuvarlanır: x.xx5 sınırında 0,005'lik fark olabilir
      expect(Math.abs(state.me.cash - (10000 + pnl))).toBeLessThanOrEqual(0.0051);
    }
  });

  it('eşzamanlılık: aynı pozisyon iki kez kapatılırsa yalnızca biri başarılı', async () => {
    const u = await createUser();
    const id = await startedRound(u, 3);
    const o = await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'BRENT', side: 'short', amount: 500 }).expect(200);
    const pid = o.body.data.position.id;
    const [a, b] = await Promise.all([
      api().post(`/api/arena/rounds/${id}/positions/${pid}/close`).set(u.auth),
      api().post(`/api/arena/rounds/${id}/positions/${pid}/close`).set(u.auth),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.code).toBe('ARENA_POSITION_CLOSED');
    const e = await pool.query('SELECT cash::float AS cash FROM arena_entries WHERE round_id = $1 AND user_id = $2', [id, u.id]);
    const ok = a.status === 200 ? a : b;
    expect(e.rows[0].cash).toBeCloseTo(10000 + ok.body.data.position.pnl, 2);
  });

  it('kapanış: idempotent, açık pozisyonlar round_end ile kapanır; geçmiş, liderlik, rozet; yol önbelleği yeniden üretilir', async () => {
    const u = await createUser();
    const id = await startedRound(u, 10);
    const o = await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'EURUSD', side: 'long', amount: 3000 }).expect(200);
    const { paths } = await pathsOf(id);
    const before = (await api().get(`/api/arena/rounds/${id}`).set(u.auth)).body.data;
    clearPathCache();
    const again = (await api().get(`/api/arena/rounds/${id}`).set(u.auth)).body.data;
    expect(again.quotes).toEqual(before.quotes);
    expect(again.history).toEqual(before.history);

    await advance(id, 60);
    const results = await Promise.all([ArenaService.finalizeRound(id), ArenaService.finalizeRound(id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await ArenaService.finalizeRound(id)).toBe(false);

    const qEnd = quoteAt(getInstrument('EURUSD')!, paths.get('EURUSD')![60]);
    const pos = await pool.query('SELECT status, close_reason, close_tick, pnl::float AS pnl FROM arena_positions WHERE id = $1', [o.body.data.position.id]);
    const trig = findTrigger(
      { side: 'long', entry_price: o.body.data.position.entry_price, qty: o.body.data.position.qty, amount: 3000, stop_loss: null, take_profit: null, last_checked_tick: 10 },
      10,
      60,
      (t) => quoteAt(getInstrument('EURUSD')!, paths.get('EURUSD')![t])
    );
    expect(trig).toBeNull();
    expect(pos.rows[0]).toMatchObject({ status: 'closed', close_reason: 'round_end', close_tick: 60 });
    const expectedPnl = positionPnl('long', o.body.data.position.entry_price, closePrice('long', qEnd), o.body.data.position.qty, 3000);
    expect(pos.rows[0].pnl).toBeCloseTo(expectedPnl, 3);

    const state = (await api().get(`/api/arena/rounds/${id}`).set(u.auth).expect(200)).body.data;
    expect(state.round.status).toBe('finished');
    expect(state.round.tick).toBe(60);
    expect(state.round.reveal.from).toMatch(/^\d{4}-/);
    expect(state.round.reveal.instruments.EURUSD.to).toBeDefined();
    // me.* 2 ondalığa yuvarlanır: x.xx5 sınırında 0,005'lik fark olabilir
    expect(Math.abs(state.me.equity - (10000 + expectedPnl))).toBeLessThanOrEqual(0.0051);
    expect(state.me.return_pct).toBeCloseTo((expectedPnl / 10000) * 100, 2);
    await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'EURUSD', side: 'long', amount: 100 }).expect(409);

    const hist = (await api().get('/api/arena/me/history').set(u.auth).expect(200)).body.data;
    expect(hist.total).toBe(1);
    expect(hist.items[0]).toMatchObject({ round_id: id, kind: 'solo', duration_s: 60, trades_count: 1, rank: null });
    expect(hist.stats.rounds).toBe(1);
    expect(hist.stats.win_rate === 0 || hist.stats.win_rate === 100).toBe(true);

    const lb = (await api().get('/api/arena/leaderboard?period=day').set(u.auth).expect(200)).body.data;
    expect(lb.me).toMatchObject({ return_pct: hist.items[0].return_pct });
    expect(lb.items.some((i: any) => i.username === u.username)).toBe(true);
    await api().get('/api/arena/leaderboard?period=month').expect(400);
    expect((await api().get('/api/arena/leaderboard?period=week').expect(200)).body.data.me).toBeUndefined();

    for (let i = 0; i < 40; i++) {
      const b = await pool.query(
        `SELECT b.name FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = $1 AND b.condition_type LIKE 'arena%'`,
        [u.id]
      );
      if (b.rows.length > 0) {
        expect(b.rows.map((r: any) => r.name)).toContain('Arena çaylağı');
        break;
      }
      if (i === 39) throw new Error('Arena çaylağı rozeti verilmedi');
      await settle();
    }

    // Kapanan tur sonrası yeni tur açılabilir
    await newRound(u);
  });

  it('auth / CSRF', async () => {
    await api().post('/api/arena/rounds').send({ duration_s: 60 }).expect(401);
    await api().get('/api/arena/rounds/active').expect(401);
    await api().get('/api/arena/me/history').expect(401);
    const u = await createUser();
    const cookie = `pg_session=${u.token}`;
    const noCsrf = await api().post('/api/arena/rounds').set('Cookie', cookie).set('Origin', ORIGIN).send({ duration_s: 60 });
    expect(noCsrf.status).toBe(403);
    await api().post('/api/arena/rounds').set('Cookie', cookie).set(W).set('Origin', ORIGIN).send({ duration_s: 60 }).expect(201);
    await api().get('/api/arena/rounds/not-a-uuid').set(u.auth).expect(400);
  });
});

describe('Arena: SSE akışı', () => {
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

  function openStream(u: TestUser, roundId: string) {
    let buffer = '';
    const waiters: { needle: string; resolve: () => void }[] = [];
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: `/api/arena/rounds/${roundId}/stream`,
      headers: { ...u.auth, Origin: ORIGIN, Accept: 'text/event-stream' },
    });
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

  it('geri sayım, tick, position, me ve end olayları; ardından bağlantı kapanır', async () => {
    const u = await createUser();
    const s = await newRound(u);
    const id = s.round.id;
    const pre = openStream(u, id);
    const preRes = await pre.response;
    expect(preRes.statusCode).toBe(200);
    expect(preRes.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(preRes.headers['access-control-allow-origin']).toBe(ORIGIN);
    await pre.until('event: countdown');
    expect(pre.events('countdown')[0].starts_in_ms).toBeGreaterThan(0);
    pre.req.destroy();

    await advance(id, 3 + 56); // tick 56; ~4 sn kaldı
    const st = openStream(u, id);
    const res = await st.response;
    await st.until('event: tick');
    const t = st.events('tick').at(-1);
    expect(t.tick).toBeGreaterThanOrEqual(56);
    expect(Object.keys(t.quotes).sort()).toEqual(['BRENT', 'BTCUSD', 'EURUSD', 'XAUUSD']);
    expect(t.quotes.BTCUSD.ask).toBeGreaterThan(t.quotes.BTCUSD.bid);

    await api().post(`/api/arena/rounds/${id}/positions`).set(u.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 1500 }).expect(200);
    await st.until('event: position');
    expect(st.events('position')[0]).toMatchObject({ instrument: 'BTCUSD', status: 'open', amount: 1500 });
    await st.until('"cash":8500');

    await st.until('event: end', 10_000);
    const end = st.events('end')[0];
    expect(end.final).toMatchObject({ joined: true, trades_count: 1 });
    expect(end.reveal.from).toMatch(/^\d{4}-/);
    // Tur sonunda açık pozisyon round_end ile kapanır ve position olayı gelir
    expect(st.events('position').some((p: any) => p.close_reason === 'round_end')).toBe(true);
    await new Promise<void>((resolve) => (res.complete ? resolve() : res.on('end', () => resolve())));
    for (let i = 0; i < 50 && arenaBus.listenerCount(id) > 0; i++) await settle();
    expect(arenaBus.listenerCount(id)).toBe(0);
  });

  it('başkasının solo turu → 404', async () => {
    const a = await createUser();
    const b = await createUser();
    const s = await newRound(a);
    const st = openStream(b, s.round.id);
    expect((await st.response).statusCode).toBe(404);
    st.req.destroy();
  });
});

describe('Arena: meydan okumalar + yönetici', () => {
  let admin: TestUser;
  beforeAll(async () => {
    admin = await createUser();
    await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [admin.id]);
  });

  const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  it('yönetici: oluştur (doğrulama + audit), listele, iptal (yalnızca başlamamış)', async () => {
    const user = await createUser();
    await api().post('/api/admin/arena/challenges').set(user.auth).send({}).expect(403);
    const base = { title: 'Test Kapışması', starts_at: inMinutes(10), duration_s: 300, instruments: ['EURUSD', 'BTCUSD'] };
    await api().post('/api/admin/arena/challenges').set(admin.auth).send({ ...base, starts_at: inMinutes(0.2) }).expect(400);
    await api().post('/api/admin/arena/challenges').set(admin.auth).send({ ...base, instruments: ['EURUSD'] }).expect(400);
    await api().post('/api/admin/arena/challenges').set(admin.auth).send({ ...base, duration_s: 30 }).expect(400);
    await api().post('/api/admin/arena/challenges').set(admin.auth).send({ ...base, instruments: ['EURUSD', 'XAGUSD'] }).expect(400);
    await api().post('/api/admin/arena/challenges').set(admin.auth).send({ ...base, starting_cash: 500 }).expect(400);

    const created = await api()
      .post('/api/admin/arena/challenges')
      .set(admin.auth)
      .send({ ...base, sponsor: 'ACME', prize_text: 'Kupa', description: 'Açıklama', starting_cash: 5000 })
      .expect(201);
    const c = created.body.data;
    expect(c).toMatchObject({ title: 'Test Kapışması', sponsor: 'ACME', status: 'scheduled', participants: 0, starting_cash: 5000 });
    expect(c.round_id).toMatch(/^[0-9a-f-]{36}$/);
    const audit = await pool.query(`SELECT admin_id, target_id FROM admin_audit_log WHERE action = 'arena.challenge_create' AND target_id = $1`, [c.id]);
    expect(audit.rows[0].admin_id).toBe(admin.id);

    const list = (await api().get('/api/admin/arena/challenges?limit=5').set(admin.auth).expect(200)).body.data;
    expect(list.items.some((i: any) => i.id === c.id)).toBe(true);
    expect(list.total).toBeGreaterThanOrEqual(1);

    const cancelled = await api().post(`/api/admin/arena/challenges/${c.id}/cancel`).set(admin.auth).expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    await api().post(`/api/admin/arena/challenges/${c.id}/cancel`).set(admin.auth).expect(409);
    const a2 = await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'arena.challenge_cancel' AND target_id = $1`, [c.id]);
    expect(a2.rows).toHaveLength(1);
    const join = await api().post(`/api/arena/challenges/${c.id}/join`).set(user.auth).expect(409);
    expect(join.body.code).toBe('ARENA_CHALLENGE_CLOSED');
  });

  it('katıl → başlat (bildirim) → işlem → kapanış (sıra + sonuç bildirimi) → liderlik', async () => {
    const created = await api()
      .post('/api/admin/arena/challenges')
      .set(admin.auth)
      .send({ title: 'Akşam Kapışması', starts_at: inMinutes(5), duration_s: 120, instruments: ['EURUSD', 'XAUUSD', 'BTCUSD'] })
      .expect(201);
    const c = created.body.data;
    const [u1, u2, u3] = await Promise.all([createUser(), createUser(), createUser()]);
    const unverified = await createUser({ verified: false });
    expect((await api().post(`/api/arena/challenges/${c.id}/join`).set(unverified.auth).expect(403)).body.code).toBe('EMAIL_NOT_VERIFIED');
    for (const u of [u1, u2, u3]) {
      const r = await api().post(`/api/arena/challenges/${c.id}/join`).set(u.auth).expect(200);
      expect(r.body.data.round_id).toBe(c.round_id);
    }
    // İdempotent katılım
    await api().post(`/api/arena/challenges/${c.id}/join`).set(u1.auth).expect(200);

    const upcoming = (await api().get('/api/arena/challenges?status=upcoming').set(u1.auth).expect(200)).body.data;
    expect(upcoming.find((x: any) => x.id === c.id)).toMatchObject({ joined: true, participants: 3, status: 'scheduled' });
    const anon = (await api().get('/api/arena/challenges').expect(200)).body.data;
    expect(anon.find((x: any) => x.id === c.id).joined).toBe(false);
    await api().get('/api/arena/challenges?status=bogus').expect(400);

    // Başlamadan önce: fiyat yok, işlem yok
    const pre = (await api().get(`/api/arena/rounds/${c.round_id}`).set(u1.auth).expect(200)).body.data;
    expect(pre.round).toMatchObject({ kind: 'challenge', status: 'scheduled' });
    expect(pre.round.challenge).toMatchObject({ id: c.id, title: 'Akşam Kapışması' });
    expect(pre.quotes).toEqual({});

    // Başlangıç zamanını geçmişe al → iş başlatır
    await pool.query(`UPDATE arena_challenges SET starts_at = now() - INTERVAL '10 seconds' WHERE id = $1`, [c.id]);
    await pool.query(
      `UPDATE arena_rounds SET starts_at = now() - INTERVAL '10 seconds', ends_at = now() + INTERVAL '110 seconds' WHERE id = $1`,
      [c.round_id]
    );
    expect(await ArenaService.challengesJob()).toBe(1);
    expect(await ArenaService.challengesJob()).toBe(0);
    const started = await pool.query(
      `SELECT user_id, title, link FROM notifications WHERE type = 'arena.challenge_started' AND user_id = ANY($1::uuid[])`,
      [[u1.id, u2.id, u3.id]]
    );
    expect(started.rows).toHaveLength(3);
    expect(started.rows[0]).toMatchObject({ title: 'Meydan okuma başladı!', link: `/arena/challenge/${c.id}` });

    const live = (await api().get(`/api/arena/rounds/${c.round_id}`).set(u2.auth).expect(200)).body.data;
    expect(live.round.status).toBe('running');
    expect(Object.keys(live.quotes).sort()).toEqual(['BTCUSD', 'EURUSD', 'XAUUSD']);
    expect(live.leaderboard).toHaveLength(3);

    // Katılmayan kullanıcı salt okunur görür, işlem yapamaz
    const viewer = await createUser();
    const v = (await api().get(`/api/arena/rounds/${c.round_id}`).set(viewer.auth).expect(200)).body.data;
    expect(v.me.joined).toBe(false);
    expect((await api().post(`/api/arena/rounds/${c.round_id}/positions`).set(viewer.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 100 }).expect(403)).body.code).toBe(
      'ARENA_NOT_JOINED'
    );

    // u1: işlem yapmaz (getiri 0); u2: 1 işlem; u3: 2 işlem
    await api().post(`/api/arena/rounds/${c.round_id}/positions`).set(u2.auth).send({ instrument: 'BTCUSD', side: 'long', amount: 4000 }).expect(200);
    await api().post(`/api/arena/rounds/${c.round_id}/positions`).set(u3.auth).send({ instrument: 'XAUUSD', side: 'short', amount: 3000 }).expect(200);
    await api().post(`/api/arena/rounds/${c.round_id}/positions`).set(u3.auth).send({ instrument: 'EURUSD', side: 'long', amount: 3000 }).expect(200);

    await pool.query(`UPDATE arena_rounds SET starts_at = starts_at - INTERVAL '120 seconds', ends_at = ends_at - INTERVAL '120 seconds' WHERE id = $1`, [c.round_id]);
    expect(await ArenaService.finalizeJob()).toBeGreaterThanOrEqual(1);

    const entries = await pool.query(
      `SELECT user_id, rank, return_pct::float AS ret, trades_count FROM arena_entries WHERE round_id = $1 ORDER BY rank`,
      [c.round_id]
    );
    expect(entries.rows.map((r: any) => r.rank)).toEqual([1, 2, 3]);
    for (let i = 1; i < entries.rows.length; i++) {
      const a = entries.rows[i - 1];
      const b = entries.rows[i];
      expect(a.ret > b.ret || (a.ret === b.ret && a.trades_count <= b.trades_count)).toBe(true);
    }
    const ch = await pool.query('SELECT status FROM arena_challenges WHERE id = $1', [c.id]);
    expect(ch.rows[0].status).toBe('finished');
    const results = await pool.query(
      `SELECT user_id, title, category, data FROM notifications WHERE type = 'arena.challenge_result' AND user_id = ANY($1::uuid[])`,
      [[u1.id, u2.id, u3.id]]
    );
    expect(results.rows).toHaveLength(3);
    const byUser = new Map(entries.rows.map((r: any) => [r.user_id, r.rank]));
    for (const n of results.rows) {
      expect(n.category).toBe('competition');
      expect(n.title).toBe(`Meydan okumayı ${byUser.get(n.user_id)}. bitirdin`);
    }

    const lb = (await api().get(`/api/arena/challenges/${c.id}/leaderboard`).set(u3.auth).expect(200)).body.data;
    expect(lb.status).toBe('finished');
    expect(lb.items.map((i: any) => i.rank)).toEqual([1, 2, 3]);
    expect(lb.items.filter((i: any) => i.is_me)).toHaveLength(1);
    const finishedList = (await api().get('/api/arena/challenges?status=finished').expect(200)).body.data;
    expect(finishedList.some((x: any) => x.id === c.id)).toBe(true);
    const hist = (await api().get('/api/arena/me/history').set(u3.auth).expect(200)).body.data;
    expect(hist.items[0]).toMatchObject({ kind: 'challenge', challenge_title: 'Akşam Kapışması', trades_count: 2 });
    await api().post(`/api/arena/challenges/${c.id}/join`).set(viewer.auth).expect(409);
  });
});
