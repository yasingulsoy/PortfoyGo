import { describe, expect, it } from 'vitest';
import { api, createUser, pool, TestUser } from './helpers';
import { resolveEntitlements, type PlanRow, type SubscriptionRow } from '../src/services/subscriptions/entitlements';
import { SubscriptionService } from '../src/services/subscriptions/service';
import { TRIAL_DAYS } from '../src/services/subscriptions/config';

// Abonelik altyapısı (migration 025): yetki çözümlemesi, tek seferlik deneme, süre dolumu işi, 402 kapısı,
// yönetici tanımı / uzatma / iptal + denetim kaydı. Paylaşılan PGlite (test/globalSetup.ts).

const DAY = 86_400_000;

const PLANS: PlanRow[] = [
  { id: 'free', name: 'Ücretsiz', description: null, features: [{ key: 'global_lab_research', label: 'x' }], price_display: 'Ücretsiz', sort_order: 1 },
  {
    id: 'premium',
    name: 'Premium',
    description: null,
    features: [
      { key: 'global_lab_research', label: 'x' },
      { key: 'global_lab_pro', label: 'y' },
    ],
    price_display: 'Yakında',
    sort_order: 2,
  },
];

function row(over: Partial<SubscriptionRow>): SubscriptionRow {
  const now = Date.now();
  return {
    id: 's1',
    user_id: 'u1',
    plan_id: 'premium',
    status: 'trial',
    source: 'trial',
    starts_at: new Date(now - DAY),
    ends_at: new Date(now + 13 * DAY),
    canceled_at: null,
    created_at: new Date(now - DAY),
    ...over,
  };
}

async function admin(): Promise<TestUser> {
  const u = await createUser();
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [u.id]);
  return u;
}

const ent = (u: TestUser) => api().get('/api/me/entitlements').set(u.auth);
const trial = (u: TestUser) => api().post('/api/subscriptions/trial').set(u.auth).send({});

async function notifications(userId: string, type: string) {
  return (await pool.query('SELECT title, body, link, category FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at', [userId, type])).rows;
}

describe('Yetki çözümlemesi (saf)', () => {
  const now = new Date();

  it('abonelik yoksa ücretsiz plan ve deneme hakkı', () => {
    const s = resolveEntitlements([], PLANS, now);
    expect(s).toMatchObject({ status: 'free', plan: { id: 'free' }, current: null, trial: { eligible: true, used: false, days: TRIAL_DAYS } });
    expect(s.entitlements).toEqual(['global_lab_research']);
    expect(s.payment.available).toBe(false);
  });

  it('süren deneme Premium yetkisi verir; kalan gün yukarı yuvarlanır', () => {
    const s = resolveEntitlements([row({ ends_at: new Date(now.getTime() + 2.2 * DAY) })], PLANS, now);
    expect(s.status).toBe('trial');
    expect(s.entitlements).toContain('global_lab_pro');
    expect(s.current?.days_left).toBe(3);
    expect(s.trial).toMatchObject({ eligible: false, used: true });
  });

  it("bitişi geçmiş satır (iş henüz 'expired' yapmamış olsa da) yetki vermez; deneme bir kez", () => {
    const s = resolveEntitlements([row({ ends_at: new Date(now.getTime() - 1000) })], PLANS, now);
    expect(s).toMatchObject({ status: 'free', current: null, trial: { eligible: false, used: true } });
    expect(s.entitlements).not.toContain('global_lab_pro');
  });

  it('iptal edilmiş satır yetki vermez; süresiz yönetici tanımı verir', () => {
    expect(resolveEntitlements([row({ status: 'canceled', source: 'admin' })], PLANS, now).status).toBe('free');
    const s = resolveEntitlements([row({ status: 'active', source: 'admin', ends_at: null })], PLANS, now);
    expect(s).toMatchObject({ status: 'active', current: { source: 'admin', ends_at: null, days_left: null }, trial: { eligible: false, used: false } });
  });
});

