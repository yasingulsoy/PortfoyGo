import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildPriceHistory,
  bucketStart,
  chooseGranularity,
  downsample,
  istanbulDayStart,
  istanbulYearStart,
  type PriceRow,
} from '../src/services/priceHistory';
import { generateSyntheticHistory } from '../src/dev/seed';

// Veritabanı: bellek içi PGlite (uzak veritabanına asla bağlanılmaz). Sorgular sayılır (tek sorgu kontrolü).
const h = vi.hoisted(() => ({ db: null as any, queries: [] as string[] }));
vi.mock('../src/config/database', () => ({
  default: {
    query: async (text: string, params?: unknown[]) => {
      h.queries.push(text);
      const r = await h.db.query(text, params ?? []);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  },
}));

const MIGRATIONS = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter((f) => f.endsWith('.sql')).sort();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const row = (granularity: PriceRow['granularity'], ms: number, price: number): PriceRow => ({
  granularity,
  bucketStart: new Date(ms),
  price,
});

// ---------------------------------------------------------------------------
// Saf fonksiyonlar
// ---------------------------------------------------------------------------

describe('kova yardımcıları (saf)', () => {
  it('m15 / hour kovaları UTC çeyrek saat / saat başıdır', () => {
    const at = new Date('2026-10-08T12:44:59.999Z');
    expect(bucketStart('m15', at).toISOString()).toBe('2026-10-08T12:30:00.000Z');
    expect(bucketStart('hour', at).toISOString()).toBe('2026-10-08T12:00:00.000Z');
  });

  it('day kovası İstanbul gece yarısıdır (UTC+3)', () => {
    expect(bucketStart('day', new Date('2026-10-08T20:59:00Z')).toISOString()).toBe('2026-10-07T21:00:00.000Z');
    expect(bucketStart('day', new Date('2026-10-08T21:00:00Z')).toISOString()).toBe('2026-10-08T21:00:00.000Z');
    expect(istanbulDayStart(new Date('2026-10-08T00:30:00Z')).toISOString()).toBe('2026-10-07T21:00:00.000Z');
  });

  it("YTD başlangıcı İstanbul'a göre 1 Ocak 00:00'dır", () => {
    expect(istanbulYearStart(new Date('2027-01-05T12:00:00Z')).toISOString()).toBe('2026-12-31T21:00:00.000Z');
    // UTC'de hâlâ 31 Aralık ama İstanbul'da 1 Ocak 01:00
    expect(istanbulYearStart(new Date('2026-12-31T22:00:00Z')).toISOString()).toBe('2026-12-31T21:00:00.000Z');
    // UTC 31 Aralık 20:59 → İstanbul 23:59, hâlâ eski yıl
    expect(istanbulYearStart(new Date('2026-12-31T20:59:00Z')).toISOString()).toBe('2025-12-31T21:00:00.000Z');
  });
});

describe('buildPriceHistory / chooseGranularity (saf)', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const t = now.getTime();
  const base = { type: 'stock' as const, symbol: 'AAPL', now, live: null };

  const rows: PriceRow[] = [
    row('day', t - 300 * DAY, 80),
    row('day', t - 20 * DAY, 90),
    row('day', t - 2 * DAY, 95),
    row('hour', t - 6 * DAY, 91),
    row('hour', t - 3 * HOUR, 96),
    row('m15', t - 5 * HOUR, 97),
    row('m15', t - 30 * MIN, 98),
  ];

  it('1D → m15, 1W → hour, diğerleri → day', () => {
    expect(buildPriceHistory(rows, { ...base, range: '1D' }).points.map((p) => p.v)).toEqual([97, 98]);
    expect(buildPriceHistory(rows, { ...base, range: '1W' }).points.map((p) => p.v)).toEqual([91, 96]);
    expect(buildPriceHistory(rows, { ...base, range: '1M' }).points.map((p) => p.v)).toEqual([90, 95]);
    expect(buildPriceHistory(rows, { ...base, range: '1Y' }).points.map((p) => p.v)).toEqual([80, 90, 95]);
    expect(buildPriceHistory(rows, { ...base, range: '1M' }).granularity).toBe('day');
  });

  it('birincil yoğunluk boşsa önce bir ince, sonra bir kaba yoğunluğa düşer', () => {
    const hourly = [row('hour', t - 5 * HOUR, 1), row('hour', t - 2 * HOUR, 2)];
    expect(chooseGranularity(hourly, '1D')).toBe('hour');
    expect(chooseGranularity(hourly, '1M')).toBe('hour');
    const m15AndDay = [row('m15', t - 2 * HOUR, 1), row('m15', t - HOUR, 2), row('day', t - 3 * DAY, 3), row('day', t - 2 * DAY, 4)];
    expect(chooseGranularity(m15AndDay, '1W')).toBe('m15'); // önce ince
    expect(chooseGranularity([row('day', t - 3 * DAY, 3), row('day', t - 2 * DAY, 4)], '1W')).toBe('day'); // sonra kaba
    expect(chooseGranularity([], '1M')).toBeNull();
    const res = buildPriceHistory(hourly, { ...base, range: '1D' });
    expect(res.granularity).toBe('hour');
    expect(res.points.map((p) => p.v)).toEqual([1, 2]);
  });

  it('canlı fiyat son kovadan yeniyse "şimdi" noktası olarak eklenir; değişim ilk→son', () => {
    const res = buildPriceHistory(rows, { ...base, range: '1D', live: { price: 100, currency: 'USD', at: now } });
    expect(res.points.at(-1)).toEqual({ t: t / 1000, v: 100 });
    expect(res.first).toBe(97);
    expect(res.last).toBe(100);
    expect(res.change).toBe(3);
    expect(res.changePercent).toBe(3.09);
    expect(res.currency).toBe('USD');
  });

  it('2 noktadan az veride değişim null olur; hiç veri yoksa boş döner', () => {
    const one = buildPriceHistory([], { ...base, range: '1M', live: { price: 10, currency: 'USD', at: now } });
    expect(one.points).toEqual([{ t: t / 1000, v: 10 }]);
    expect(one.change).toBeNull();
    expect(one.changePercent).toBeNull();
    const none = buildPriceHistory([], { ...base, type: 'currency', symbol: 'EUR', range: 'ALL' });
    expect(none).toMatchObject({ points: [], first: null, last: null, change: null, changePercent: null, granularity: null, currency: 'TRY' });
  });

  it('YTD aralığı İstanbul 1 Ocak 00:00 ve sonrasını içerir', () => {
    const jan5 = new Date('2027-01-05T12:00:00Z');
    const ytdRows = [
      row('day', Date.parse('2026-12-30T21:00:00Z'), 10), // 31 Aralık (İstanbul)
      row('day', Date.parse('2026-12-31T21:00:00Z'), 11), // 1 Ocak (İstanbul)
      row('day', Date.parse('2027-01-03T21:00:00Z'), 12),
    ];
    const res = buildPriceHistory(ytdRows, { ...base, now: jan5, range: 'YTD' });
    expect(res.points.map((p) => p.v)).toEqual([11, 12]);
  });

  it('downsample en fazla 42 nokta döndürür, ilk ve son noktayı korur', () => {
    const values = Array.from({ length: 169 }, (_, i) => i);
    const out = downsample(values, 42);
    expect(out).toHaveLength(42);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(168);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
    expect(downsample([1, 2, 3], 42)).toEqual([1, 2, 3]);
  });
});

