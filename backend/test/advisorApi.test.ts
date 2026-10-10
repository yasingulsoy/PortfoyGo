import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../src/services/advisor/questionnaire';
import { api, createUser, getBalance, getHolding, pool, setMarketPrice, settle, TEST_USD_TRY, uniqueSymbol } from './helpers';

const pick = (best: boolean) =>
  Object.fromEntries(
    QUESTIONS.map((q) => {
      const sorted = [...q.options].sort((a, b) => a.score - b.score);
      return [q.id, (best ? sorted[sorted.length - 1] : sorted[0]).id];
    })
  );
const highestAnswers = () => pick(true);
const lowestAnswers = () => pick(false);

describe('GET /api/advisor/questionnaire', () => {
  it('is public and returns questions (without scores) and profiles', async () => {
    const res = await api().get('/api/advisor/questionnaire');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { version, questions, profiles } = res.body.data;
    expect(version).toBe(1);
    expect(questions).toHaveLength(8);
    for (const q of questions) {
      expect(typeof q.text).toBe('string');
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.length).toBeLessThanOrEqual(5);
      for (const o of q.options) expect(Object.keys(o).sort()).toEqual(['id', 'label']);
    }
    expect(profiles.map((p: any) => p.id)).toEqual(['muhafazakar', 'temkinli', 'dengeli', 'buyume', 'agresif']);
    expect(profiles[0].vol_band).toHaveLength(2);
  });
});

describe('/api/advisor/profile', () => {
  it('requires authentication', async () => {
    expect((await api().get('/api/advisor/profile')).status).toBe(401);
    expect((await api().post('/api/advisor/profile').send({ answers: lowestAnswers() })).status).toBe(401);
  });

  it('returns null before the questionnaire, then the latest profile', async () => {
    const user = await createUser();
    const empty = await api().get('/api/advisor/profile').set(user.auth);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toBeNull();

    const first = await api().post('/api/advisor/profile').set(user.auth).send({ answers: lowestAnswers() });
    expect(first.status).toBe(201);
    expect(first.body.data.score).toBe(0);
    expect(first.body.data.max_score).toBe(40);
    expect(first.body.data.profile.id).toBe('muhafazakar');
    expect(first.body.data.profile.label).toBe('Muhafazakâr');
    expect(first.body.data.profile.constraints).toHaveLength(6);

    const second = await api().post('/api/advisor/profile').set(user.auth).send({ answers: highestAnswers() });
    expect(second.body.data.profile.id).toBe('agresif');

    const latest = await api().get('/api/advisor/profile').set(user.auth);
    expect(latest.body.data.id).toBe(second.body.data.id);
    expect(latest.body.data.answers).toEqual(highestAnswers());
  });

  it('validates answers', async () => {
    const user = await createUser();
    const partial = lowestAnswers();
    delete (partial as Record<string, string>).horizon;
    const cases: [unknown, RegExp][] = [
      [{}, /Yanıtlar gerekli|Geçersiz istek/],
      [{ answers: 'x' }, /Yanıtlar gerekli|Geçersiz istek/],
      [{ answers: partial }, /tüm soruları/],
      [{ answers: { ...lowestAnswers(), age: 'zzz' } }, /Geçersiz seçenek/],
      [{ answers: { ...lowestAnswers(), foo: 'bar' } }, /Bilinmeyen soru/],
      [{ answers: { ...lowestAnswers(), age: 5 } }, /.+/],
    ];
    for (const [body, re] of cases) {
      const res = await api().post('/api/advisor/profile').set(user.auth).send(body as object);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(re);
    }
  });
});

