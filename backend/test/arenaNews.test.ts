import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, app, confirmAdult, createUser as createBaseUser, pool, TestUser } from './helpers';
import { AuthService } from '../src/services/auth';
import { getInstrument, quoteAt, roundTo } from '../src/services/arena/instruments';
import { ArenaService, clearPathCache, loadRound, roundPaths } from '../src/services/arena/service';
import { arenaEvents } from '../src/services/arena/events';
import {
  IMPACT_SIZES,
  JUMP_CURVE,
  NEWS_TAIL_TICKS,
  assignRoles,
  buildNewsPath,
  buildNewsPaths,
  buildNewsSchedule,
  cumulativeImpact,
  impactEndTick,
  impactFraction,
  impactPct,
  newsForClient,
  newsSlots,
  publicNewsItem,
  revealNewsItem,
  tickVol,
  type NewsSchedule,
  type ScheduledNews,
} from '../src/services/arena/news/engine';
import { loadNewsStartPrices } from '../src/services/arena/news/prices';
import { NEWS_INSTRUMENTS, NEWS_TEMPLATES } from '../src/services/arena/news/templates';
import { mulberry32 } from '../src/services/arena/paths';
import { CoachService } from '../src/services/coach/service';
import { istanbulDay } from '../src/services/game/common';
import { GameListeners, roundReward } from '../src/services/game/listeners';
import { questsForDay } from '../src/services/game/quests';

// Paylaşılan PGlite (test/globalSetup.ts). Zaman yolculuğu: turun starts_at/ends_at değerleri geriye kaydırılır.

const ORIGIN = 'http://localhost:3000';
const HOUR = 3_600_000;

/** Haber Turu başlangıç fiyatları için "şu anki" gerçek fiyatlar (içinde bulunulan saatin kovası) */
const LIVE = { EUR: 55.6, USD: 49.4, GOLD: 4166.1, BRENT_OIL: 76.9, BTC: 81392 };