describe('generateSyntheticHistory (yerel seed, saf)', () => {
  const now = new Date('2026-10-08T12:07:00Z');

  it('seri tam olarak güncel fiyatta biter ve yoğunluklar tutarlıdır', () => {
    const rows = generateSyntheticHistory('crypto', 'BTC', 118_250, now);
    const by = (g: string) => rows.filter((r) => r.granularity === g).sort((a, b) => +a.bucketStart - +b.bucketStart);
    const [m15, hour, day] = [by('m15'), by('hour'), by('day')];
    expect(m15.at(-1)!.price).toBe(118_250);
    expect(hour.at(-1)!.price).toBe(118_250);
    expect(day.at(-1)!.price).toBe(118_250);
    expect(day.length).toBeGreaterThanOrEqual(400);
    expect(hour.length).toBeGreaterThanOrEqual(15 * 24 - 1);
    expect(m15.length).toBeGreaterThanOrEqual(3 * 96 - 1);
    expect(rows.every((r) => r.price > 0)).toBe(true);
  });

  it('deterministiktir (aynı sembol → aynı seri), farklı sembollerde farklıdır', () => {
    const a = generateSyntheticHistory('stock', 'AAPL', 238.4, now);
    const b = generateSyntheticHistory('stock', 'AAPL', 238.4, now);
    const c = generateSyntheticHistory('stock', 'MSFT', 238.4, now);
    expect(a).toEqual(b);
    expect(a[0].price).not.toBe(c[0].price);
  });
});