describe('/api/advisor/plans', () => {
  it('requires a profile (or override)', async () => {
    const user = await createUser();
    const res = await api().post('/api/advisor/plans').set(user.auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });

  it('creates a full plan from the latest profile (default amount = total equity)', async () => {
    const user = await createUser({ balance: 250_000 });
    await api().post('/api/advisor/profile').set(user.auth).send({ answers: lowestAnswers() }).expect(201);

    const res = await api().post('/api/advisor/plans').set(user.auth).send({});
    expect(res.status).toBe(201);
    const plan = res.body.data;
    expect(plan.profile.id).toBe('muhafazakar');
    expect(plan.risk_profile_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.horizon_months).toBe(12);
    expect(plan.amount_try).toBe(250_000);
    expect(['prior', 'mixed', 'historical']).toContain(plan.data_quality);

    // Dağılım: 6 sınıf, toplam %100, kısıtlar içinde
    expect(plan.allocation.map((a: any) => a.class)).toEqual(['cash_try', 'usd', 'eur', 'gold', 'us_stocks', 'crypto']);
    const total = plan.allocation.reduce((s: number, a: any) => s + Math.round(a.weight * 100), 0);
    expect(total).toBe(100);
    for (const a of plan.allocation) {
      const c = plan.profile.constraints.find((x: any) => x.class === a.class);
      expect(a.weight).toBeGreaterThanOrEqual(c.min - 1e-9);
      expect(a.weight).toBeLessThanOrEqual(c.max + 1e-9);
      if (a.class !== 'cash_try') expect(a.instruments.length).toBeGreaterThan(0);
    }
    expect(plan.allocation.find((a: any) => a.class === 'crypto').weight).toBe(0);
    expect(plan.allocation.find((a: any) => a.class === 'cash_try').weight).toBeGreaterThanOrEqual(0.4);
    expect(plan.allocation.find((a: any) => a.class === 'cash_try').expected_return).toBeCloseTo(0.4, 6);

    // Metrikler
    for (const k of ['expected_return', 'volatility', 'sharpe', 'var95', 'prob_loss', 'max_drawdown_median', 'max_drawdown_p95']) {
      expect(typeof plan.metrics[k]).toBe('number');
    }
    expect(plan.metrics.volatility).toBeLessThanOrEqual(0.05 + 1e-9);

    // Simülasyon: 13 nokta, sıralı yüzdelikler
    expect(plan.simulation.months).toHaveLength(13);
    expect(plan.simulation.p50[0]).toBe(250_000);
    for (let m = 0; m <= 12; m++) {
      expect(plan.simulation.p5[m]).toBeLessThanOrEqual(plan.simulation.p50[m]);
      expect(plan.simulation.p50[m]).toBeLessThanOrEqual(plan.simulation.p95[m]);
    }
    expect(plan.frontier.length).toBeGreaterThan(0);
    expect(plan.frontier.length).toBeLessThanOrEqual(25);
    expect(plan.explanation.length).toBeGreaterThanOrEqual(3);
    expect(plan.explanation.length).toBeLessThanOrEqual(5);
    expect(plan.explanation[0]).toContain('Muhafazakâr');
    expect(plan.disclaimer).toContain('yatırım tavsiyesi değildir');

    // Mevcut durum: tamamı nakit
    expect(plan.current.total_value).toBe(250_000);
    expect(plan.current.allocation_by_class.find((a: any) => a.class === 'cash_try').weight).toBe(1);
    const cashDrift = plan.current.drift.find((d: any) => d.class === 'cash_try');
    expect(cashDrift.diff).toBeCloseTo(1 - cashDrift.target, 4);
    expect(plan.applied_at).toBeNull();

    // Liste + tekil okuma
    const list = await api().get('/api/advisor/plans?limit=5').set(user.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.items[0].id).toBe(plan.id);
    expect(list.body.data.items[0].metrics.volatility).toBe(plan.metrics.volatility);
    const one = await api().get(`/api/advisor/plans/${plan.id}`).set(user.auth);
    expect(one.status).toBe(200);
    expect(one.body.data.allocation).toEqual(plan.allocation);
    expect(one.body.data.simulation).toEqual(plan.simulation);
  });

  it('is deterministic for identical inputs', async () => {
    const user = await createUser();
    const body = { profile_override: 'dengeli', horizon_months: 24, amount_try: 50_000 };
    const a = await api().post('/api/advisor/plans').set(user.auth).send(body);
    const b = await api().post('/api/advisor/plans').set(user.auth).send(body);
    expect(a.status).toBe(201);
    expect(a.body.data.risk_profile_id).toBeNull();
    expect(a.body.data.profile.id).toBe('dengeli');
    expect(a.body.data.simulation.months).toHaveLength(25);
    expect(b.body.data.allocation).toEqual(a.body.data.allocation);
    expect(b.body.data.metrics).toEqual(a.body.data.metrics);
  });

  it('validates plan input', async () => {
    const user = await createUser();
    const cases = [
      { profile_override: 'yolo' },
      { profile_override: 'dengeli', horizon_months: 5 },
      { profile_override: 'dengeli', horizon_months: 61 },
      { profile_override: 'dengeli', horizon_months: 12.5 },
      { profile_override: 'dengeli', amount_try: 999 },
      { profile_override: 'dengeli', amount_try: 10_000_001 },
      { profile_override: 'dengeli', amount_try: '5000' },
      { profile_id: 'not-a-uuid' },
    ];
    for (const body of cases) {
      const res = await api().post('/api/advisor/plans').set(user.auth).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('enforces ownership of profiles and plans', async () => {
    const owner = await createUser();
    const other = await createUser();
    const prof = await api().post('/api/advisor/profile').set(owner.auth).send({ answers: lowestAnswers() });
    const plan = await api().post('/api/advisor/plans').set(owner.auth).send({ profile_id: prof.body.data.id });
    expect(plan.status).toBe(201);
    expect(plan.body.data.risk_profile_id).toBe(prof.body.data.id);

    const foreignProfile = await api().post('/api/advisor/plans').set(other.auth).send({ profile_id: prof.body.data.id });
    expect(foreignProfile.status).toBe(404);
    expect(foreignProfile.body.code).toBe('PROFILE_NOT_FOUND');

    const read = await api().get(`/api/advisor/plans/${plan.body.data.id}`).set(other.auth);
    expect(read.status).toBe(404);
    const apply = await api().post(`/api/advisor/plans/${plan.body.data.id}/apply`).set(other.auth).send({ amount_try: 1000 });
    expect(apply.status).toBe(404);
    const list = await api().get('/api/advisor/plans').set(other.auth);
    expect(list.body.data.items).toEqual([]);
    expect((await api().get('/api/advisor/plans/abc').set(owner.auth)).status).toBe(400);
  });

  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const user = await createUser();
    const res = await api().post('/api/advisor/plans').set('Cookie', `pg_session=${user.token}`).send({ profile_override: 'dengeli' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/advisor/plans/:id/apply', () => {
  /** Plan oluşturur, dağılımını test sembolleriyle değiştirir (deterministik fiyatlar). */
  async function planWithTestInstruments(userAuth: { Authorization: string }) {
    const created = await api().post('/api/advisor/plans').set(userAuth).send({ profile_override: 'dengeli', amount_try: 10_000 });
    expect(created.status).toBe(201);
    const s1 = uniqueSymbol('A');
    const s2 = uniqueSymbol('B');
    const missing = uniqueSymbol('X');
    await setMarketPrice(s1, 10); // 400 TL
    await setMarketPrice(s2, 2.5); // 100 TL
    const allocation = [
      { class: 'cash_try', label: 'TL Nakit', weight: 0.5, expected_return: 0.4, volatility: 0, instruments: [] },
      {
        class: 'us_stocks',
        label: 'ABD Hisseleri',
        weight: 0.3,
        expected_return: 0.45,
        volatility: 0.2,
        instruments: [
          { symbol: s1, asset_type: 'stock', name: s1, weight: 0.5 },
          { symbol: s2, asset_type: 'stock', name: s2, weight: 0.5 },
        ],
      },
      {
        class: 'crypto',
        label: 'Kripto',
        weight: 0.2,
        expected_return: 0.6,
        volatility: 0.6,
        instruments: [{ symbol: missing, asset_type: 'crypto', name: missing, weight: 1 }],
      },
    ];
    await pool.query('UPDATE portfolio_plans SET allocation = $1 WHERE id = $2', [JSON.stringify(allocation), created.body.data.id]);
    return { id: created.body.data.id as string, s1, s2, missing };
  }

  it('buys each instrument share via server prices, skips unpriced ones, never touches cash share', async () => {
    const user = await createUser({ balance: 20_000 });
    const { id, s1, s2, missing } = await planWithTestInstruments(user.auth);

    const res = await api().post(`/api/advisor/plans/${id}/apply`).set(user.auth).send({ amount_try: 5_000, mode: 'buy_only' });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.executed.map((e: any) => e.symbol).sort()).toEqual([s1, s2].sort());
    expect(data.skipped).toEqual([{ symbol: missing, reason: expect.stringMatching(/Fiyat/) }]);

    // Her hisse için hedef 5000 × 0.3 × 0.5 = 750 TL (komisyon dahil aşılmaz)
    for (const e of data.executed) {
      expect(e.amount).toBeLessThanOrEqual(750);
      expect(e.amount).toBeGreaterThan(745);
      expect(e.asset_type).toBe('stock');
    }
    const e1 = data.executed.find((e: any) => e.symbol === s1);
    expect(e1.price).toBeCloseTo(10 * TEST_USD_TRY, 6);
    expect(await getHolding(user.id, s1)).toBeCloseTo(e1.quantity, 8);
    expect(await getHolding(user.id, missing)).toBe(0);

    const spent = data.executed.reduce((s: number, e: any) => s + e.amount, 0);
    expect(data.spent).toBeCloseTo(spent, 2);
    expect(data.spent).toBeLessThanOrEqual(1_500);
    expect(data.remaining_cash).toBeCloseTo(20_000 - data.spent, 2);
    expect(await getBalance(user.id)).toBeCloseTo(20_000 - data.spent, 2);

    // Plan "uygulandı" olarak işaretlendi; ikinci kez uygulanamaz
    const plan = await api().get(`/api/advisor/plans/${id}`).set(user.auth);
    expect(plan.body.data.applied_at).not.toBeNull();
    expect(plan.body.data.apply_result.spent).toBeCloseTo(data.spent, 2);
    expect(plan.body.data.current.allocation_by_class.find((a: any) => a.class === 'us_stocks').weight).toBeGreaterThan(0);
    const again = await api().post(`/api/advisor/plans/${id}/apply`).set(user.auth).send({ amount_try: 1_000 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PLAN_ALREADY_APPLIED');
    await settle();
  });

  it('rejects amounts above available cash and invalid input', async () => {
    const user = await createUser({ balance: 3_000 });
    const { id } = await planWithTestInstruments(user.auth);
    const over = await api().post(`/api/advisor/plans/${id}/apply`).set(user.auth).send({ amount_try: 3_000.01 });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('INSUFFICIENT_BALANCE');
    for (const body of [{}, { amount_try: 50 }, { amount_try: 1_000, mode: 'rebalance' }, { amount_try: 'x' }]) {
      const res = await api().post(`/api/advisor/plans/${id}/apply`).set(user.auth).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await getBalance(user.id)).toBe(3_000);
  });

  it('keeps the plan un-applied when nothing could be bought', async () => {
    const user = await createUser();
    const created = await api().post('/api/advisor/plans').set(user.auth).send({ profile_override: 'agresif' });
    const sym = uniqueSymbol('Z');
    await pool.query('UPDATE portfolio_plans SET allocation = $1 WHERE id = $2', [
      JSON.stringify([
        { class: 'cash_try', label: 'TL Nakit', weight: 0.5, expected_return: 0.4, volatility: 0, instruments: [] },
        { class: 'crypto', label: 'Kripto', weight: 0.5, expected_return: 0.6, volatility: 0.6, instruments: [{ symbol: sym, asset_type: 'crypto', name: sym, weight: 1 }] },
      ]),
      created.body.data.id,
    ]);
    const res = await api().post(`/api/advisor/plans/${created.body.data.id}/apply`).set(user.auth).send({ amount_try: 2_000 });
    expect(res.status).toBe(200);
    expect(res.body.data.executed).toEqual([]);
    expect(res.body.data.skipped).toHaveLength(1);
    expect(res.body.data.spent).toBe(0);
    const plan = await api().get(`/api/advisor/plans/${created.body.data.id}`).set(user.auth);
    expect(plan.body.data.applied_at).toBeNull();
    expect(plan.body.data.apply_result.skipped).toHaveLength(1);
  });
});
