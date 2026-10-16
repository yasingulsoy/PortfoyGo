import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createUser, pool, TestUser, uniqueSymbol } from './helpers';
import { AssumptionService } from '../src/services/globalLab/assumptions';

// Global Portföy Lab API (migration 025): katalog + filtreler, not kilidi, araştırma listesi, örnek senaryo,
// Premium senaryo analizi / kayıt / karşılaştırma, yönetici CRUD + CSV, varsayım / korelasyon / stres düzenleme, KVKK.

const CSRF = { 'X-Requested-With': 'PortfoyGo' };

async function premium(): Promise<TestUser> {
  const u = await createUser();
  const r = await api().post('/api/subscriptions/trial').set(u.auth).send({});
  expect(r.status).toBe(201);
  return u;
}

async function admin(): Promise<TestUser> {
  const u = await createUser();
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [u.id]);
  return u;
}

const CELLS = {
  mode: 'cells',
  base_currency: 'USD',
  horizon_years: 10,
  amount: 100_000,
  allocations: [
    { key: 'hisse|Küresel', weight: 60 },
    { key: 'tahvil|Küresel', weight: 30 },
    { key: 'nakit|Kuzey Amerika', weight: 10 },
  ],
};

async function instrumentId(symbol: string): Promise<string> {
  return (await pool.query('SELECT id FROM global_instruments WHERE symbol = $1', [symbol])).rows[0].id;
}

