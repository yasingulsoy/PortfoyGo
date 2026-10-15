import crypto from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createUser, pool, TestUser } from './helpers';
import { ScenarioRepository, SCENARIO_MAX_POINTS } from '../src/services/scenarios/repository';
import { clearScenarioColumnCache } from '../src/services/scenarios/service';

// Paylaşılan PGlite (test/globalSetup.ts). Seri kodları her test dosyası çalışmasında benzersizdir.

const HOUR = 3_600_000;
const T0 = Date.parse('2008-09-01T00:00:00Z');
const uid = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const iso = (ms: number) => new Date(ms).toISOString();

let admin: TestUser;
let user: TestUser;

async function makeAdmin(): Promise<TestUser> {
  const u = await createUser();
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [u.id]);
  return u;
}

/** n saatlik nokta: [iso, fiyat] */
function hourlyRows(n: number, start = T0, base = 100): [string, number][] {
  return Array.from({ length: n }, (_, i) => [iso(start + i * HOUR), Number((base * (1 + 0.01 * Math.sin(i / 3))).toFixed(4))]);
}

async function importSeries(code: string, rows: unknown[], extra: Record<string, unknown> = {}) {
  return api()
    .post('/api/admin/arena/series/import')
    .set(admin.auth)
    .send({ series_code: code, label: `Test ${code}`, currency: 'USD', source: 'Test kaynağı', license_note: 'Test lisansı', rows, ...extra });
}

function scenarioBody(seriesCode: string, extra: Record<string, unknown> = {}) {
  return {
    title: `2008 Krizi ${uid()}`,
    description: 'Lehman haftası',
    briefing: 'Piyasalar gergin…',
    debrief: 'Gerçekte ne oldu…',
    difficulty: 'zor',
    instruments: [{ code: 'BTCUSD', label: 'Bitcoin', series_code: seriesCode }],
    window_from: iso(T0),
    window_to: iso(T0 + 29 * HOUR),
    ...extra,
  };
}

beforeAll(async () => {
  admin = await makeAdmin();
  user = await createUser();
});

describe('admin scenario API — auth', () => {
  it('requires a session (401) and admin rights (403)', async () => {
    expect((await api().get('/api/admin/arena/series')).status).toBe(401);
    expect((await api().get('/api/admin/arena/scenarios')).status).toBe(401);
    expect((await api().post('/api/admin/arena/series/import').send({})).status).toBe(401);
    const asUser = [
      api().get('/api/admin/arena/series').set(user.auth),
      api().get('/api/admin/arena/series/ABC/preview').set(user.auth),
      api().delete('/api/admin/arena/series/ABC').set(user.auth),
      api().post('/api/admin/arena/series/import').set(user.auth).send({ series_code: 'ABC' }),
      api().get('/api/admin/arena/scenarios').set(user.auth),
      api().post('/api/admin/arena/scenarios').set(user.auth).send({}),
      api().patch(`/api/admin/arena/scenarios/${crypto.randomUUID()}`).set(user.auth).send({ title: 'x' }),
      api().delete(`/api/admin/arena/scenarios/${crypto.randomUUID()}`).set(user.auth),
      api().post(`/api/admin/arena/scenarios/${crypto.randomUUID()}/publish`).set(user.auth).send({ published: true }),
    ];
    for (const res of await Promise.all(asUser)) expect(res.status).toBe(403);
  });

  it('cookie-authenticated writes need the CSRF header', async () => {
    const res = await api()
      .post('/api/admin/arena/series/import')
      .set('Cookie', `pg_session=${admin.token}`)
      .send({ series_code: 'CSRF_TEST', label: 'x', currency: 'USD', source: 'abc', license_note: 'abc', rows: hourlyRows(3) });
    expect(res.status).toBe(403);
  });

  it('does not affect the existing arena challenge admin routes', async () => {
    expect((await api().get('/api/admin/arena/challenges').set(admin.auth)).status).toBe(200);
    expect((await api().get('/api/admin/arena/challenges').set(user.auth)).status).toBe(403);
  });
});