// ---------------------------------------------------------------------------
// PGlite ile servis + rotalar
// ---------------------------------------------------------------------------

describe('PriceHistoryService (PGlite)', () => {
  let PriceHistoryService: typeof import('../src/services/priceHistory').PriceHistoryService;
  let providers: typeof import('../src/providers').providers;
  let app: import('express').Express;

  const setMarket = (type: 'stock' | 'crypto', symbol: string, price: number, ageMinutes = 0) =>
    h.db.query(
      `INSERT INTO market_data_cache (asset_type, symbol, name, price, change, change_percent, cached_at, expires_at)
       VALUES ($1, $2, $2, $3, 0, 0, now() - ($4::int * interval '1 minute'), now() + interval '1 hour')
       ON CONFLICT (asset_type, symbol) DO UPDATE SET price = EXCLUDED.price, cached_at = EXCLUDED.cached_at`,
      [type, symbol, price, ageMinutes]
    );
  const setRate = (code: string, selling: number) =>
    h.db.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ($1, $1, $2, $2, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET selling = EXCLUDED.selling, updated_at = CURRENT_TIMESTAMP`,
      [code, selling]
    );
  const insertRows = (type: string, symbol: string, g: string, starts: Date[], prices: number[], currency = 'USD') =>
    h.db.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency)
       SELECT $1, $2, $3, x.bs, x.p, $4 FROM unnest($5::timestamptz[], $6::numeric[]) AS x(bs, p)
       ON CONFLICT DO NOTHING`,
      [type, symbol, g, currency, starts.map((d) => d.toISOString()), prices]
    );
  const countRows = async (where: string, params: unknown[] = []) =>
    (await h.db.query(`SELECT count(*)::int AS n FROM price_history WHERE ${where}`, params)).rows[0].n as number;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    h.db = new PGlite();
    for (const f of MIGRATIONS) {
      await h.db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
    }
    ({ PriceHistoryService } = await import('../src/services/priceHistory'));
    ({ providers } = await import('../src/providers'));
    const { createApp } = await import('../src/app');
    app = createApp();
  }, 60_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await h.db?.close();
  });

  it('snapshotAll üç kovaya yazar, tekrar çalışınca günceller (upsert) ve bayat kaynakları atlar', async () => {
    await setMarket('stock', 'SNAPA', 100);
    await setMarket('crypto', 'SNAPC', 5);
    await setMarket('stock', 'STALE', 50, 2 * 24 * 60); // 2 gün önce
    await setRate('EUR', 51.2);
    await setRate('TRY', 1);
    vi.spyOn(providers.commodities, 'getPopularPrices').mockResolvedValue([
      { code: 'GAU', name: 'Gram Altın', buying: 5000, selling: 5010, changeRate: 0, datetime: '', quoteCurrency: 'TRY', fetchedAt: Date.now() },
      { code: 'SILVER', name: 'Gümüş', buying: 40, selling: 41, changeRate: 0, datetime: '', quoteCurrency: 'USD', fetchedAt: Date.now() },
    ]);

    const now = new Date();
    const first = await PriceHistoryService.snapshotAll(now);
    expect(first.market).toBe(6);
    expect(first.currency).toBe(3);
    expect(first.commodity).toBe(6);

    await setMarket('stock', 'SNAPA', 110);
    await PriceHistoryService.snapshotAll(now);

    const a = await h.db.query(
      `SELECT granularity, bucket_start, price::float AS price, currency FROM price_history WHERE symbol = 'SNAPA' ORDER BY granularity`
    );
    expect(a.rows.map((r: any) => r.granularity)).toEqual(['day', 'hour', 'm15']);
    expect(a.rows.every((r: any) => r.price === 110 && r.currency === 'USD')).toBe(true);
    expect(new Date(a.rows.find((r: any) => r.granularity === 'day').bucket_start).toISOString()).toBe(
      istanbulDayStart(now).toISOString()
    );

    expect(await countRows(`symbol = 'STALE'`)).toBe(0);
    expect(await countRows(`asset_type = 'currency' AND symbol = 'TRY'`)).toBe(0);
    const cur = await h.db.query(`SELECT DISTINCT symbol, currency FROM price_history WHERE asset_type IN ('currency', 'commodity') ORDER BY symbol`);
    expect(cur.rows).toEqual([
      { symbol: 'EUR', currency: 'TRY' },
      { symbol: 'GAU', currency: 'TRY' },
      { symbol: 'SILVER', currency: 'USD' },
    ]);
  });

  it("price_history'den okunmuş emtia fiyatları (fromHistory) tabloya geri yazılmaz — bayat fiyat tazelenmez", async () => {
    vi.spyOn(providers.commodities, 'getPopularPrices').mockResolvedValue([
      { code: 'HISTX', name: 'Tablo', buying: 10, selling: 10, changeRate: 0, datetime: '', quoteCurrency: 'USD', fetchedAt: Date.now(), fromHistory: true },
      { code: 'LIVEX', name: 'Canlı', buying: 20, selling: 20, changeRate: 0, datetime: '', quoteCurrency: 'USD', fetchedAt: Date.now() },
    ]);
    const res = await PriceHistoryService.snapshotAll(new Date());
    expect(res.commodity).toBe(3);
    expect(await countRows(`symbol = 'HISTX'`)).toBe(0);
    expect(await countRows(`symbol = 'LIVEX'`)).toBe(3);
  });

  it('emtia kaynağı hata verirse diğer kaynaklar yine yazılır', async () => {
    vi.spyOn(providers.commodities, 'getPopularPrices').mockRejectedValue(new Error('kota'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await PriceHistoryService.snapshotAll(new Date());
    expect(res.market).toBeGreaterThan(0);
    expect(res.commodity).toBe(0);
  });

  it('m15 3 günden, hour 15 günden eski satırları budar; day kalıcıdır', async () => {
    const now = new Date();
    const old = (d: number) => [bucketStart('m15', new Date(now.getTime() - d * DAY))];
    await insertRows('stock', 'PRUNE', 'm15', old(4), [1]);
    await insertRows('stock', 'PRUNE', 'm15', old(2), [1]);
    await insertRows('stock', 'PRUNE', 'hour', old(16), [1]);
    await insertRows('stock', 'PRUNE', 'hour', old(10), [1]);
    await insertRows('stock', 'PRUNE', 'day', old(100), [1]);
    const removed = await PriceHistoryService.prune(now);
    expect(removed).toBeGreaterThanOrEqual(2);
    const left = await h.db.query(`SELECT granularity, count(*)::int AS n FROM price_history WHERE symbol = 'PRUNE' GROUP BY 1 ORDER BY 1`);
    expect(left.rows).toEqual([
      { granularity: 'day', n: 1 },
      { granularity: 'hour', n: 1 },
      { granularity: 'm15', n: 1 },
    ]);
  });

  it('getHistory: aralık yoğunluğu, yedek yoğunluk ve canlı nokta', async () => {
    const now = new Date();
    const days = Array.from({ length: 40 }, (_, i) => istanbulDayStart(new Date(now.getTime() - (40 - i) * DAY)));
    await insertRows('stock', 'HIST', 'day', days, days.map((_, i) => 100 + i));
    await setMarket('stock', 'HIST', 150);

    const m = await PriceHistoryService.getHistory('stock', 'hist', '1M', now);
    expect(m.symbol).toBe('HIST');
    expect(m.granularity).toBe('day');
    expect(m.currency).toBe('USD');
    expect(m.points.at(-1)).toEqual({ t: Math.floor(now.getTime() / 1000), v: 150 });
    expect(m.points.length).toBeGreaterThanOrEqual(30);
    expect(m.points.every((p, i, arr) => i === 0 || p.t > arr[i - 1].t)).toBe(true);
    expect(m.change).toBeCloseTo(150 - m.first!, 6);

    // 1W: saatlik / m15 yok → aralıktaki günlük noktalara düşer
    const w = await PriceHistoryService.getHistory('stock', 'HIST', '1W', now);
    expect(w.granularity).toBe('day');
    expect(w.points.length).toBeGreaterThanOrEqual(7);
    expect(w.last).toBe(150);

    // 1D: son 24 saatte hiç kova yok → sadece canlı nokta, değişim null
    const d = await PriceHistoryService.getHistory('stock', 'HIST', '1D', now);
    expect(d.points).toEqual([{ t: Math.floor(now.getTime() / 1000), v: 150 }]);
    expect(d.change).toBeNull();
  });

  it('getHistory YTD: İstanbul yıl başından itibaren', async () => {
    const now = new Date('2027-01-05T12:00:00Z');
    await insertRows(
      'currency',
      'YTDX',
      'day',
      [new Date('2026-12-30T21:00:00Z'), new Date('2026-12-31T21:00:00Z'), new Date('2027-01-02T21:00:00Z')],
      [10, 11, 12],
      'TRY'
    );
    const res = await PriceHistoryService.getHistory('currency', 'YTDX', 'YTD', now);
    expect(res.points.map((p) => p.v)).toEqual([11, 12]);
    expect(res.currency).toBe('TRY');
    expect(res.changePercent).toBe(9.09);
  });

  it('getPerformance: yeterince eski nokta yoksa null; varsa canlı fiyata göre yüzde', async () => {
    const now = new Date();
    const days = Array.from({ length: 12 }, (_, i) => istanbulDayStart(new Date(now.getTime() - (12 - i) * DAY)));
    await insertRows('stock', 'PERF', 'day', days, days.map(() => 80));
    await setMarket('stock', 'PERF', 100);
    const perf = await PriceHistoryService.getPerformance('stock', 'PERF', now);
    expect(perf['1W']).toBe(25);
    expect(perf['1M']).toBeNull();
    expect(perf['3M']).toBeNull();
    expect(perf['6M']).toBeNull();
    expect(perf['1Y']).toBeNull();

    const none = await PriceHistoryService.getPerformance('stock', 'NOPE', now);
    expect(Object.values(none).every((v) => v === null)).toBe(true);
    expect(Object.keys(none)).toEqual(['1W', '1M', '3M', '6M', 'YTD', '1Y']);
  });

  it('getPerformance: canlı fiyat yoksa son kayıtlı fiyat kullanılır; YTD önceki yılın kapanışına göre', async () => {
    const now = new Date('2027-01-10T12:00:00Z');
    await insertRows(
      'stock',
      'PERFY',
      'day',
      [new Date('2026-12-30T21:00:00Z'), new Date('2027-01-01T21:00:00Z'), new Date('2027-01-09T21:00:00Z')],
      [50, 55, 60]
    );
    const perf = await PriceHistoryService.getPerformance('stock', 'PERFY', now);
    expect(perf.YTD).toBe(20); // 31 Aralık kapanışı 50 → 60
    expect(perf['1W']).toBe(9.09); // hedef 3 Ocak 15:00 → son tam gün 2 Ocak kapanışı 55 → 60
    expect(perf['1M']).toBeNull();
  });

  it('getSparklines: tek sorgu, ≤ 42 nokta, verisi olmayan varlık boş dizi', async () => {
    const now = new Date();
    const hours = (n: number) => Array.from({ length: n }, (_, i) => bucketStart('hour', new Date(now.getTime() - (n - 1 - i) * HOUR)));
    await insertRows('stock', 'SPA', 'hour', hours(169), Array.from({ length: 169 }, (_, i) => 100 + i));
    await insertRows('crypto', 'SPB', 'hour', hours(10), Array.from({ length: 10 }, (_, i) => 1 + i));
    await insertRows('stock', 'SPA', 'hour', [new Date(now.getTime() - 9 * DAY)], [1]); // 7 günden eski → dahil değil

    h.queries.length = 0;
    const data = await PriceHistoryService.getSparklines(
      [
        { type: 'stock', symbol: 'SPA' },
        { type: 'crypto', symbol: 'spb' },
        { type: 'stock', symbol: 'SPA' },
        { type: 'currency', symbol: 'NONE' },
      ],
      now
    );
    expect(h.queries).toHaveLength(1);
    expect(h.queries[0]).toMatch(/unnest/);
    expect(Object.keys(data).sort()).toEqual(['crypto:SPB', 'currency:NONE', 'stock:SPA']);
    expect(data['stock:SPA'].length).toBe(42);
    expect(data['stock:SPA'][0]).toBeGreaterThan(1);
    expect(data['stock:SPA'].at(-1)).toBe(268);
    expect(data['crypto:SPB']).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(data['currency:NONE']).toEqual([]);
  });

  describe('rotalar', () => {
    it.each([
      ['/api/market/history?type=bond&symbol=AAPL&range=1M'],
      ['/api/market/history?symbol=AAPL&range=1M'],
      ['/api/market/history?type=stock&symbol=AA%20PL&range=1M'],
      ['/api/market/history?type=stock&symbol=ABCDEFGHIJKLMNOPQRSTU&range=1M'],
      ['/api/market/history?type=stock&symbol=A%2FB&range=1M'],
      ['/api/market/history?type=stock&symbol=AAPL&range=2Y'],
      ['/api/market/history?type=stock&symbol=AAPL&range=1M&range=1Y'],
      ['/api/market/performance?type=stock'],
      ['/api/market/performance?type=fx&symbol=USD'],
      ['/api/market/sparklines'],
      ['/api/market/sparklines?items='],
      ['/api/market/sparklines?items=stock-AAPL'],
      ['/api/market/sparklines?items=foo:AAPL'],
      ['/api/market/sparklines?items=stock:A$B'],
    ])('400: %s', async (url) => {
      const res = await request(app).get(url);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('sparklines: 60 varlıktan fazlası 400, tekrarlar tekilleştirilir', async () => {
      const many = Array.from({ length: 61 }, (_, i) => `stock:S${i}`).join(',');
      expect((await request(app).get(`/api/market/sparklines?items=${many}`)).status).toBe(400);
      const dup = Array.from({ length: 80 }, () => 'stock:SPA').join(',');
      const ok = await request(app).get(`/api/market/sparklines?items=${dup},crypto:spb`);
      expect(ok.status).toBe(200);
      expect(Object.keys(ok.body.data).sort()).toEqual(['crypto:SPB', 'stock:SPA']);
      expect(ok.headers['cache-control']).toBe('public, max-age=60');
    });

    it('history / performance: 200, küçük harf sembol ve aralık kabul edilir, önbellek başlığı', async () => {
      const hist = await request(app).get('/api/market/history?type=stock&symbol=hist&range=1m');
      expect(hist.status).toBe(200);
      expect(hist.headers['cache-control']).toBe('public, max-age=60');
      expect(hist.body.data).toMatchObject({ symbol: 'HIST', type: 'stock', range: '1M', currency: 'USD' });
      expect(Object.keys(hist.body.data)).toEqual(
        expect.arrayContaining(['symbol', 'type', 'currency', 'points', 'first', 'last', 'change', 'changePercent'])
      );

      const perf = await request(app).get('/api/market/performance?type=stock&symbol=PERF');
      expect(perf.status).toBe(200);
      expect(perf.headers['cache-control']).toBe('public, max-age=60');
      expect(perf.body.data['1W']).toBe(25);
    });
  });
});

describe('seedMarketData (PGlite, yerel tohum)', () => {
  it('yeni sembolleri ekler; simülasyon değerini korur, eski düzeyi güncel tohuma çeker', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
      for (const f of MIGRATIONS) {
        await db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
      }
      const fakePool: any = {
        query: async (text: string, params?: unknown[]) => {
          const r = await db.query(text, params ?? []);
          return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
        },
      };
      const { seedMarketData, MARKET_SEED, CURRENCY_SEED } = await import('../src/dev/seed');
      await seedMarketData(fakePool);
      const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM market_data_cache`);
      expect(n.rows[0].n).toBe(MARKET_SEED.length);
      expect(MARKET_SEED.filter((m) => m.asset_type === 'stock').length).toBeGreaterThanOrEqual(30);
      expect(MARKET_SEED.filter((m) => m.asset_type === 'crypto').length).toBe(50);

      const btc = MARKET_SEED.find((m) => m.symbol === 'BTC')!.price;
      const usd = CURRENCY_SEED.find((c) => c.code === 'USD')!.selling;
      // ETH simülasyonla biraz oynamış (korunur), BTC ve USD eski tohum düzeyinde (yeniden çapalanır)
      await db.query(`UPDATE market_data_cache SET price = price * 1.03 WHERE symbol = 'ETH'`);
      await db.query(`UPDATE market_data_cache SET price = $1 WHERE symbol = 'BTC'`, [btc * 1.45]);
      await db.query(`UPDATE currency_rates SET selling = $1, buying = $1 WHERE code = 'USD'`, [usd * 0.85]);
      await db.query(`UPDATE currency_rates SET selling = selling * 1.02 WHERE code = 'EUR'`);
      await seedMarketData(fakePool);

      const price = async (sym: string) =>
        (await db.query<{ p: number }>(`SELECT price::float AS p FROM market_data_cache WHERE symbol = $1`, [sym])).rows[0].p;
      const rate = async (code: string) =>
        (await db.query<{ s: number }>(`SELECT selling::float AS s FROM currency_rates WHERE code = $1`, [code])).rows[0].s;
      expect(await price('BTC')).toBe(btc);
      expect(await price('ETH')).toBeCloseTo(MARKET_SEED.find((m) => m.symbol === 'ETH')!.price * 1.03, 6);
      expect(await rate('USD')).toBe(usd);
      expect(await rate('EUR')).toBeCloseTo(CURRENCY_SEED.find((c) => c.code === 'EUR')!.selling * 1.02, 6);
    } finally {
      await db.close();
    }
  }, 60_000);
});

describe('seedPriceHistory (PGlite, idempotent)', () => {
  it('önbellekteki varlıklar için geçmiş üretir, ikinci çalıştırmada atlar', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
      for (const f of MIGRATIONS) {
        await db.exec(fs.readFileSync(path.resolve(__dirname, '../migrations', f), 'utf8'));
      }
      const fakePool: any = {
        query: async (text: string, params?: unknown[]) => {
          const r = await db.query(text, params ?? []);
          return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
        },
      };
      await db.query(
        `INSERT INTO market_data_cache (asset_type, symbol, name, price, change, change_percent, cached_at, expires_at)
         VALUES ('stock', 'AAPL', 'Apple', 238.4, 0, 0, now(), now() + interval '1 hour')`
      );
      await db.query(`INSERT INTO currency_rates (code, name, buying, selling) VALUES ('USD', 'Dolar', 43.8, 43.96), ('TRY', 'TL', 1, 1)`);

      const { seedPriceHistory } = await import('../src/dev/seed');
      const now = new Date();
      const first = await seedPriceHistory(fakePool, now);
      expect(first.seeded.sort()).toEqual(['currency:USD', 'stock:AAPL']);
      const last = await db.query<{ price: number }>(
        `SELECT price::float AS price FROM price_history WHERE symbol = 'AAPL' AND granularity = 'day' ORDER BY bucket_start DESC LIMIT 1`
      );
      expect(last.rows[0].price).toBe(238.4);

      const second = await seedPriceHistory(fakePool, now);
      expect(second.seeded).toEqual([]);
      expect(second.rebased).toEqual([]);
      expect(second.skipped).toBe(2);
      expect(second.rows).toBe(0);

      // Güncel fiyat eski sentetik düzeyden %25'ten fazla saptı (ör. canlı fiyat geldi): geçmiş yeniden çapalanır
      await db.query(`UPDATE market_data_cache SET price = 400 WHERE symbol = 'AAPL'`);
      const third = await seedPriceHistory(fakePool, now);
      expect(third.rebased).toEqual(['stock:AAPL']);
      expect(third.seeded).toEqual(['stock:AAPL']);
      const rebased = await db.query<{ price: number }>(
        `SELECT price::float AS price FROM price_history WHERE symbol = 'AAPL' AND granularity = 'day' ORDER BY bucket_start DESC LIMIT 1`
      );
      expect(rebased.rows[0].price).toBe(400);
      // Döviz daha sıkı eşikle (%10): 43,96 → 49,45
      await db.query(`UPDATE currency_rates SET selling = 49.45 WHERE code = 'USD'`);
      expect((await seedPriceHistory(fakePool, now)).rebased).toEqual(['currency:USD']);
    } finally {
      await db.close();
    }
  }, 60_000);
});