describe('Katalog (ücretsiz)', () => {
  it('meta: sözlükler, örnek varsayımlar (not ile) ve stres senaryoları', async () => {
    const u = await createUser();
    const r = await api().get('/api/global-lab/meta').set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.regions).toContain('Gelişmekte olan');
    expect(r.body.data.disclaimer).toMatch(/yatırım tavsiyesi değildir/);
    expect(r.body.data.assumptions.note).toMatch(/Örnek uzun vadeli varsayım/);
    expect(r.body.data.assumptions.cells.length).toBeGreaterThanOrEqual(19);
    expect(r.body.data.assumptions.fx).toMatchObject({ key: 'fx|USDTRY' });
    expect(r.body.data.assumptions.psd_adjusted).toBe(false);
    expect(r.body.data.assumptions.stress.map((s: { id: string }) => s.id)).toEqual(
      expect.arrayContaining(['kuresel-kriz-2008', 'pandemi-2020', 'faiz-soku-2022', 'tl-deger-kaybi'])
    );
    expect((await api().get('/api/global-lab/meta')).status).toBe(401);
  });

  it('tohum kataloğu ~40+ araç; bölge / sınıf / araç / para birimi / risk / arama filtreleri', async () => {
    const u = await createUser();
    const all = await api().get('/api/global-lab/instruments').set(u.auth);
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBeGreaterThanOrEqual(40);
    const classes = new Set(all.body.data.items.map((i: { asset_class: string }) => i.asset_class));
    expect([...classes].sort()).toEqual(['emtia', 'gayrimenkul', 'hisse', 'kripto', 'nakit', 'tahvil']);

    const tr = await api().get('/api/global-lab/instruments').query({ region: 'turkiye', asset_class: 'Hisse' }).set(u.auth);
    expect(tr.body.data.items.map((i: { symbol: string }) => i.symbol).sort()).toEqual(['TUR', 'XU100']);

    const etfLowRisk = await api().get('/api/global-lab/instruments').query({ vehicle: 'etf', risk_max: '2' }).set(u.auth);
    expect(etfLowRisk.body.data.items.length).toBeGreaterThan(0);
    for (const i of etfLowRisk.body.data.items) {
      expect(i.vehicle).toBe('ETF');
      expect(i.risk_level).toBeLessThanOrEqual(2);
    }

    const eur = await api().get('/api/global-lab/instruments').query({ currency: 'eur' }).set(u.auth);
    expect(eur.body.data.items.every((i: { currency: string }) => i.currency === 'EUR')).toBe(true);

    const q = await api().get('/api/global-lab/instruments').query({ q: 'bitcoin' }).set(u.auth);
    expect(q.body.data.items.map((i: { symbol: string }) => i.symbol).sort()).toEqual(['BTC', 'IBIT']);

    expect((await api().get('/api/global-lab/instruments').query({ region: 'Mars' }).set(u.auth)).status).toBe(400);
  });

  it('bağlı araçta uygulamadaki fiyat gösterilir; bağlantısız araçta quote null', async () => {
    const u = await createUser();
    await pool.query(
      `INSERT INTO market_data_cache (asset_type, symbol, name, price, change, change_percent, cached_at, expires_at)
       VALUES ('crypto', 'BTC', 'Bitcoin', 65000, 0, 1.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')
       ON CONFLICT (asset_type, symbol) DO UPDATE SET price = 65000, change_percent = 1.5, cached_at = CURRENT_TIMESTAMP`
    );
    const btc = await api().get('/api/global-lab/instruments/btc').set(u.auth);
    expect(btc.status).toBe(200);
    expect(btc.body.data.instrument.quote).toMatchObject({ asset_type: 'crypto', symbol: 'BTC', price: 65000, currency: 'USD', change_24h_pct: 1.5 });
    const spy = await api().get('/api/global-lab/instruments/SPY').set(u.auth);
    expect(spy.body.data.instrument.quote).toBeNull();
    expect((await api().get('/api/global-lab/instruments/NOPE123').set(u.auth)).status).toBe(404);
  });

  it('araştırma notları: ücretsizde yalnızca başlık (kilitli), Premium’da tam metin', async () => {
    const free = await createUser();
    const r = await api().get('/api/global-lab/instruments/VT').set(free.auth);
    expect(r.body.data.notes_locked).toBe(true);
    expect(r.body.data.notes.length).toBeGreaterThan(0);
    expect(r.body.data.notes[0].title).toBeTruthy();
    expect(r.body.data.notes[0].body).toBeNull();

    const p = await premium();
    const r2 = await api().get('/api/global-lab/instruments/VT').set(p.auth);
    expect(r2.body.data.notes_locked).toBe(false);
    expect(r2.body.data.notes[0].body).toMatch(/home bias/);
  });

  it('araştırma listesi: ekle (tekrar eklemek güvenli), listele, çıkar', async () => {
    const u = await createUser();
    const id = await instrumentId('EWJ');
    expect((await api().post('/api/global-lab/research-list').set(u.auth).send({ instrument_id: id })).status).toBe(201);
    expect((await api().post('/api/global-lab/research-list').set(u.auth).send({ instrument_id: id })).status).toBe(201);
    const list = await api().get('/api/global-lab/research-list').set(u.auth);
    expect(list.body.data.items.map((i: { symbol: string }) => i.symbol)).toEqual(['EWJ']);
    const detail = await api().get('/api/global-lab/instruments/EWJ').set(u.auth);
    expect(detail.body.data.in_research_list).toBe(true);
    expect((await api().delete(`/api/global-lab/research-list/${id}`).set(u.auth)).status).toBe(200);
    expect((await api().get('/api/global-lab/research-list').set(u.auth)).body.data.items).toEqual([]);
    expect((await api().post('/api/global-lab/research-list').set(u.auth).send({ instrument_id: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
  });
});

describe('Senaryolar', () => {
  it('ücretsiz kullanıcı örnek senaryoyu (salt okunur) görür; kayıtlı senaryo listesi boş', async () => {
    const u = await createUser();
    const r = await api().get('/api/global-lab/scenarios/example').set(u.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.scenario).toMatchObject({ mode: 'cells', base_currency: 'TRY' });
    const a = r.body.data.analysis;
    expect(a.metrics.expected_return).toBeGreaterThan(0);
    expect(a.stress).toHaveLength(4);
    expect(a.diversification.home_bias.tr_share).toBeCloseTo(0.2, 6);
    expect((await api().get('/api/global-lab/scenarios').set(u.auth)).body.data.items).toEqual([]);
    expect((await api().post('/api/global-lab/scenarios').set(u.auth).send({ name: 'x', ...CELLS })).status).toBe(402);
    expect((await api().post('/api/global-lab/scenarios/compare').set(u.auth).send({ ids: [] })).status).toBe(402);
  });

  it('Premium analiz: getiri/oynaklık, Monte Carlo (deterministik), çeşitlendirme, stres; TL bazı kur şokunu ekler', async () => {
    const p = await premium();
    const usd = await api().post('/api/global-lab/scenarios/analyze').set(p.auth).send(CELLS);
    expect(usd.status).toBe(200);
    const a = usd.body.data.analysis;
    expect(a.metrics.expected_return).toBeCloseTo(0.6 * 0.07 + 0.3 * 0.04 + 0.1 * 0.03, 10);
    expect(a.metrics.volatility).toBeGreaterThan(0.05);
    expect(a.metrics.volatility).toBeLessThan(0.15);
    expect(a.simulation.months.at(-1)).toBe(120);
    expect(a.simulation.paths).toBe(2000);
    expect(a.diversification.foreign_currency_share).toBeGreaterThan(0);
    expect(a.diversification.home_bias).toMatchObject({ tr_share: 0, ratio: null });
    const crisis = a.stress.find((s: { id: string }) => s.id === 'kuresel-kriz-2008');
    expect(crisis.portfolio_return).toBeCloseTo(0.6 * -0.55 + 0.3 * 0.03 + 0.1 * 0.02, 10);
    expect(crisis.fx_shock).toBeNull();

    const again = await api().post('/api/global-lab/scenarios/analyze').set(p.auth).send(CELLS);
    expect(again.body.data.analysis.simulation.p50).toEqual(a.simulation.p50);

    const tryRes = await api().post('/api/global-lab/scenarios/analyze').set(p.auth).send({ ...CELLS, base_currency: 'TRY' });
    const crisisTry = tryRes.body.data.analysis.stress.find((s: { id: string }) => s.id === 'kuresel-kriz-2008');
    expect(crisisTry.fx_shock).toBeCloseTo(0.48, 10);
    expect(crisisTry.portfolio_return).toBeGreaterThan(crisis.portfolio_return);
    expect(tryRes.body.data.analysis.metrics.expected_return).toBeGreaterThan(a.metrics.expected_return);
  });

  it('araç modu: aynı hücre birleşir, hücre yoksa Küresel yedek; bilinmeyen hücre / ağırlık hatası 400', async () => {
    const p = await premium();
    const [vt, acwi, gau] = await Promise.all([instrumentId('VT'), instrumentId('ACWI'), instrumentId('GAU')]);
    const r = await api()
      .post('/api/global-lab/scenarios/analyze')
      .set(p.auth)
      .send({
        mode: 'instruments',
        base_currency: 'TRY',
        horizon_years: 5,
        amount: 50_000,
        allocations: [
          { instrument_id: vt, weight: 40 },
          { instrument_id: acwi, weight: 30 },
          { instrument_id: gau, weight: 30 },
        ],
      });
    expect(r.status).toBe(200);
    const ex = r.body.data.analysis.exposures;
    expect(ex.map((e: { key: string }) => e.key)).toEqual(['hisse|Küresel', 'emtia|Küresel']);
    expect(ex[0].weight).toBeCloseTo(0.7, 10);
    expect(ex[1]).toMatchObject({ fallback: true });
    expect(r.body.data.analysis.diversification.currencies).toEqual(
      expect.arrayContaining([
        { name: 'USD', share: expect.closeTo(0.7, 10) },
        { name: 'TRY', share: expect.closeTo(0.3, 10) },
      ])
    );

    const bad = await api()
      .post('/api/global-lab/scenarios/analyze')
      .set(p.auth)
      .send({ ...CELLS, allocations: [{ key: 'hisse|Antarktika', weight: 100 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('UNKNOWN_CELL');
    const sum = await api()
      .post('/api/global-lab/scenarios/analyze')
      .set(p.auth)
      .send({ ...CELLS, allocations: [{ key: 'hisse|Küresel', weight: 90 }] });
    expect(sum.status).toBe(400);
    expect(sum.body.message).toMatch(/%100/);
  });

  it('kaydet / listele / aç / güncelle / karşılaştır / sil; Premium bitince liste ve silme açık kalır', async () => {
    const p = await premium();
    const s1 = await api().post('/api/global-lab/scenarios').set(p.auth).send({ name: 'Dengeli', ...CELLS });
    expect(s1.status).toBe(201);
    expect(s1.body.data.analysis.metrics.expected_return).toBeGreaterThan(0);
    const id1 = s1.body.data.scenario.id;
    const s2 = await api()
      .post('/api/global-lab/scenarios')
      .set(p.auth)
      .send({ name: 'Agresif', ...CELLS, allocations: [{ key: 'hisse|Gelişmekte olan', weight: 70 }, { key: 'kripto|Küresel', weight: 30 }] });
    const id2 = s2.body.data.scenario.id;

    const list = await api().get('/api/global-lab/scenarios').set(p.auth);
    expect(list.body.data.items.map((s: { name: string }) => s.name)).toEqual(['Agresif', 'Dengeli']);

    const upd = await api().patch(`/api/global-lab/scenarios/${id1}`).set(p.auth).send({ name: 'Dengeli (TL)', ...CELLS, base_currency: 'TRY' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.scenario).toMatchObject({ name: 'Dengeli (TL)', base_currency: 'TRY' });

    const cmp = await api().post('/api/global-lab/scenarios/compare').set(p.auth).send({ ids: [id1, id2] });
    expect(cmp.status).toBe(200);
    expect(cmp.body.data.items).toHaveLength(2);
    expect(cmp.body.data.items[1].analysis.metrics.volatility).toBeGreaterThan(cmp.body.data.items[0].analysis.metrics.volatility);
    expect((await api().post('/api/global-lab/scenarios/compare').set(p.auth).send({ ids: [id1] })).status).toBe(400);

    // Başkasının senaryosu görünmez
    const other = await premium();
    expect((await api().get(`/api/global-lab/scenarios/${id1}`).set(other.auth)).status).toBe(404);
    expect((await api().delete(`/api/global-lab/scenarios/${id1}`).set(other.auth)).status).toBe(404);

    // Premium biter → analiz 402, liste ve silme açık
    await pool.query(`UPDATE user_subscriptions SET ends_at = now() - INTERVAL '1 second', starts_at = now() - INTERVAL '20 days' WHERE user_id = $1`, [p.id]);
    expect((await api().get(`/api/global-lab/scenarios/${id1}`).set(p.auth)).status).toBe(402);
    expect((await api().get('/api/global-lab/scenarios').set(p.auth)).body.data.items).toHaveLength(2);
    expect((await api().delete(`/api/global-lab/scenarios/${id2}`).set(p.auth)).status).toBe(200);
    expect((await api().get('/api/global-lab/scenarios').set(p.auth)).body.data.items).toHaveLength(1);
  });
});

describe('Yönetici: katalog, notlar, CSV', () => {
  it('araç ekle / güncelle / sil + denetim kaydı; tekrar eden sembol 409; yönetici olmayan 403', async () => {
    const a = await admin();
    const sym = uniqueSymbol('GL');
    const body = {
      symbol: sym.toLowerCase(),
      name: 'Test Küresel Fon',
      vehicle: 'ETF',
      asset_class: 'hisse',
      region: 'Avrupa',
      country: 'de',
      currency: 'eur',
      risk_level: 5,
      expense_ratio_pct: '0,2',
      data_source: 'Test kaynağı',
      license_note: 'Test lisansı',
    };
    expect((await api().post('/api/admin/global-lab/instruments').set((await createUser()).auth).send(body)).status).toBe(403);
    const c = await api().post('/api/admin/global-lab/instruments').set(a.auth).send(body);
    expect(c.status).toBe(201);
    expect(c.body.data).toMatchObject({ symbol: sym, country: 'DE', currency: 'EUR', expense_ratio_pct: 0.2, active: true, provider_symbol: null });
    expect((await api().post('/api/admin/global-lab/instruments').set(a.auth).send(body)).status).toBe(409);

    const u = await api().patch(`/api/admin/global-lab/instruments/${c.body.data.id}`).set(a.auth).send({ active: false, risk_level: 6 });
    expect(u.status).toBe(200);
    expect(u.body.data).toMatchObject({ active: false, risk_level: 6, name: 'Test Küresel Fon' });
    // Pasif araç kullanıcı kataloğunda görünmez
    expect((await api().get(`/api/global-lab/instruments/${sym}`).set(a.auth)).status).toBe(404);

    expect((await api().patch(`/api/admin/global-lab/instruments/${c.body.data.id}`).set(a.auth).send({ provider_symbol: 'bond:XYZ' })).status).toBe(400);
    expect((await api().delete(`/api/admin/global-lab/instruments/${c.body.data.id}`).set(a.auth)).status).toBe(200);
    const audit = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [c.body.data.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['global_lab.instrument_create', 'global_lab.instrument_update', 'global_lab.instrument_delete']);
  });

  it('CSV içe aktarma: önizleme yazmaz; gerçek aktarım ekler / günceller; hatalar satır numarasıyla; dışa aktarma', async () => {
    const a = await admin();
    const s1 = uniqueSymbol('CV');
    const s2 = uniqueSymbol('CV');
    const csv = [
      'symbol;name;vehicle;asset_class;region;currency;risk_level;expense_ratio_pct;data_source;license_note',
      `${s1};CSV Bir;ETF;tahvil;Avrupa;EUR;3;0,15;Kaynak;Lisans`,
      `${s2};CSV İki;endeks;hisse;Asya-Pasifik;JPY;5;;Kaynak;Lisans`,
      `BAD!;Kötü;ETF;hisse;Avrupa;EUR;3;;Kaynak;Lisans`,
      `SPY;SPDR S&P 500 ETF Trust;ETF;hisse;Kuzey Amerika;USD;5;0,095;Kaynak;Lisans`,
    ].join('\n');
    const post = (dry: boolean) =>
      api()
        .post(`/api/admin/global-lab/instruments/import${dry ? '?dry_run=1' : ''}`)
        .set(a.auth)
        .set('Content-Type', 'text/csv')
        .send(csv);

    const preview = await post(true);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ total: 4, valid: 3, error_count: 1, dry_run: true });
    expect(preview.body.data.created.sort()).toEqual([s1, s2].sort());
    expect(preview.body.data.updated).toEqual(['SPY']);
    expect(preview.body.data.errors[0]).toMatchObject({ line: 4 });
    expect((await pool.query('SELECT 1 FROM global_instruments WHERE symbol = $1', [s1])).rows).toHaveLength(0);

    const real = await post(false);
    expect(real.body.data).toMatchObject({ dry_run: false });
    expect((await pool.query('SELECT expense_ratio_pct, data_source FROM global_instruments WHERE symbol = $1', [s1])).rows[0]).toMatchObject({ expense_ratio_pct: '0.150' });
    const spy = (await pool.query(`SELECT data_source, description_tr, country FROM global_instruments WHERE symbol = 'SPY'`)).rows[0];
    expect(spy.data_source).toBe('Kaynak');
    // Dosyada olmayan sütunlar korunur
    expect(spy.description_tr).toMatch(/500/);
    expect(spy.country).toBe('US');
    const audit = await pool.query(`SELECT metadata FROM admin_audit_log WHERE action = 'global_lab.instruments_import' ORDER BY created_at DESC LIMIT 1`);
    expect(audit.rows[0].metadata.created.sort()).toEqual([s1, s2].sort());

    // İkinci kez aynı dosya: değişiklik yok
    const again = await post(false);
    expect(again.body.data).toMatchObject({ created: [], updated: [] });

    const exp = await api().get('/api/admin/global-lab/instruments/export').set(a.auth);
    expect(exp.status).toBe(200);
    expect(exp.body.data.filename).toMatch(/^global-lab-katalog-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exp.body.data.csv.split('\r\n')[0]).toBe(
      'symbol,name,vehicle,asset_class,sub_class,region,country,currency,risk_level,expense_ratio_pct,description_tr,data_source,license_note,provider_symbol,active'
    );
    expect(exp.body.data.csv).toContain(s1);

    const empty = await api().post('/api/admin/global-lab/instruments/import').set(a.auth).set('Content-Type', 'text/csv').send('symbol,name\nA,B');
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('CSV_NO_HEADER');

    await pool.query(`DELETE FROM global_instruments WHERE symbol = ANY($1::text[])`, [[s1, s2]]);
  });

  it('notlar: ekle / güncelle / sil, CSV içe / dışa aktarma (bilinmeyen sembol raporlanır)', async () => {
    const a = await admin();
    const vt = await instrumentId('VT');
    const n = await api().post('/api/admin/global-lab/notes').set(a.auth).send({ instrument_id: vt, title: 'Test notu başlığı', body: 'İlk metin' });
    expect(n.status).toBe(201);
    expect(n.body.data).toMatchObject({ symbol: 'VT', author: a.username, body: 'İlk metin' });
    const u = await api().patch(`/api/admin/global-lab/notes/${n.body.data.id}`).set(a.auth).send({ body: 'Güncel metin' });
    expect(u.body.data.body).toBe('Güncel metin');

    const csv = 'symbol,title,body\nVT,Test notu başlığı,CSV ile güncellendi\nEWJ,Japonya kur etkisi,Yen hareketi USD getirisini etkiler\nZZZZZZ,Bilinmeyen,metin';
    const imp = await api().post('/api/admin/global-lab/notes/import').set(a.auth).set('Content-Type', 'text/csv').send(csv);
    expect(imp.status).toBe(200);
    expect(imp.body.data).toMatchObject({ created: 1, updated: 1, unknown_symbols: ['ZZZZZZ'] });
    const list = await api().get('/api/admin/global-lab/notes').query({ instrument_id: vt }).set(a.auth);
    expect(list.body.data.items.find((x: { id: string }) => x.id === n.body.data.id).body).toBe('CSV ile güncellendi');
    const exp = await api().get('/api/admin/global-lab/notes/export').set(a.auth);
    expect(exp.body.data.csv).toContain('Japonya kur etkisi');

    expect((await api().delete(`/api/admin/global-lab/notes/${n.body.data.id}`).set(a.auth)).status).toBe(200);
    await pool.query(`DELETE FROM global_research_notes WHERE title = 'Japonya kur etkisi'`);
    const actions = (await pool.query(`SELECT DISTINCT action FROM admin_audit_log WHERE action LIKE 'global_lab.note%'`)).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['global_lab.note_create', 'global_lab.note_update', 'global_lab.note_delete', 'global_lab.notes_import']));
  });
});

describe('Yönetici: varsayımlar ve stres senaryoları', () => {
  let original: { key: string; expected_return_pct: number; volatility_pct: number; source: string; as_of: string | null; note: string | null } | null = null;
  let originalRho: number | null = null;

  beforeAll(async () => {
    const r = await pool.query(`SELECT key, expected_return_pct, volatility_pct, source, to_char(as_of, 'YYYY-MM-DD') AS as_of, note FROM global_assumptions WHERE key = 'hisse|Küresel'`);
    original = { ...r.rows[0], expected_return_pct: Number(r.rows[0].expected_return_pct), volatility_pct: Number(r.rows[0].volatility_pct) };
    const c = await pool.query(`SELECT rho FROM global_assumption_correlations WHERE key_a = 'hisse|Küresel' AND key_b = 'tahvil|Küresel'`);
    originalRho = Number(c.rows[0].rho);
  });

  afterAll(async () => {
    if (original) {
      await pool.query(`UPDATE global_assumptions SET expected_return_pct = $2, volatility_pct = $3, source = $4, as_of = $5::date, note = $6 WHERE key = $1`, [
        original.key,
        original.expected_return_pct,
        original.volatility_pct,
        original.source,
        original.as_of,
        original.note,
      ]);
    }
    if (originalRho !== null) {
      await pool.query(`UPDATE global_assumption_correlations SET rho = $1 WHERE key_a = 'hisse|Küresel' AND key_b = 'tahvil|Küresel'`, [originalRho]);
    }
    await pool.query(`DELETE FROM global_stress_scenarios WHERE id = 'test-senaryo'`);
    AssumptionService.clearCache();
  });

  it('varsayım güncellemesi analize hemen yansır; bilinmeyen anahtar 400; denetim kaydı', async () => {
    const a = await admin();
    const p = await premium();
    const view = await api().get('/api/admin/global-lab/assumptions').set(a.auth);
    expect(view.status).toBe(200);
    expect(view.body.data.min_eigenvalue).toBeGreaterThan(0);
    expect(view.body.data.correlations.length).toBe(190);

    const up = await api()
      .put('/api/admin/global-lab/assumptions')
      .set(a.auth)
      .send({ rows: [{ key: 'hisse|Küresel', expected_return_pct: 9, volatility_pct: 16, source: 'Test kaynağı 2026', as_of: '2026-10-16', note: 'test' }] });
    expect(up.status).toBe(200);
    const row = up.body.data.assumptions.find((x: { key: string }) => x.key === 'hisse|Küresel');
    expect(row).toMatchObject({ expected_return_pct: 9, volatility_pct: 16, as_of: '2026-10-16', updated_by_username: a.username });

    const r = await api()
      .post('/api/global-lab/scenarios/analyze')
      .set(p.auth)
      .send({ ...CELLS, allocations: [{ key: 'hisse|Küresel', weight: 100 }] });
    expect(r.body.data.analysis.metrics.expected_return).toBeCloseTo(0.09, 10);
    expect(r.body.data.analysis.metrics.volatility).toBeCloseTo(0.16, 10);

    expect(
      (await api().put('/api/admin/global-lab/assumptions').set(a.auth).send({ rows: [{ key: 'hisse|Mars', expected_return_pct: 1, volatility_pct: 1, source: 'x y z' }] })).status
    ).toBe(400);
    expect(
      (await api().put('/api/admin/global-lab/assumptions').set(a.auth).send({ rows: [{ key: 'hisse|Küresel', expected_return_pct: 500, volatility_pct: 1, source: 'xyz' }] })).status
    ).toBe(400);
    expect((await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'global_lab.assumptions_update' AND admin_id = $1`, [a.id])).rows).toHaveLength(1);
  });

  it('korelasyon güncellemesi (sıra normalize) ve en küçük özdeğer bilgisi', async () => {
    const a = await admin();
    const r = await api()
      .put('/api/admin/global-lab/assumptions/correlations')
      .set(a.auth)
      .send({ pairs: [{ key_a: 'tahvil|Küresel', key_b: 'hisse|Küresel', rho: -0.2 }] });
    expect(r.status).toBe(200);
    const pair = r.body.data.correlations.find((c: { key_a: string; key_b: string }) => c.key_a === 'hisse|Küresel' && c.key_b === 'tahvil|Küresel');
    expect(pair.rho).toBeCloseTo(-0.2, 6);
    expect(typeof r.body.data.min_eigenvalue).toBe('number');
    expect((await api().put('/api/admin/global-lab/assumptions/correlations').set(a.auth).send({ pairs: [{ key_a: 'hisse|Küresel', key_b: 'hisse|Küresel', rho: 0.5 }] })).status).toBe(400);
    expect((await api().put('/api/admin/global-lab/assumptions/correlations').set(a.auth).send({ pairs: [{ key_a: 'hisse|Küresel', key_b: 'tahvil|Küresel', rho: 1.5 }] })).status).toBe(400);
  });

  it('stres senaryosu ekle / güncelle / sil; bilinmeyen şok anahtarı 400', async () => {
    const a = await admin();
    const body = { name: 'Test şoku', period_label: 'Test', shocks: { 'hisse|Küresel': -10, 'fx|USDTRY': 5 }, source: 'Test kaynağı' };
    const c = await api().put('/api/admin/global-lab/stress/test-senaryo').set(a.auth).send(body);
    expect(c.status).toBe(201);
    expect(c.body.data).toMatchObject({ id: 'test-senaryo', shocks: { 'hisse|Küresel': -10, 'fx|USDTRY': 5 }, active: true });
    const u = await api().put('/api/admin/global-lab/stress/test-senaryo').set(a.auth).send({ ...body, name: 'Test şoku 2' });
    expect(u.status).toBe(200);
    expect(u.body.data.name).toBe('Test şoku 2');
    const meta = await api().get('/api/global-lab/meta').set(a.auth);
    expect(meta.body.data.assumptions.stress.map((s: { id: string }) => s.id)).toContain('test-senaryo');
    expect((await api().put('/api/admin/global-lab/stress/test-senaryo').set(a.auth).send({ ...body, shocks: { 'hisse|Mars': 1 } })).status).toBe(400);
    expect((await api().put('/api/admin/global-lab/stress/Kötü_ID').set(a.auth).send(body)).status).toBe(400);
    expect((await api().delete('/api/admin/global-lab/stress/test-senaryo').set(a.auth)).status).toBe(200);
    expect((await api().delete('/api/admin/global-lab/stress/test-senaryo').set(a.auth)).status).toBe(404);
  });
});

describe('KVKK: dışa aktarma ve hesap silme', () => {
  it('abonelik, araştırma listesi ve kayıtlı senaryolar dışa aktarılır ve hesap silinince kaldırılır', async () => {
    const p = await premium();
    await api().post('/api/global-lab/research-list').set(p.auth).send({ instrument_id: await instrumentId('VT') });
    await api().post('/api/global-lab/scenarios').set(p.auth).send({ name: 'KVKK senaryosu', ...CELLS });

    const exp = await api().get('/api/me/export').set(p.auth);
    expect(exp.status).toBe(200);
    const data = JSON.parse(exp.text);
    expect(data.subscriptions).toHaveLength(1);
    expect(data.subscriptions[0]).toMatchObject({ source: 'trial', status: 'trial' });
    expect(data.global_lab_research_list.map((r: { symbol: string }) => r.symbol)).toEqual(['VT']);
    expect(data.global_lab_scenarios[0]).toMatchObject({ name: 'KVKK senaryosu' });
    expect(data.meta.sections).toHaveProperty('global_lab_scenarios');

    const del = await api().post('/api/me/delete').set(p.auth).set(CSRF).send({ password: 'test-password-123' });
    expect(del.status).toBe(200);
    for (const t of ['user_subscriptions', 'global_research_list', 'global_lab_scenarios']) {
      expect((await pool.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE user_id = $1`, [p.id])).rows[0].n).toBe(0);
    }
  });
});