describe('admin series import', () => {
  it('imports CSV (Turkish decimals, semicolons), reports rejected rows and writes an audit entry', async () => {
    const code = `CSV_${uid()}`;
    const csv = ['Tarih;Kapanış', '01.09.2008;1.234,5', '02.09.2008;1.240,25', '03.09.2008;abc', 'xx;1', '04.09.2008;1.250'].join('\n');
    const res = await api()
      .post('/api/admin/arena/series/import')
      .set(admin.auth)
      .send({ series_code: code.toLowerCase(), label: 'Test', currency: 'USD', source: 'Lisanslı veri sağlayıcı', license_note: 'Eğitim amaçlı lisans', csv });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      series_code: code,
      points: 3,
      imported: 3,
      from: '2008-09-01T00:00:00.000Z',
      to: '2008-09-04T00:00:00.000Z',
      rejected_rows: 2,
      replaced: false,
    });
    expect(res.body.data.rejected_samples).toHaveLength(2);
    const audit = await pool.query(`SELECT metadata FROM admin_audit_log WHERE action = 'scenario.series_import' AND target_id = $1`, [code]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].metadata).toMatchObject({ format: 'csv', imported: 3, rejected_rows: 2 });
  });

  it('upserts on re-import and replaces with replace=true', async () => {
    const code = `UPS_${uid()}`;
    expect((await importSeries(code, hourlyRows(5))).body.data.points).toBe(5);
    const more = await importSeries(code, hourlyRows(8, T0 + 3 * HOUR, 200));
    expect(more.body.data).toMatchObject({ points: 11, imported: 8 });
    const price = await pool.query('SELECT price FROM historical_series WHERE series_code = $1 AND ts = $2', [code, iso(T0 + 3 * HOUR)]);
    expect(parseFloat(price.rows[0].price)).toBe(200);
    const rep = await importSeries(code, hourlyRows(2, T0 + 100 * HOUR), { replace: true });
    expect(rep.body.data).toMatchObject({ points: 2, imported: 2, replaced: true, from: iso(T0 + 100 * HOUR) });
  });

  it('accepts bodies far above the 50 KB global JSON limit (up to 10 MB)', async () => {
    const code = `BIG_${uid()}`;
    const csv = ['date,open,high,low,close', ...hourlyRows(3000).map(([t, p]) => `${t},${p},${p},${p},${p}`)].join('\n');
    expect(csv.length).toBeGreaterThan(150_000);
    const res = await api()
      .post('/api/admin/arena/series/import')
      .set(admin.auth)
      .send({ series_code: code, label: 'Büyük', currency: 'USD', source: 'Test kaynağı', license_note: 'Test lisansı', csv });
    expect(res.status).toBe(201);
    expect(res.body.data.points).toBe(3000);
  });

  it('validates the request', async () => {
    const base = { series_code: 'VALID_CODE', label: 'x', currency: 'USD', source: 'abc', license_note: 'abc' };
    const post = (body: Record<string, unknown>) => api().post('/api/admin/arena/series/import').set(admin.auth).send(body);
    expect((await post({ ...base })).status).toBe(400); // rows/csv yok
    expect((await post({ ...base, rows: hourlyRows(3), csv: 'a,b' })).status).toBe(400); // ikisi birden
    expect((await post({ ...base, series_code: 'ab', rows: hourlyRows(3) })).status).toBe(400);
    expect((await post({ ...base, series_code: 'BAD-CODE', rows: hourlyRows(3) })).status).toBe(400);
    expect((await post({ ...base, currency: 'EUR', rows: hourlyRows(3) })).status).toBe(400);
    expect((await post({ ...base, license_note: '', rows: hourlyRows(3) })).status).toBe(400);
    expect((await post({ ...base, source: undefined, rows: hourlyRows(3) })).status).toBe(400);
    const none = await post({ ...base, rows: [['x', 1], ['2020-01-01', -1]] });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('NO_VALID_ROWS');
    const noCols = await post({ ...base, csv: 'foo,bar\n1,2' });
    expect(noCols.status).toBe(400);
    expect(noCols.body.code).toBe('NO_COLUMNS');
    const many = await post({ ...base, rows: new Array(100_001).fill([1, 1]) });
    expect(many.status).toBe(400);
    expect(many.body.code).toBe('TOO_MANY_ROWS');
    const exists = await pool.query(`SELECT 1 FROM historical_series_meta WHERE series_code = 'VALID_CODE'`);
    expect(exists.rows).toHaveLength(0);
  });

  it('lists series and previews a downsampled, ascending series', async () => {
    const code = `PRV_${uid()}`;
    await importSeries(code, hourlyRows(1000));
    const list = await api().get('/api/admin/arena/series').set(admin.auth);
    expect(list.status).toBe(200);
    const item = list.body.data.items.find((x: any) => x.series_code === code);
    expect(item).toMatchObject({ series_code: code, currency: 'USD', source: 'Test kaynağı', license_note: 'Test lisansı', points: 1000, from: iso(T0) });
    expect(item.imported_at).toBeTruthy();
    expect(item.used_by).toEqual([]);

    const prev = await api().get(`/api/admin/arena/series/${code}/preview?limit=100`).set(admin.auth);
    expect(prev.status).toBe(200);
    expect(prev.body.data.total).toBe(1000);
    const pts = prev.body.data.points;
    expect(pts.length).toBeLessThanOrEqual(100);
    expect(pts[0]).toEqual({ t: T0 / 1000, p: expect.any(Number) });
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
    expect((await api().get(`/api/admin/arena/series/${code}/preview`).set(admin.auth)).body.data.points.length).toBeLessThanOrEqual(500);
    expect((await api().get('/api/admin/arena/series/NOPE_NOPE/preview').set(admin.auth)).status).toBe(404);
  });
});