describe('Ücretsiz deneme ve 402 kapısı', () => {
  it('yeni kullanıcı ücretsiz; Premium uç 402 SUBSCRIPTION_REQUIRED (plan bilgisiyle) döner', async () => {
    const u = await createUser();
    const r = await ent(u);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'free', plan: { id: 'free' }, trial: { eligible: true } });

    const gated = await api()
      .post('/api/global-lab/scenarios/analyze')
      .set(u.auth)
      .send({ mode: 'cells', base_currency: 'USD', horizon_years: 5, amount: 10000, allocations: [{ key: 'hisse|Küresel', weight: 100 }] });
    expect(gated.status).toBe(402);
    expect(gated.body).toMatchObject({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      feature: 'global_lab_pro',
      required_plan: { id: 'premium', price_display: 'Yakında' },
      trial_available: true,
      upgrade_url: '/abonelik',
      payment_available: false,
    });
  });

  it('oturum gerektirir; planlar herkese açıktır', async () => {
    expect((await api().get('/api/me/entitlements')).status).toBe(401);
    expect((await api().post('/api/subscriptions/trial').send({})).status).toBe(401);
    const plans = await api().get('/api/subscriptions/plans');
    expect(plans.status).toBe(200);
    expect(plans.body.data.plans.map((p: { id: string }) => p.id)).toEqual(['free', 'premium']);
    expect(plans.body.data).toMatchObject({ trial_days: 14, payment: { available: false } });
  });

  it('deneme 14 gün Premium açar, bildirim gönderir ve yalnızca BİR kez kullanılabilir', async () => {
    const u = await createUser();
    const r = await trial(u);
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'trial', plan: { id: 'premium' }, current: { source: 'trial', days_left: 14 }, trial: { used: true, eligible: false } });
    expect(r.body.data.entitlements).toEqual(expect.arrayContaining(['global_lab_pro', 'global_lab_notes', 'global_lab_compare']));
    expect(await notifications(u.id, 'subscription.trial_started')).toHaveLength(1);

    const again = await trial(u);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('TRIAL_ALREADY_USED');

    const ok = await api()
      .post('/api/global-lab/scenarios/analyze')
      .set(u.auth)
      .send({ mode: 'cells', base_currency: 'USD', horizon_years: 5, amount: 10000, allocations: [{ key: 'hisse|Küresel', weight: 100 }] });
    expect(ok.status).toBe(200);
  });

  it('süresi dolan deneme yetkiyi hemen kaldırır; iş durumu expired yapar, bildirir ve tekrar deneme açılmaz', async () => {
    const u = await createUser();
    expect((await trial(u)).status).toBe(201);
    await pool.query(
      `UPDATE user_subscriptions SET starts_at = now() - INTERVAL '15 days', ends_at = now() - INTERVAL '1 minute' WHERE user_id = $1`,
      [u.id]
    );
    // İş çalışmadan da yetki yok (ends_at'e göre çözülür)
    const before = await ent(u);
    expect(before.body.data).toMatchObject({ status: 'free', trial: { used: true, eligible: false } });

    const res = await SubscriptionService.expireJob();
    expect(res.expired).toBeGreaterThanOrEqual(1);
    const st = await pool.query('SELECT status FROM user_subscriptions WHERE user_id = $1', [u.id]);
    expect(st.rows[0].status).toBe('expired');
    expect(await notifications(u.id, 'subscription.expired')).toHaveLength(1);

    // İkinci çalışma aynı satırı tekrar işlemez
    await SubscriptionService.expireJob();
    expect(await notifications(u.id, 'subscription.expired')).toHaveLength(1);

    const again = await trial(u);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('TRIAL_ALREADY_USED');
  });

  it('bitişe 3 gün kala bir kez hatırlatma gönderilir', async () => {
    const u = await createUser();
    expect((await trial(u)).status).toBe(201);
    await pool.query(`UPDATE user_subscriptions SET ends_at = now() + INTERVAL '2 days' WHERE user_id = $1`, [u.id]);
    await SubscriptionService.expireJob();
    await SubscriptionService.expireJob();
    const n = await notifications(u.id, 'subscription.ending_soon');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ category: 'account', link: '/abonelik' });
    expect((await pool.query('SELECT ending_notified_at FROM user_subscriptions WHERE user_id = $1', [u.id])).rows[0].ending_notified_at).not.toBeNull();
    // Hâlâ geçerli
    expect((await ent(u)).body.data.status).toBe('trial');
  });

  it('veritabanı da denemeyi kullanıcı başına bir kez sınırlar (benzersiz kısmi indeks)', async () => {
    const u = await createUser();
    await pool.query(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, source, starts_at, ends_at) VALUES ($1, 'premium', 'expired', 'trial', now() - INTERVAL '30 days', now() - INTERVAL '16 days')`,
      [u.id]
    );
    await expect(
      pool.query(`INSERT INTO user_subscriptions (user_id, plan_id, status, source, ends_at) VALUES ($1, 'premium', 'trial', 'trial', now() + INTERVAL '14 days')`, [u.id])
    ).rejects.toThrow();
  });
});

describe('Yönetici: Premium tanımla / uzat / iptal', () => {
  it('yönetici olmayan 403 alır', async () => {
    const u = await createUser();
    expect((await api().get('/api/admin/subscriptions').set(u.auth)).status).toBe(403);
    expect((await api().post(`/api/admin/subscriptions/users/${u.id}/grant`).set(u.auth).send({ days: 30, note: 'deneme' })).status).toBe(403);
  });

  it('tanımlama notu zorunlu; tanım, uzatma ve iptal denetim kaydına yazılır ve kullanıcıya bildirilir', async () => {
    const a = await admin();
    const u = await createUser();
    const base = `/api/admin/subscriptions/users/${u.id}`;

    expect((await api().post(`${base}/grant`).set(a.auth).send({ days: 30 })).status).toBe(400);
    expect((await api().post(`${base}/grant`).set(a.auth).send({ days: 0, note: 'Pilot kullanıcı' })).status).toBe(400);
    expect((await api().post(`${base}/grant`).set(a.auth).send({ days: 5, note: 'x', mode: 'extend' })).status).toBe(400);
    const ext0 = await api().post(`${base}/grant`).set(a.auth).send({ days: 5, note: 'Uzatma denemesi', mode: 'extend' });
    expect(ext0.status).toBe(409);
    expect(ext0.body.code).toBe('NO_ACTIVE_SUBSCRIPTION');

    const g = await api().post(`${base}/grant`).set(a.auth).send({ days: 30, note: 'Pilot kullanıcı' });
    expect(g.status).toBe(200);
    expect(g.body.data.state).toMatchObject({ status: 'active', current: { source: 'admin', days_left: 30 } });
    expect((await ent(u)).body.data.entitlements).toContain('global_lab_pro');
    expect(await notifications(u.id, 'subscription.granted')).toHaveLength(1);

    const audit1 = await pool.query(`SELECT * FROM admin_audit_log WHERE action = 'subscription.grant' AND target_id = $1`, [u.id]);
    expect(audit1.rows).toHaveLength(1);
    expect(audit1.rows[0]).toMatchObject({ admin_id: a.id, target_type: 'user', target_label: u.username });
    expect(audit1.rows[0].metadata).toMatchObject({ mode: 'grant', days: 30, note: 'Pilot kullanıcı' });

    const endsBefore = new Date(g.body.data.state.current.ends_at).getTime();
    const e = await api().post(`${base}/grant`).set(a.auth).send({ days: 10, note: 'Etkinlik ödülü', mode: 'extend' });
    expect(e.status).toBe(200);
    const endsAfter = new Date(e.body.data.state.current.ends_at).getTime();
    expect(Math.round((endsAfter - endsBefore) / DAY)).toBe(10);
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM admin_audit_log WHERE action = 'subscription.grant' AND target_id = $1`, [u.id])).rows[0].n).toBe(2);

    const rv = await api().post(`${base}/revoke`).set(a.auth).send({ note: 'Pilot bitti' });
    expect(rv.status).toBe(200);
    expect(rv.body.data.state).toMatchObject({ status: 'free' });
    expect(rv.body.data.history[0]).toMatchObject({ status: 'canceled', source: 'admin', is_current: false });
    expect((await ent(u)).body.data.entitlements).not.toContain('global_lab_pro');
    const audit2 = await pool.query(`SELECT metadata FROM admin_audit_log WHERE action = 'subscription.revoke' AND target_id = $1`, [u.id]);
    expect(audit2.rows).toHaveLength(1);
    expect(audit2.rows[0].metadata).toMatchObject({ note: 'Pilot bitti', previous: { status: 'active', source: 'admin' } });
    expect(await notifications(u.id, 'subscription.revoked')).toHaveLength(1);

    const again = await api().post(`${base}/revoke`).set(a.auth).send({ note: 'Tekrar' });
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('NO_ACTIVE_SUBSCRIPTION');
  });

  it('deneme sürerken tanım: deneme iptal edilir, süresiz yönetici aboneliği açılır; liste filtreleri çalışır', async () => {
    const a = await admin();
    const u = await createUser();
    expect((await trial(u)).status).toBe(201);
    const g = await api().post(`/api/admin/subscriptions/users/${u.id}/grant`).set(a.auth).send({ days: null, note: 'Ekip üyesi (süresiz)' });
    expect(g.status).toBe(200);
    expect(g.body.data.state).toMatchObject({ status: 'active', current: { ends_at: null, days_left: null } });
    const rows = (await pool.query('SELECT status, source FROM user_subscriptions WHERE user_id = $1 ORDER BY created_at', [u.id])).rows;
    expect(rows).toEqual([
      { status: 'canceled', source: 'trial' },
      { status: 'active', source: 'admin' },
    ]);

    const list = await api().get('/api/admin/subscriptions').query({ status: 'current', search: u.username }).set(a.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({ username: u.username, status: 'active', source: 'admin', is_current: true, granted_by_username: a.username });
    expect(list.body.data.summary.current_premium).toBeGreaterThanOrEqual(1);

    const detail = await api().get(`/api/admin/subscriptions/users/${u.id}`).set(a.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.history).toHaveLength(2);

    const ext = await api().post(`/api/admin/subscriptions/users/${u.id}/grant`).set(a.auth).send({ days: 5, note: 'Uzat', mode: 'extend' });
    expect(ext.status).toBe(409);
    expect(ext.body.code).toBe('ALREADY_UNLIMITED');
  });
});