async function seedLatest() {
  const bucket = new Date(Math.floor(Date.now() / HOUR) * HOUR).toISOString();
  const rows: [string, string, string, number][] = [
    ['currency', 'EUR', 'TRY', LIVE.EUR],
    ['currency', 'USD', 'TRY', LIVE.USD],
    ['commodity', 'GOLD', 'USD', LIVE.GOLD],
    ['commodity', 'BRENT_OIL', 'USD', LIVE.BRENT_OIL],
    ['crypto', 'BTC', 'USD', LIVE.BTC],
  ];
  for (const [t, s, c, p] of rows) {
    await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency)
       VALUES ($1, $2, 'hour', $3, $4, $5)
       ON CONFLICT (asset_type, symbol, granularity, bucket_start) DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency`,
      [t, s, bucket, p, c]
    );
  }
}

async function advance(roundId: string, seconds: number) {
  await pool.query(
    `UPDATE arena_rounds SET starts_at = starts_at - $2 * INTERVAL '1 second', ends_at = ends_at - $2 * INTERVAL '1 second' WHERE id = $1`,
    [roundId, seconds]
  );
}

async function createUser(): Promise<TestUser> {
  const u = await createBaseUser();
  await confirmAdult(u.id);
  return u;
}

/** Bugünün görevleri arasında `key` olan bir kullanıcı (id seçilerek eklenir) */
async function createUserWithQuest(key: string): Promise<TestUser> {
  const today = istanbulDay();
  let id = crypto.randomUUID();
  for (let i = 0; i < 5000 && !questsForDay(id, today).some((q) => q.key === key); i++) id = crypto.randomUUID();
  const username = `n_${crypto.randomBytes(4).toString('hex')}`;
  const hash = await bcrypt.hash('test-password-123', 4);
  await pool.query(`INSERT INTO users (id, username, email, password_hash, email_verified, balance) VALUES ($1, $2, $3, $4, TRUE, 100000)`, [
    id,
    username,
    `${username}@test.local`,
    hash,
  ]);
  await confirmAdult(id);
  const token = AuthService.signSessionToken(id, 0);
  return { id, username, email: `${username}@test.local`, token, auth: { Authorization: `Bearer ${token}` } };
}

async function newsRound(u: TestUser, duration_s = 60) {
  const res = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s, mode: 'news' });
  expect(res.status).toBe(201);
  return res.body.data;
}

const DENY = /powell|lagarde|yellen|musk|saylor|binance|coinbase|blackrock|grayscale|tesla|microstrategy|opec|aramco|ftx|tether|\bsec\b/i;

// ---------------------------------------------------------------------------
// Saf motor
// ---------------------------------------------------------------------------

describe('Haber Turu: şablon kitaplığı', () => {
  it('40+ şablon; her biri geçerli, Türkçe "Neden?" açıklamalı; gerçek kişi / şirket adı yok', () => {
    expect(NEWS_TEMPLATES.length).toBeGreaterThanOrEqual(40);
    const keys = new Set<string>();
    for (const t of NEWS_TEMPLATES) {
      expect(keys.has(t.key)).toBe(false);
      keys.add(t.key);
      expect(t.variants.length).toBeGreaterThan(0);
      expect(t.explain.length).toBeGreaterThan(20);
      const texts = [...t.variants.map((v) => `${v.headline} ${v.body ?? ''}`), t.explain, ...(t.denial?.variants.map((v) => v.headline) ?? [])];
      for (const s of texts) expect(s).not.toMatch(DENY);
      if (t.kind === 'noise') {
        expect(t.effects).toEqual([]);
        expect(t.related?.length).toBeGreaterThan(0);
      } else {
        expect(t.effects.length).toBeGreaterThan(0);
        for (const e of t.effects) expect(NEWS_INSTRUMENTS).toContain(e.i);
      }
      if (t.kind === 'rumour') {
        expect(t.denial?.variants.length).toBeGreaterThan(0);
        expect(t.variants[0].headline).toMatch(/^(Söylenti|İddia):/);
      }
    }
    const kinds = (k: string) => NEWS_TEMPLATES.filter((t) => t.kind === k).length;
    expect(kinds('news')).toBeGreaterThanOrEqual(25);
    expect(kinds('noise')).toBeGreaterThanOrEqual(8);
    expect(kinds('rumour')).toBeGreaterThanOrEqual(5);
  });
});

describe('Haber Turu: program', () => {
  it('tohum başına deterministik; farklı tohum → farklı program', () => {
    const a = buildNewsSchedule(42, 180);
    const b = buildNewsSchedule(42, 180);
    expect(b).toEqual(a);
    expect(JSON.stringify(buildNewsSchedule(43, 180))).not.toBe(JSON.stringify(a));
  });

  it('aralıklar: ilk haber 4–8. sn, 60 sn turda 13–20, diğerlerinde 15–35 sn; son haberden sonra ≥ 8 sn', () => {
    for (const T of [60, 180, 300]) {
      for (let s = 1; s <= 40; s++) {
        const slots = newsSlots(T, mulberry32(s * 101));
        expect(slots[0]).toBeGreaterThanOrEqual(4);
        expect(slots[0]).toBeLessThanOrEqual(8);
        expect(slots[slots.length - 1]).toBeLessThanOrEqual(T - NEWS_TAIL_TICKS);
        for (let i = 1; i < slots.length; i++) {
          const gap = slots[i] - slots[i - 1];
          if (T <= 90) expect(gap >= 13 && gap <= 20).toBe(true);
          else expect(gap >= 15 && gap <= 35).toBe(true);
        }
        if (T === 60) expect(slots.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('roller: ilk haber etkili; söylentinin hemen ardından yalanlama (etkisi ters); gürültü etkisiz', () => {
    let pairs = 0;
    let noise = 0;
    for (let s = 1; s <= 60; s++) {
      for (const T of [60, 180, 300]) {
        const items = buildNewsSchedule(s * 7919, T);
        expect(items[0].role).toBe('news');
        expect(items[0].impacts.length).toBeGreaterThan(0);
        expect(items.some((i) => i.role === 'news')).toBe(true);
        items.forEach((it, idx) => {
          expect(it.seq).toBe(idx + 1);
          if (it.role === 'noise') {
            noise++;
            expect(it.impacts).toEqual([]);
          }
          if (it.role === 'rumour') {
            pairs++;
            const d = items[idx + 1];
            expect(d.role).toBe('denial');
            expect(d.pair).toBe(it.seq);
            expect(it.pair).toBe(d.seq);
            expect(d.impacts.map((x) => x.instrument)).toEqual(it.impacts.map((x) => x.instrument));
            d.impacts.forEach((x, k) => {
              expect(x.direction).toBe(-it.impacts[k].direction);
              expect(x.magnitude).toBeGreaterThanOrEqual(it.impacts[k].magnitude);
            });
          }
          for (const imp of it.impacts) {
            expect(imp.magnitude).toBeGreaterThan(0);
            expect(impactEndTick(it.tick, imp)).toBeLessThanOrEqual(T);
          }
        });
      }
    }
    expect(pairs).toBeGreaterThan(20);
    expect(noise).toBeGreaterThan(20);
  });

  it('assignRoles: küçük turlarda en az bir etkili haber kalır', () => {
    for (let s = 1; s <= 50; s++) {
      for (const n of [1, 2, 3, 4]) {
        const roles = assignRoles(n, 60, mulberry32(s));
        expect(roles).toHaveLength(n);
        expect(roles[0]).toBe('news');
        expect(roles.filter((r) => r === 'news').length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('Haber Turu: etki eğrisi ve fiyat yolu', () => {
  it('impactFraction: jump / drift / delayed', () => {
    expect(impactFraction('jump', 0, 0)).toBe(0);
    expect(impactFraction('jump', -3, 0)).toBe(0);
    expect(impactFraction('jump', 1, 0)).toBe(JUMP_CURVE[1]);
    expect(impactFraction('jump', JUMP_CURVE.length - 1, 0)).toBe(1);
    expect(impactFraction('jump', 99, 0)).toBe(1);
    let prev = 0;
    for (let k = 1; k <= 12; k++) {
      const f = impactFraction('drift', k, 12);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
    expect(impactFraction('drift', 12, 12)).toBe(1);
    for (let k = 0; k < 7; k++) expect(impactFraction('delayed', k, 7)).toBe(0);
    expect(impactFraction('delayed', 7, 7)).toBe(JUMP_CURVE[1]);
    expect(impactFraction('delayed', 7 + JUMP_CURVE.length, 7)).toBe(1);
    expect(impactPct({ direction: 1, magnitude: 0.01 })).toBeCloseTo(1.01, 2);
    expect(impactPct({ direction: -1, magnitude: 0.01 })).toBeCloseTo(-1, 2);
  });

  const item = (o: Partial<ScheduledNews>): ScheduledNews => ({
    seq: 1,
    tick: 20,
    template: 't',
    role: 'news',
    category: 'crypto',
    headline: 'h',
    body: null,
    explain: 'e',
    impacts: [],
    related: [],
    pair: null,
    ...o,
  });

  it('yol tohum başına deterministik; tick 0 = başlangıç fiyatı', () => {
    const items = buildNewsSchedule(7, 60);
    const a = buildNewsPath('BTCUSD', 81392, 60, 7, items);
    const b = buildNewsPath('BTCUSD', 81392, 60, 7, items);
    expect(a).toEqual(b);
    expect(a).toHaveLength(61);
    expect(a[0]).toBe(81392);
    expect(buildNewsPath('BTCUSD', 81392, 60, 8, items)).not.toEqual(a);
    const sched: NewsSchedule = { v: 1, start: { EURUSD: 1.1, BTCUSD: 81392 }, start_source: {}, items };
    expect([...buildNewsPaths(sched, 60, 7).keys()].sort()).toEqual(['BTCUSD', 'EURUSD']);
  });

  it('etkiler doğru tick\'lerde uygulanır: haber tick\'ine kadar etkisiz, sonra eğri, sonunda tam etki', () => {
    const jump = item({ tick: 20, impacts: [{ instrument: 'BTCUSD', direction: -1, magnitude: 0.03, profile: 'jump', span: 0 }] });
    const drift = item({ seq: 2, tick: 30, impacts: [{ instrument: 'BTCUSD', direction: 1, magnitude: 0.01, profile: 'drift', span: 10 }] });
    const delayed = item({ seq: 3, tick: 42, impacts: [{ instrument: 'XAUUSD', direction: 1, magnitude: 0.005, profile: 'delayed', span: 6 }] });
    const items = [jump, drift, delayed];
    const base = buildNewsPath('BTCUSD', 100, 60, 99, []);
    const withNews = buildNewsPath('BTCUSD', 100, 60, 99, items);
    for (let t = 0; t <= 60; t++) {
      const effect = Math.log(withNews[t] / base[t]);
      expect(effect).toBeCloseTo(cumulativeImpact(items, 'BTCUSD', t), 10);
      if (t <= 20) expect(effect).toBeCloseTo(0, 12);
    }
    expect(Math.log(withNews[21] / base[21])).toBeCloseTo(-0.03 * JUMP_CURVE[1], 10);
    expect(Math.log(withNews[28] / base[28])).toBeCloseTo(-0.03, 10);
    expect(Math.log(withNews[30] / base[30])).toBeCloseTo(-0.03, 10);
    expect(Math.log(withNews[40] / base[40])).toBeCloseTo(-0.02, 10);
    // Altın: 6 tick bekler
    const g0 = buildNewsPath('XAUUSD', 2000, 60, 99, []);
    const g1 = buildNewsPath('XAUUSD', 2000, 60, 99, items);
    for (let t = 0; t < 48; t++) expect(g1[t]).toBeCloseTo(g0[t], 8);
    expect(Math.log(g1[48] / g0[48])).toBeCloseTo(0.005 * JUMP_CURVE[1], 10);
    expect(Math.log(g1[60] / g0[60])).toBeCloseTo(0.005, 10);
  });

  it('etkiler gürültünün belirgin üstünde: orta büyüklükte haber 10 sn\'lik gürültünün ≥ 3 katı', () => {
    for (const code of NEWS_INSTRUMENTS) {
      for (const T of [60, 180, 300]) expect(IMPACT_SIZES[code].m).toBeGreaterThan(3 * tickVol(code, T) * Math.sqrt(10));
    }
  });

  it('istemci biçimi: tur sürerken etkiler / rol / açıklama GİZLİ; bitince açık', () => {
    const items = buildNewsSchedule(5, 180);
    const startsAt = new Date('2026-10-17T10:00:00Z');
    const mid = items[1].tick;
    const live = newsForClient({ v: 1, start: {}, start_source: {}, items }, startsAt, mid, false);
    expect(live.map((n) => n.seq)).toEqual(items.filter((i) => i.tick <= mid).map((i) => i.seq));
    for (const n of live) {
      expect(Object.keys(n).sort()).toEqual(['at', 'body', 'category', 'category_label', 'fictional', 'headline', 'id', 'seq', 'tick'].sort());
      expect(n.fictional).toBe(true);
    }
    expect(JSON.stringify(live)).not.toMatch(/impacts|explain|magnitude|"role"/);
    expect(publicNewsItem(items[0], startsAt).at).toBe(new Date(startsAt.getTime() + items[0].tick * 1000).toISOString());
    const done = newsForClient({ v: 1, start: {}, start_source: {}, items }, startsAt, 0, true);
    expect(done).toHaveLength(items.length);
    const first = revealNewsItem(items[0], startsAt);
    expect(first.explain).toBe(items[0].explain);
    expect(first.impacts![0]).toMatchObject({ instrument: items[0].impacts[0].instrument, pct: impactPct(items[0].impacts[0]) });
    expect(first.impacts![0].direction).toBe(items[0].impacts[0].direction > 0 ? 'up' : 'down');
  });

  it('başlangıç fiyatları: son gerçek kova (EUR/USD = EUR ÷ USD); veri yoksa referans düzey', async () => {
    const db = {
      query: async () => ({
        rows: [
          { asset_type: 'currency', symbol: 'EUR', currency: 'TRY', price: '55.6' },
          { asset_type: 'currency', symbol: 'USD', currency: 'TRY', price: '49.4' },
          { asset_type: 'crypto', symbol: 'BTC', currency: 'USD', price: '81392' },
          { asset_type: 'commodity', symbol: 'GOLD', currency: 'TRY', price: '200000' },
        ],
      }),
    };
    const r = await loadNewsStartPrices(NEWS_INSTRUMENTS, db);
    expect(r.start.EURUSD).toBe(roundTo(55.6 / 49.4, 5));
    expect(r.start.BTCUSD).toBe(81392);
    expect(r.source).toMatchObject({ EURUSD: 'live', BTCUSD: 'live', XAUUSD: 'reference', BRENT: 'reference' });
    expect(r.start.XAUUSD).toBeGreaterThan(0);
    const broken = await loadNewsStartPrices(NEWS_INSTRUMENTS, { query: async () => Promise.reject(new Error('x')) });
    expect(Object.values(broken.source).every((s) => s === 'reference')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// API / sunucu
// ---------------------------------------------------------------------------

describe('Haber Turu: API', () => {
  beforeAll(async () => {
    await seedLatest();
  });

  it('POST /rounds {mode:"news"}: 4 enstrüman, güncel fiyattan başlar, gerçek tarih açıklaması yok; doğrulama', async () => {
    const u = await createUser();
    await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 600, mode: 'news' }).expect(400);
    await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60, mode: 'news', scenario_id: 'abc' }).expect(400);
    await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60, mode: 'bogus' }).expect(400);
    const s = await newsRound(u, 180);
    expect(s.round).toMatchObject({ kind: 'news', mode: 'news', status: 'scheduled', duration_s: 180, ticks_total: 181 });
    expect(s.round.instruments.map((i: any) => i.code)).toEqual(['EURUSD', 'XAUUSD', 'BRENT', 'BTCUSD']);
    expect(s.news).toEqual([]);
    expect(s.quotes.BTCUSD.mid).toBe(LIVE.BTC);
    expect(s.quotes.XAUUSD.mid).toBe(LIVE.GOLD);
    expect(s.quotes.EURUSD.mid).toBe(roundTo(LIVE.EUR / LIVE.USD, 5));
    expect(s.round.reveal).toBeUndefined();
    // Tek aktif tur kuralı (solo / senaryo / haber turu ortak)
    const again = await api().post('/api/arena/rounds').set(u.auth).send({ duration_s: 60, mode: 'news' }).expect(409);
    expect(again.body).toMatchObject({ code: 'ARENA_ROUND_ACTIVE', round_id: s.round.id });
    const active = await api().get('/api/arena/rounds/active').set(u.auth).expect(200);
    expect(active.body.data.round.id).toBe(s.round.id);
    // Başkası göremez
    await api().get(`/api/arena/rounds/${s.round.id}`).set((await createUser()).auth).expect(404);
  });

  it('sunucu otoriter yol: kotasyonlar programdan üretilen yolla aynı; önbellek temizlense de aynı yol', async () => {
    const u = await createUser();
    const s = await newsRound(u);
    await advance(s.round.id, 3 + 25);
    const st = (await api().get(`/api/arena/rounds/${s.round.id}`).set(u.auth).expect(200)).body.data;
    const round = (await loadRound(s.round.id))!;
    expect(round.news?.items.length).toBeGreaterThanOrEqual(3);
    const p1 = roundPaths(round)!;
    clearPathCache();
    const p2 = roundPaths((await loadRound(s.round.id))!)!;
    for (const code of NEWS_INSTRUMENTS) expect(p2.get(code)).toEqual(p1.get(code));
    const tick = st.round.tick;
    const q = quoteAt(getInstrument('BTCUSD')!, p1.get('BTCUSD')![tick]);
    expect(st.quotes.BTCUSD.mid).toBeCloseTo(roundTo(q.mid, 2), 2);
    // Yol = başlangıç × exp(gürültü + haber etkileri)
    const bare = buildNewsPath('BTCUSD', round.news!.start.BTCUSD, round.duration_s, round.seed, []);
    for (let t = 0; t <= 60; t++) expect(Math.log(p1.get('BTCUSD')![t] / bare[t])).toBeCloseTo(cumulativeImpact(round.news!.items, 'BTCUSD', t), 9);
  });

  it('etkiler tur bitene kadar gizli; anlık görüntü geçmiş haberleri içerir; bitince etkiler + "Neden?" gelir', async () => {
    const u = await createUser();
    const s = await newsRound(u);
    const round = (await loadRound(s.round.id))!;
    const items = round.news!.items;
    await advance(s.round.id, 3 + items[1].tick);
    const mid = (await api().get(`/api/arena/rounds/${s.round.id}`).set(u.auth).expect(200)).body.data;
    expect(mid.round.tick).toBeGreaterThanOrEqual(items[1].tick);
    const published = items.filter((i) => i.tick <= mid.round.tick);
    expect(mid.news.map((n: any) => n.seq)).toEqual(published.map((i) => i.seq));
    expect(mid.news[0]).toMatchObject({ headline: items[0].headline, category: items[0].category, fictional: true, tick: items[0].tick });
    const raw = JSON.stringify(mid);
    expect(raw).not.toMatch(/"impacts"|"explain"|"magnitude"|"role"/);
    for (const later of items.filter((i) => i.tick > mid.round.tick)) expect(raw).not.toContain(later.headline);

    await advance(s.round.id, 60);
    const done = (await api().get(`/api/arena/rounds/${s.round.id}`).set(u.auth).expect(200)).body.data;
    expect(done.round.status).toBe('finished');
    expect(done.round.reveal).toBeUndefined();
    expect(done.news).toHaveLength(items.length);
    for (const [k, n] of done.news.entries()) {
      expect(n.role).toBe(items[k].role);
      expect(n.explain).toBe(items[k].explain);
      expect(n.impacts).toHaveLength(items[k].impacts.length);
    }
  });

  describe('SSE', () => {
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
      const req = http.get({ host: '127.0.0.1', port, path: `/api/arena/rounds/${roundId}/stream`, headers: { ...u.auth, Origin: ORIGIN, Accept: 'text/event-stream' } });
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
          setTimeout(() => reject(new Error(`SSE zaman aşımı: ${needle}\n${buffer.slice(-2000)}`)), ms);
        });
      const events = (name: string) =>
        buffer
          .split('\n\n')
          .filter((b) => b.startsWith(`event: ${name}\n`))
          .map((b) => JSON.parse(b.split('\n')[1].slice('data: '.length)));
      return { req, response, until, events };
    }

    it('yeniden bağlanınca geçmiş haberler gelir (etkisiz), yeni haber tam tick\'inde gelir; end olayı etkileri taşır', async () => {
      const u = await createUser();
      const s = await newsRound(u);
      const items = (await loadRound(s.round.id))!.news!.items;
      const second = items[1];
      // İkinci haberden 2 sn önce bağlan: ilk haber geçmişten, ikincisi yayın anında gelir
      await advance(s.round.id, 3 + second.tick - 2);
      const st = openStream(u, s.round.id);
      expect((await st.response).statusCode).toBe(200);
      await st.until(`"seq":${items[0].seq},`);
      await st.until(`"seq":${second.seq},`, 6000);
      const news = st.events('news');
      expect(news.map((n: any) => n.seq).slice(0, 2)).toEqual([items[0].seq, second.seq]);
      for (const n of news) {
        expect(n.fictional).toBe(true);
        expect(n).not.toHaveProperty('impacts');
        expect(n).not.toHaveProperty('explain');
      }
      // İkinci haber, tick'i ≥ haber tick'i olan tick olayından sonra yayımlandı
      const ticks = st.events('tick').map((t: any) => t.tick);
      expect(ticks.some((t: number) => t >= second.tick)).toBe(true);
      st.req.destroy();

      // Son saniyelere sar → end: tüm haberler etkileriyle
      await advance(s.round.id, 60 - second.tick - 1);
      const end = openStream(u, s.round.id);
      await end.until('event: end', 10_000);
      const payload = end.events('end')[0];
      expect(payload.reveal).toBeNull();
      expect(payload.news).toHaveLength(items.length);
      expect(payload.news[0].impacts.length).toBe(items[0].impacts.length);
      expect(typeof payload.news[0].explain).toBe('string');
      end.req.destroy();
    });
  });

  it('yönetici "Haber modu" meydan okuması: herkes aynı haberleri ve aynı fiyat yolunu görür', async () => {
    const admin = await createUser();
    await pool.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [admin.id]);
    const created = await api()
      .post('/api/admin/arena/challenges')
      .set(admin.auth)
      .send({ title: 'Haber Kapışması', starts_at: new Date(Date.now() + 5 * 60_000).toISOString(), duration_s: 120, instruments: ['EURUSD', 'BTCUSD'], mode: 'news' })
      .expect(201);
    const c = created.body.data;
    expect(c).toMatchObject({ mode: 'news', instruments: ['EURUSD', 'XAUUSD', 'BRENT', 'BTCUSD'] });
    const [a, b] = [await createUser(), await createUser()];
    await api().post(`/api/arena/challenges/${c.id}/join`).set(a.auth).expect(200);
    await api().post(`/api/arena/challenges/${c.id}/join`).set(b.auth).expect(200);
    const pre = (await api().get(`/api/arena/rounds/${c.round_id}`).set(a.auth).expect(200)).body.data;
    expect(pre.round).toMatchObject({ kind: 'challenge', mode: 'news', status: 'scheduled' });
    expect(pre.news).toEqual([]);

    await pool.query(`UPDATE arena_challenges SET starts_at = now() - INTERVAL '40 seconds' WHERE id = $1`, [c.id]);
    await pool.query(`UPDATE arena_rounds SET starts_at = now() - INTERVAL '40 seconds', ends_at = now() + INTERVAL '80 seconds' WHERE id = $1`, [c.round_id]);
    expect(await ArenaService.challengesJob()).toBe(1);
    const ra = (await api().get(`/api/arena/rounds/${c.round_id}`).set(a.auth).expect(200)).body.data;
    const rb = (await api().get(`/api/arena/rounds/${c.round_id}`).set(b.auth).expect(200)).body.data;
    expect(ra.round.mode).toBe('news');
    expect(ra.news.length).toBeGreaterThanOrEqual(1);
    expect(rb.news.map((n: any) => n.headline)).toEqual(ra.news.map((n: any) => n.headline));
    expect(rb.history.BTCUSD.slice(0, ra.history.BTCUSD.length - 1)).toEqual(ra.history.BTCUSD.slice(0, rb.history.BTCUSD.length - 1));
    expect(ra.round.reveal).toBeUndefined();
    const listed = (await api().get('/api/arena/challenges?status=live').expect(200)).body.data;
    expect(listed.find((x: any) => x.id === c.id).mode).toBe('news');
  });
});

describe('Haber Turu: ödüller, görev ve koç', () => {
  beforeAll(async () => {
    await seedLatest();
  });

  it('ödül dinleyicisi: haber turu solo gibi XP + jeton; "Bir Haber Turu oyna" görevi ilerler', async () => {
    expect(roundReward('news', { user_id: 'x', return_pct: 1.2, rank: null, trades_count: 1, equity_final: 10120 }, {})).toEqual(
      roundReward('solo', { user_id: 'x', return_pct: 1.2, rank: null, trades_count: 1, equity_final: 10120 }, {})
    );
    const u = await createUserWithQuest('news_play');
    const id = crypto.randomUUID();
    arenaEvents.emit('round_finished', {
      round_id: id,
      kind: 'news',
      mode: 'news',
      finished_at: new Date().toISOString(),
      entries: [{ user_id: u.id, return_pct: 1.2, rank: null, trades_count: 2, equity_final: 10120 }],
    });
    await GameListeners.idle();
    const ledger = await pool.query(`SELECT reason, coins, xp FROM game_ledger WHERE user_id = $1 AND ref_id = $2`, [u.id, id]);
    expect(ledger.rows.map((r: any) => ({ reason: r.reason, coins: Number(r.coins), xp: Number(r.xp) }))).toEqual([{ reason: 'arena_round', coins: 10, xp: 15 + 12 }]);
    const q = await pool.query(`SELECT progress, completed_at FROM game_quests WHERE user_id = $1 AND day = $2::date AND quest_key = 'news_play'`, [u.id, istanbulDay()]);
    expect(q.rows[0].completed_at).toBeTruthy();
  });

  it('uçtan uca: habere hızlı doğru tepki → koç raporunda NEWS_QUICK_REACTION; tur kapanışı ödül verir', async () => {
    const u = await createUser();
    const s = await newsRound(u);
    const items = (await loadRound(s.round.id))!.news!.items;
    const target = items.find((i) => i.role === 'news' && i.impacts.length > 0)!;
    const imp = target.impacts[0];
    await advance(s.round.id, 3 + target.tick + 1);
    const res = await api()
      .post(`/api/arena/rounds/${s.round.id}/positions`)
      .set(u.auth)
      .send({ instrument: imp.instrument, side: imp.direction > 0 ? 'long' : 'short', amount: 1000 })
      .expect(200);
    expect(res.body.data.position.instrument).toBe(imp.instrument);
    await advance(s.round.id, 61);
    expect(await ArenaService.finalizeRound(s.round.id)).toBe(true);
    await GameListeners.idle();
    const report = await CoachService.getReport(s.round.id, u.id);
    expect(report.insights.map((i) => i.code)).toContain('NEWS_QUICK_REACTION');
    const ledger = await pool.query(`SELECT reason FROM game_ledger WHERE user_id = $1 AND ref_id = $2`, [u.id, s.round.id]);
    expect(ledger.rows.map((r: any) => r.reason)).toContain('arena_round');
    const hist = (await api().get('/api/arena/me/history').set(u.auth).expect(200)).body.data;
    expect(hist.items[0]).toMatchObject({ round_id: s.round.id, kind: 'news', trades_count: 1 });
  });
});