describe('admin scenarios', () => {
  let code: string;
  let dense: string;

  beforeAll(async () => {
    code = `SCN_${uid()}`;
    dense = `DNS_${uid()}`;
    await importSeries(code, hourlyRows(30));
    // 1000 nokta, pencere içinde (dakikalık değil: 6 dakikada bir)
    const rows = Array.from({ length: 1000 }, (_, i) => [iso(T0 + i * 6 * 60_000), 50 + i / 100]);
    await importSeries(dense, rows);
  });

  it('validates window coverage, currencies and instruments', async () => {
    const post = (body: Record<string, unknown>) => api().post('/api/admin/arena/scenarios').set(admin.auth).send(body);
    const uncovered = await post(scenarioBody(code, { window_to: iso(T0 + 60 * HOUR) }));
    expect(uncovered.status).toBe(400);
    expect(uncovered.body.code).toBe('WINDOW_NOT_COVERED');

    const few = `FEW_${uid()}`;
    await importSeries(few, hourlyRows(10));
    const tooFew = await post(scenarioBody(few, { window_to: iso(T0 + 9 * HOUR) }));
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.message).toMatch(/en az 20/);

    expect((await post(scenarioBody('MISSING_SERIES'))).body.code).toBe('SERIES_NOT_FOUND');

    const tryCode = `TRY_${uid()}`;
    await importSeries(tryCode, hourlyRows(30), { currency: 'TRY' });
    expect((await post(scenarioBody(tryCode))).body.code).toBe('CURRENCY_MISMATCH');

    expect((await post(scenarioBody(code, { instruments: [{ code: 'DOGEUSD', label: 'x', series_code: code }] }))).status).toBe(400);
    expect(
      (
        await post(
          scenarioBody(code, {
            instruments: [
              { code: 'BTCUSD', label: 'a', series_code: code },
              { code: 'BTCUSD', label: 'b', series_code: code },
            ],
          })
        )
      ).status
    ).toBe(400);
    expect((await post(scenarioBody(code, { window_from: iso(T0 + 29 * HOUR), window_to: iso(T0) }))).status).toBe(400);
    expect((await post(scenarioBody(code, { difficulty: 'çok zor' }))).status).toBe(400);
    expect((await post(scenarioBody(code, { title: 'ab' }))).status).toBe(400);
    expect((await post(scenarioBody(code, { instruments: [] }))).status).toBe(400);
  });

  it('create → publish → public list → repository window → unpublish → delete', async () => {
    const created = await api()
      .post('/api/admin/arena/scenarios')
      .set(admin.auth)
      .send(
        scenarioBody(code, {
          title: 'Lehman Haftası',
          instruments: [
            { code: 'btcusd', label: 'Bitcoin', series_code: code },
            { code: 'XAUUSD', series_code: dense },
          ],
          window_to: iso(T0 + 29 * HOUR),
        })
      );
    expect(created.status).toBe(201);
    const s = created.body.data;
    expect(s).toMatchObject({
      title: 'Lehman Haftası',
      difficulty: 'zor',
      published: false,
      synthetic: false,
      plays: 0,
      window_from: iso(T0),
      window_to: iso(T0 + 29 * HOUR),
      instruments: [
        { code: 'BTCUSD', label: 'Bitcoin', series_code: code },
        { code: 'XAUUSD', label: 'Altın', series_code: dense },
      ],
    });
    expect(s.slug).toMatch(/^lehman-haftasi/);
    expect((await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'scenario.create' AND target_id = $1`, [s.id])).rows).toHaveLength(1);

    // Yayında değil → herkese açık listede yok, depo null (önizleme seçeneğiyle dolu)
    let pub = await api().get('/api/arena/scenarios');
    expect(pub.body.data.some((x: any) => x.id === s.id)).toBe(false);
    expect(await ScenarioRepository.loadScenarioWindow(s.id)).toBeNull();
    expect(await ScenarioRepository.loadScenarioWindow(s.id, { includeUnpublished: true })).not.toBeNull();

    const published = await api().post(`/api/admin/arena/scenarios/${s.id}/publish`).set(admin.auth).send({ published: true });
    expect(published.status).toBe(200);
    expect(published.body.data.published).toBe(true);

    pub = await api().get('/api/arena/scenarios');
    const item = pub.body.data.find((x: any) => x.id === s.id);
    expect(item).toEqual({
      id: s.id,
      slug: s.slug,
      title: 'Lehman Haftası',
      description: 'Lehman haftası',
      difficulty: 'zor',
      instruments: [
        { code: 'BTCUSD', label: 'Bitcoin' },
        { code: 'XAUUSD', label: 'Altın' },
      ],
      synthetic: false,
      plays: 0,
      my_best_return_pct: null,
    });
    const detail = await api().get(`/api/arena/scenarios/${s.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: s.id, briefing: 'Piyasalar gergin…', debrief: null });

    // Depo: ≤ 400 nokta, artan, unix saniye
    const win = (await ScenarioRepository.loadScenarioWindow(s.id))!;
    expect(win.meta).toMatchObject({ id: s.id, title: 'Lehman Haftası', briefing: 'Piyasalar gergin…', debrief: 'Gerçekte ne oldu…', synthetic: false });
    expect(Object.keys(win.window).sort()).toEqual(['BTCUSD', 'XAUUSD']);
    expect(win.window.BTCUSD.points).toHaveLength(30);
    expect(win.window.BTCUSD.from).toBe(iso(T0));
    expect(win.window.BTCUSD.to).toBe(iso(T0 + 29 * HOUR));
    const xau = win.window.XAUUSD.points;
    // dense: pencere (29 saat) içinde 291 nokta → seyreltme yok; tüm seri için ayrı kontrol aşağıda
    expect(xau.length).toBeLessThanOrEqual(SCENARIO_MAX_POINTS);
    for (const spec of Object.values(win.window)) {
      for (let i = 1; i < spec.points.length; i++) expect(spec.points[i].t).toBeGreaterThan(spec.points[i - 1].t);
      expect(Number.isInteger(spec.points[0].t)).toBe(true);
      expect(spec.points[0].t).toBeLessThan(1e11);
    }
    expect(await ScenarioRepository.loadScenarioWindow(s.slug)).not.toBeNull();
    expect(await ScenarioRepository.loadScenarioWindow('not-a-scenario')).toBeNull();
    expect(await ScenarioRepository.loadScenarioWindow(crypto.randomUUID())).toBeNull();

    // Yayındaki senaryonun serisi silinemez / bozulamaz
    const del = await api().delete(`/api/admin/arena/series/${code}`).set(admin.auth);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('SERIES_IN_USE');
    const breaking = await importSeries(code, hourlyRows(5), { replace: true });
    expect(breaking.status).toBe(409);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM historical_series WHERE series_code = $1', [code])).rows[0].n).toBe(30);
    const list = await api().get('/api/admin/arena/series').set(admin.auth);
    expect(list.body.data.items.find((x: any) => x.series_code === code).used_by).toEqual([{ id: s.id, title: 'Lehman Haftası', published: true }]);

    // Güncelleme
    const patched = await api().patch(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth).send({ title: 'Lehman Haftası 2008', difficulty: 'orta' });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ title: 'Lehman Haftası 2008', difficulty: 'orta', description: 'Lehman haftası', slug: s.slug });
    const badWindow = await api().patch(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth).send({ window_to: iso(T0 + 80 * HOUR) });
    expect(badWindow.status).toBe(400);
    expect((await api().patch(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth).send({})).status).toBe(400);
    const cleared = await api().patch(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth).send({ description: null });
    expect(cleared.body.data.description).toBeNull();
    expect((await pool.query(`SELECT metadata FROM admin_audit_log WHERE action = 'scenario.update' AND target_id = $1`, [s.id])).rows.length).toBe(2);

    // Yayından kaldır → seri silinebilir → yeniden yayınlama doğrulamada başarısız
    expect((await api().post(`/api/admin/arena/scenarios/${s.id}/publish`).set(admin.auth).send({ published: false })).body.data.published).toBe(false);
    expect((await api().delete(`/api/admin/arena/series/${code}`).set(admin.auth)).status).toBe(200);
    const republish = await api().post(`/api/admin/arena/scenarios/${s.id}/publish`).set(admin.auth).send({ published: true });
    expect(republish.status).toBe(409);
    expect(republish.body.code).toBe('SCENARIO_INVALID');
    expect((await api().post(`/api/admin/arena/scenarios/${s.id}/publish`).set(admin.auth).send({ published: 'yes' })).status).toBe(400);

    const removed = await api().delete(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth);
    expect(removed.status).toBe(200);
    expect((await api().get(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth)).status).toBe(404);
    expect((await api().delete(`/api/admin/arena/scenarios/${s.id}`).set(admin.auth)).status).toBe(404);
    const actions = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [s.id]);
    expect(actions.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['scenario.create', 'scenario.publish', 'scenario.update', 'scenario.delete'])
    );
  });

  it('repository downsamples long windows to ≤ 400 ascending points', async () => {
    const long = `LNG_${uid()}`;
    await importSeries(long, hourlyRows(2000));
    const created = await api()
      .post('/api/admin/arena/scenarios')
      .set(admin.auth)
      .send(scenarioBody(long, { window_to: iso(T0 + 1999 * HOUR) }));
    expect(created.status).toBe(201);
    const win = (await ScenarioRepository.loadScenarioWindow(created.body.data.id, { includeUnpublished: true }))!;
    const pts = win.window.BTCUSD.points;
    expect(pts.length).toBeLessThanOrEqual(400);
    expect(pts.length).toBeGreaterThan(390);
    expect(pts[0].t).toBe(T0 / 1000);
    expect(pts[pts.length - 1].t).toBe((T0 + 1999 * HOUR) / 1000);
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
    await api().delete(`/api/admin/arena/scenarios/${created.body.data.id}`).set(admin.auth);
  });

  it('public list reports plays and my best return; debrief is revealed after playing', async () => {
    const created = await api().post('/api/admin/arena/scenarios').set(admin.auth).send(scenarioBody(dense, { window_to: iso(T0 + 90 * HOUR) }));
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    await api().post(`/api/admin/arena/scenarios/${id}/publish`).set(admin.auth).send({ published: true });

    clearScenarioColumnCache();
    const hasCol = (
      await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'arena_rounds' AND column_name = 'scenario_id'`)
    ).rows.length > 0;
    if (hasCol) {
      for (const ret of [1.5, 4.25]) {
        const r = await pool.query(
          `INSERT INTO arena_rounds (kind, user_id, status, starts_at, ends_at, duration_s, instruments, seed, starting_cash, finished_at, scenario_id)
           VALUES ('scenario', $1, 'finished', now() - INTERVAL '2 minutes', now() - INTERVAL '1 minute', 60, '["BTCUSD"]', 1, 10000, now(), $2)
           RETURNING id`,
          [user.id, id]
        );
        await pool.query(
          `INSERT INTO arena_entries (round_id, user_id, cash, equity_final, return_pct, trades_count) VALUES ($1, $2, 10000, 10000, $3, 1)`,
          [r.rows[0].id, user.id, ret]
        );
      }
    }
    const mine = (await api().get('/api/arena/scenarios').set(user.auth)).body.data.find((x: any) => x.id === id);
    const anon = (await api().get('/api/arena/scenarios')).body.data.find((x: any) => x.id === id);
    if (hasCol) {
      expect(mine).toMatchObject({ plays: 2, my_best_return_pct: 4.25 });
      expect(anon).toMatchObject({ plays: 2, my_best_return_pct: null });
      expect((await api().get(`/api/arena/scenarios/${id}`).set(user.auth)).body.data.debrief).toBe('Gerçekte ne oldu…');
    } else {
      expect(mine).toMatchObject({ plays: 0, my_best_return_pct: null });
    }
    expect((await api().get(`/api/arena/scenarios/${id}`)).body.data.debrief).toBeNull();
    expect((await api().get(`/api/arena/scenarios/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await api().get('/api/arena/scenarios/bad%20slug!')).status).toBe(400);
    // Oynanmış senaryo silinemez (oyuncu geçmişi korunur) → yayından kaldırılır
    const del = await api().delete(`/api/admin/arena/scenarios/${id}`).set(admin.auth);
    if (hasCol) {
      expect(del.status).toBe(409);
      expect(del.body.code).toBe('SCENARIO_HAS_PLAYS');
      expect((await api().post(`/api/admin/arena/scenarios/${id}/publish`).set(admin.auth).send({ published: false })).status).toBe(200);
      expect((await api().get('/api/arena/scenarios').set(user.auth)).body.data.some((x: any) => x.id === id)).toBe(false);
    } else {
      expect(del.status).toBe(200);
    }
  });
});
