import crypto from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { api, createUser, pool, setMarketPrice, TestUser, uniqueSymbol } from './helpers';
import { IdeasService } from '../src/services/ideas/service';
import { AccountExportService } from '../src/services/account/export';
import { AccountDeletionService } from '../src/services/account/delete';

// Ortak Akıl — Öneri Havuzu API'si. Paylaşılan PGlite (test/globalSetup.ts). Her senaryo kendi sembolünü / kullanıcılarını
// kullanır; iş (reviewJob) tüm açık önerileri taradığı için sayaçlar ilgili önerinin satırlarıyla doğrulanır.

const RATIONALE =
  'Şirketin son iki çeyrekte brüt marjı istikrarlı biçimde arttı ve borçluluk azaldı; sektördeki talep toparlanması sürerse ' +
  'gelir büyümesinin hızlanmasını bekliyorum.';
const SCENARIO = 'Önümüzdeki bilançoda gelir artışı beklentinin üzerinde gelir ve fiyat hedef bölgeye yaklaşır.';
const RISKS = 'Talep beklenenden zayıf kalabilir; faiz artışı değerlemeleri baskılayabilir.';

function istanbulDay(offsetDays = 0): string {
  return new Date(Date.now() + 3 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function body(symbol: string, over: Record<string, unknown> = {}) {
  return {
    asset_type: 'stock',
    symbol,
    stance: 'al',
    horizon: '1m',
    rationale: RATIONALE,
    scenario: SCENARIO,
    risks: RISKS,
    target_price: 120,
    invalidation_price: 90,
    review_date: istanbulDay(30),
    tags: ['bilanço', 'Marj'],
    ...over,
  };
}

const create = (u: TestUser, b: Record<string, unknown>) => api().post('/api/ideas').set(u.auth).send(b);

async function priced(prefix: string, price = 100): Promise<string> {
  const s = uniqueSymbol(prefix);
  await setMarketPrice(s, price);
  return s;
}

async function admin(): Promise<TestUser> {
  const u = await createUser();
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [u.id]);
  return u;
}

async function league(owner: TestUser, members: TestUser[] = []): Promise<string> {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
  const r = await pool.query(`INSERT INTO leagues (name, owner_id, invite_code) VALUES ('Fikir Ligi', $1, $2) RETURNING id`, [owner.id, code]);
  const id = r.rows[0].id as string;
  await pool.query(`INSERT INTO league_members (league_id, user_id, role, baseline_equity) VALUES ($1, $2, 'owner', 100000)`, [id, owner.id]);
  for (const m of members) {
    await pool.query(`INSERT INTO league_members (league_id, user_id, role, baseline_equity) VALUES ($1, $2, 'member', 100000)`, [id, m.id]);
  }
  return id;
}

async function notes(userId: string, type: string, ideaId: string) {
  const r = await pool.query(`SELECT title, body, link, category, data FROM notifications WHERE user_id = $1 AND type = $2 AND data->>'idea_id' = $3`, [
    userId,
    type,
    ideaId,
  ]);
  return r.rows;
}

afterEach(() => IdeasService.clearCaches());

describe('Ortak Akıl: yayın ve doğrulama', () => {
  it('referans fiyatı (fiyat + kote para birimi + zaman) yakalar ve yapılandırılmış kartı döndürür', async () => {
    const u = await createUser();
    const s = await priced('IA');
    const r = await create(u, body(s.toLowerCase(), { scenario_bull: 'Talep hızlanır', tags: [' #Bilanço ', 'bilanço', 'marj'] }));
    expect(r.status).toBe(201);
    const d = r.body.data;
    expect(d).toMatchObject({
      symbol: s,
      asset_type: 'stock',
      stance: 'al',
      horizon: '1m',
      status: 'acik',
      scope: 'public',
      ref_price: 100,
      quote_currency: 'USD',
      price: 100,
      change_pct: 0,
      performance_pct: 0,
      is_mine: true,
      tags: ['bilanço', 'marj'],
      scenario_cases: { bull: 'Talep hızlanır', base: null, bear: null },
      target_price: 120,
      invalidation_price: 90,
      counts: { agree: 0, disagree: 0, comments: 0 },
      can: { respond: false, close: true, add_update: true, report: false },
    });
    expect(Date.parse(d.ref_price_at)).toBeGreaterThan(Date.now() - 5 * 60_000);
    expect(d.author.username).toBe(u.username);
    expect(d.author_track_record).toMatchObject({ published: 1, closed: 0, as_expected_pct: null });
    const row = (await pool.query('SELECT ref_price, quote_currency, ref_price_at FROM ideas WHERE id = $1', [d.id])).rows[0];
    expect(Number(row.ref_price)).toBe(100);
    expect(row.quote_currency).toBe('USD');
  });

  it('zorunlu alanlar, izleme kriteri, seviyeler ve e-posta doğrulaması', async () => {
    const u = await createUser();
    const s = await priced('IV');
    const none = await create(u, body(s, { target_price: null, invalidation_price: null, review_date: null }));
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('MONITOR_REQUIRED');

    const short = await create(u, body(s, { rationale: 'x'.repeat(79) }));
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/Gerekçe en az 80/);

    for (const missing of ['scenario', 'risks', 'rationale']) {
      const b = body(s);
      delete (b as Record<string, unknown>)[missing];
      expect((await create(u, b)).status).toBe(400);
    }
    expect((await create(u, body(s, { stance: 'tut' }))).status).toBe(400);
    expect((await create(u, body(s, { horizon: '2y' }))).status).toBe(400);
    expect((await create(u, body(s, { review_date: istanbulDay(0), target_price: null, invalidation_price: null }))).body.message).toMatch(/en erken yarın/);

    const lv = await create(u, body(s, { target_price: 95 }));
    expect(lv.status).toBe(400);
    expect(lv.body).toMatchObject({ code: 'INVALID_LEVELS', ref_price: 100 });
    const sat = await create(u, body(s, { stance: 'sat', target_price: 120, invalidation_price: 130 }));
    expect(sat.body.code).toBe('INVALID_LEVELS');
    // Yalnızca değerlendirme tarihi de yeterli bir izleme kriteridir
    expect((await create(u, body(s, { target_price: null, invalidation_price: null }))).status).toBe(201);

    const unknown = await create(u, body('YOKBOYLE1'));
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('ASSET_UNAVAILABLE');

    const unverified = await createUser({ verified: false });
    const uv = await create(unverified, body(s));
    expect(uv.status).toBe(403);
    expect(uv.body.code).toBe('EMAIL_NOT_VERIFIED');

    // Düz metin: kontrol / görünmez karakterler atılır, içerik olduğu gibi (HTML işlenmez) saklanır
    const html = await create(u, body(s, { scenario: 'Fiyat <b>yükselir</b>​ ve https://ornek.com bağlantısı düz metin kalır.' }));
    expect(html.status).toBe(201);
    expect(html.body.data.scenario).toBe('Fiyat <b>yükselir</b> ve https://ornek.com bağlantısı düz metin kalır.');
  });

  it('günde en fazla 5 öneri (İstanbul günü)', async () => {
    const u = await createUser();
    const s = await priced('IL');
    for (let i = 0; i < 5; i++) expect((await create(u, body(s))).status).toBe(201);
    const sixth = await create(u, body(s));
    expect(sixth.status).toBe(429);
    expect(sixth.body).toMatchObject({ code: 'IDEA_DAILY_LIMIT', limit: 5 });
    expect(sixth.headers['retry-after']).toBeDefined();
  });
});

describe('Ortak Akıl: performans', () => {
  it("yayından bu yana: 'al' / 'sat' yön ayarlı, 'izle' düz değişim; kapanınca fiyat dondurulur", async () => {
    const u = await createUser();
    const s = await priced('IP');
    const al = (await create(u, body(s))).body.data;
    const sat = (await create(u, body(s, { stance: 'sat', target_price: 80, invalidation_price: 110 }))).body.data;
    const izle = (await create(u, body(s, { stance: 'izle', target_price: 130, invalidation_price: 70 }))).body.data;

    await setMarketPrice(s, 90);
    IdeasService.clearCaches();
    const list = await api().get('/api/ideas').query({ q: s, view: 'mine' }).set(u.auth);
    expect(list.status).toBe(200);
    const by = new Map(list.body.data.items.map((i: any) => [i.id, i]));
    expect(by.get(al.id)).toMatchObject({ price: 90, change_pct: -10, performance_pct: -10, directional: true, price_source: 'live' });
    expect(by.get(sat.id)).toMatchObject({ price: 90, change_pct: -10, performance_pct: 10, directional: true });
    expect(by.get(izle.id)).toMatchObject({ price: 90, change_pct: -10, performance_pct: -10, directional: false });

    const closed = await api()
      .post(`/api/ideas/${sat.id}/close`)
      .set(u.auth)
      .send({ outcome: 'beklendigi_gibi', evaluation: 'Düşüş beklentim gerçekleşti; talep zayıflığı fiyatlara beklediğim gibi yansıdı.' });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'kapandi', price: 90, price_source: 'close', performance_pct: 10 });

    await setMarketPrice(s, 150);
    IdeasService.clearCaches();
    const after = (await api().get(`/api/ideas/${sat.id}`).set(u.auth)).body.data;
    expect(after).toMatchObject({ price: 90, performance_pct: 10 });
    const alNow = (await api().get(`/api/ideas/${al.id}`).set(u.auth)).body.data;
    expect(alNow).toMatchObject({ price: 150, performance_pct: 50 });

    const chart = await api().get(`/api/ideas/${al.id}/chart`).set(u.auth);
    expect(chart.status).toBe(200);
    expect(chart.body.data.points[0].v).toBe(100);
    expect(chart.body.data.points.at(-1).v).toBe(150);
    expect(chart.body.data).toMatchObject({ ref_price: 100, target_price: 120, invalidation_price: 90, quote_currency: 'USD' });
  });
});

describe('Ortak Akıl: görünürlük (lig kapsamı)', () => {
  it('lige özel öneri yalnızca ligin üyelerine görünür; üye olmayan lige öneri açamaz', async () => {
    const [owner, member, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
    const lg = await league(owner, [member]);
    const s = await priced('IS');

    const bad = await create(outsider, body(s, { scope: 'league', league_id: lg }));
    expect(bad.status).toBe(403);
    expect(bad.body.code).toBe('LEAGUE_MEMBERSHIP_REQUIRED');
    expect((await create(member, body(s, { scope: 'league' }))).status).toBe(400);

    const created = await create(member, body(s, { scope: 'league', league_id: lg }));
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.league).toMatchObject({ id: lg, name: 'Fikir Ligi' });

    // Üye (lig sahibi) görür
    expect((await api().get(`/api/ideas/${id}`).set(owner.auth)).status).toBe(200);
    const ownerList = await api().get('/api/ideas').query({ q: s, scope: 'leagues' }).set(owner.auth);
    expect(ownerList.body.data.items.map((i: any) => i.id)).toContain(id);

    // Üye olmayan ve oturumsuz: hiçbir yerde görmez
    expect((await api().get(`/api/ideas/${id}`).set(outsider.auth)).status).toBe(404);
    expect((await api().get(`/api/ideas/${id}`)).status).toBe(404);
    expect((await api().get(`/api/ideas/${id}/chart`).set(outsider.auth)).status).toBe(404);
    expect((await api().get(`/api/ideas/${id}/comments`).set(outsider.auth)).status).toBe(404);
    expect((await api().put(`/api/ideas/${id}/response`).set(outsider.auth).send({ stance: 'katiliyorum', reason: 'Gerekçe yeterli görünüyor.' })).status).toBe(404);
    expect((await api().post(`/api/ideas/${id}/comments`).set(outsider.auth).send({ text: 'merhaba' })).status).toBe(404);
    expect((await api().put(`/api/ideas/${id}/bookmark`).set(outsider.auth)).status).toBe(404);
    expect((await api().post('/api/ideas/reports').set(outsider.auth).send({ target_type: 'idea', target_id: id, reason: 'spam' })).status).toBe(404);
    for (const who of [outsider.auth, {}]) {
      const l = await api().get('/api/ideas').query({ q: s }).set(who);
      expect(l.body.data.items.map((i: any) => i.id)).not.toContain(id);
    }
    const cmp = await api().get('/api/ideas/compare').query({ ids: `${id},${crypto.randomUUID()}` }).set(outsider.auth);
    expect(cmp.status).toBe(200);
    expect(cmp.body.data.items).toHaveLength(0);
    expect(cmp.body.data.missing).toContain(id);

    // Ligden ayrılan üye artık göremez; yazar her zaman görür
    await pool.query('DELETE FROM league_members WHERE league_id = $1 AND user_id = $2', [lg, owner.id]);
    expect((await api().get(`/api/ideas/${id}`).set(owner.auth)).status).toBe(404);
    expect((await api().get(`/api/ideas/${id}`).set(member.auth)).status).toBe(200);
  });
});

describe('Ortak Akıl: yaşam döngüsü', () => {
  it('izleme notu yalnızca yazar; kapanış zorunlu değerlendirme ister; kapanınca notlar / yanıtlar kapanır', async () => {
    const [author, other] = await Promise.all([createUser(), createUser()]);
    const s = await priced('IC');
    const id = (await create(author, body(s))).body.data.id;
    await api().put(`/api/ideas/${id}/bookmark`).set(other.auth).expect(200);

    expect((await api().post(`/api/ideas/${id}/updates`).set(other.auth).send({ text: 'Benim notum' })).body.code).toBe('NOT_AUTHOR');
    const up = await api().post(`/api/ideas/${id}/updates`).set(author.auth).send({ text: 'Bilanço tarihi açıklandı, beklenti değişmedi.' });
    expect(up.status).toBe(201);
    expect(up.body.data).toMatchObject({ kind: 'note', price: 100, hidden: false });

    const noEval = await api().post(`/api/ideas/${id}/close`).set(author.auth).send({ outcome: 'kismen' });
    expect(noEval.status).toBe(400);
    const shortEval = await api().post(`/api/ideas/${id}/close`).set(author.auth).send({ outcome: 'kismen', evaluation: 'Kısmen tuttu.' });
    expect(shortEval.status).toBe(400);
    expect(shortEval.body.message).toMatch(/Değerlendirme en az 40/);
    const noOutcome = await api().post(`/api/ideas/${id}/close`).set(author.auth).send({ evaluation: 'x'.repeat(60) });
    expect(noOutcome.status).toBe(400);
    const notMine = await api().post(`/api/ideas/${id}/close`).set(other.auth).send({ outcome: 'kismen', evaluation: 'x'.repeat(60) });
    expect(notMine.body.code).toBe('NOT_AUTHOR');

    const evaluation = 'Gelir artışı geldi ama marjlar beklediğim kadar genişlemedi; hedefin yarısına ulaşıldı.';
    const closed = await api().post(`/api/ideas/${id}/close`).set(author.auth).send({ outcome: 'kismen', evaluation, lessons: 'Marj varsayımını daha temkinli kur.' });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ status: 'kapandi', outcome: 'kismen', evaluation, lessons: 'Marj varsayımını daha temkinli kur.' });
    expect(closed.body.data.can).toMatchObject({ close: false, add_update: false });
    expect(closed.body.data.updates.map((u: any) => u.kind)).toEqual(['note', 'closed']);
    expect(closed.body.data.author_track_record).toMatchObject({ published: 1, closed: 1, partial: 1, as_expected_pct: 0 });

    expect((await api().post(`/api/ideas/${id}/updates`).set(author.auth).send({ text: 'Kapandıktan sonra not' })).body.code).toBe('IDEA_CLOSED');
    expect((await api().post(`/api/ideas/${id}/close`).set(author.auth).send({ outcome: 'kismen', evaluation })).body.code).toBe('IDEA_CLOSED');
    expect((await api().put(`/api/ideas/${id}/response`).set(other.auth).send({ stance: 'katiliyorum', reason: 'Gerekçe yeterli görünüyor.' })).body.code).toBe(
      'IDEA_CLOSED'
    );
    // Yorumlar kapanıştan sonra da açık
    expect((await api().post(`/api/ideas/${id}/comments`).set(other.auth).send({ text: 'Değerlendirme için teşekkürler.' })).status).toBe(201);
    // İzleyen kişiye kapanış bildirimi
    const n = await notes(other.id, 'ideas.closed', id);
    expect(n).toHaveLength(1);
    expect(n[0].link).toBe(`/ortak-akil/${id}`);

    const closedList = await api().get('/api/ideas').query({ view: 'closed', q: s }).set(other.auth);
    expect(closedList.body.data.items.map((i: any) => i.id)).toEqual([id]);
  });
});

describe('Ortak Akıl: topluluk', () => {
  it('kullanıcı başına tek (düzenlenebilir) gerekçeli yanıt; yazar yanıt veremez; toplu etkileşim bildirimi', async () => {
    const [author, a, b] = await Promise.all([createUser(), createUser(), createUser()]);
    const s = await priced('IR');
    const id = (await create(author, body(s))).body.data.id;

    expect((await api().put(`/api/ideas/${id}/response`).set(author.auth).send({ stance: 'katiliyorum', reason: 'Kendi fikrime katılıyorum.' })).body.code).toBe('OWN_IDEA');
    expect((await api().put(`/api/ideas/${id}/response`).set(a.auth).send({ stance: 'katiliyorum', reason: 'kısa' })).status).toBe(400);
    expect((await api().put(`/api/ideas/${id}/response`).set(a.auth).send({ stance: 'belki', reason: 'Gerekçe yeterli görünüyor.' })).status).toBe(400);

    const r1 = await api().put(`/api/ideas/${id}/response`).set(a.auth).send({ stance: 'katiliyorum', reason: 'Marj artışı kalıcı görünüyor.' });
    expect(r1.status).toBe(200);
    expect(r1.body.data).toMatchObject({ stance: 'katiliyorum', is_me: true, edited: false });
    const r2 = await api().put(`/api/ideas/${id}/response`).set(a.auth).send({ stance: 'katilmiyorum', reason: 'Talep verisi zayıflamaya başladı.' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.id).toBe(r1.body.data.id);
    const rows = await pool.query('SELECT stance, reason FROM idea_responses WHERE idea_id = $1 AND user_id = $2', [id, a.id]);
    expect(rows.rows).toEqual([{ stance: 'katilmiyorum', reason: 'Talep verisi zayıflamaya başladı.' }]);

    await api().put(`/api/ideas/${id}/response`).set(b.auth).send({ stance: 'katiliyorum', reason: 'Bilanço takvimi destekliyor.' }).expect(200);
    const d = (await api().get(`/api/ideas/${id}`).set(b.auth)).body.data;
    expect(d.counts).toMatchObject({ agree: 1, disagree: 1 });
    expect(d.responses.agree.map((x: any) => x.username)).toEqual([b.username]);
    expect(d.responses.disagree[0]).toMatchObject({ username: a.username, reason: 'Talep verisi zayıflamaya başladı.' });
    expect(d.my_response).toMatchObject({ stance: 'katiliyorum', is_me: true });

    // İlk yanıt hemen bildirilir; bekleme süresindeki ikincisi toplanır (yanıt düzenlemesi sayılmaz)
    expect(await notes(author.id, 'ideas.activity', id)).toHaveLength(1);
    const pending = (await pool.query('SELECT activity_pending_responses AS r FROM ideas WHERE id = $1', [id])).rows[0];
    expect(pending.r).toBe(1);
    await IdeasService.reviewJob(new Date(Date.now() + 2 * 3600_000));
    const after = await notes(author.id, 'ideas.activity', id);
    expect(after).toHaveLength(2);
    expect(after[1].data).toMatchObject({ responses: 1, comments: 0 });
    expect((await pool.query('SELECT activity_pending_responses AS r FROM ideas WHERE id = $1', [id])).rows[0].r).toBe(0);

    // Yanıtı geri çekme
    expect((await api().delete(`/api/ideas/${id}/response`).set(a.auth)).body.data).toEqual({ deleted: true });

    // İzlemeye al
    await api().put(`/api/ideas/${id}/bookmark`).set(a.auth).expect(200);
    const marks = await api().get('/api/ideas').query({ view: 'bookmarks' }).set(a.auth);
    expect(marks.body.data.items.map((i: any) => i.id)).toContain(id);
    expect(marks.body.data.items.find((i: any) => i.id === id).bookmarked).toBe(true);
    await api().delete(`/api/ideas/${id}/bookmark`).set(a.auth).expect(200);
    expect((await api().get('/api/ideas').query({ view: 'bookmarks' }).set(a.auth)).body.data.items.map((i: any) => i.id)).not.toContain(id);
  });

  it('yorum: 15 sn bekleme ve günlük 30 sınırı; yalnızca kendi yorumunu silebilir', async () => {
    const [author, c] = await Promise.all([createUser(), createUser()]);
    const s = await priced('IM');
    const id = (await create(author, body(s))).body.data.id;
    const first = await api().post(`/api/ideas/${id}/comments`).set(c.auth).send({ text: '  Senaryodaki talep varsayımı\n\n\n\nnereden geliyor?  ' });
    expect(first.status).toBe(201);
    expect(first.body.data.text).toBe('Senaryodaki talep varsayımı\n\nnereden geliyor?');
    const fast = await api().post(`/api/ideas/${id}/comments`).set(c.auth).send({ text: 'İkinci yorum' });
    expect(fast.status).toBe(429);
    expect(fast.body.code).toBe('RATE_LIMITED');
    expect((await api().post(`/api/ideas/${id}/comments`).set(c.auth).send({ text: 'x'.repeat(1001) })).status).toBe(400);
    expect((await api().delete(`/api/ideas/comments/${first.body.data.id}`).set(author.auth)).status).toBe(403);

    // Günlük sınır: bugün (İstanbul) yazılmış 30 yorum
    await pool.query('DELETE FROM idea_comments WHERE user_id = $1', [c.id]);
    await pool.query(
      `INSERT INTO idea_comments (idea_id, user_id, text, created_at) SELECT $1, $2, 'yorum ' || g, now() - INTERVAL '20 seconds' FROM generate_series(1, 30) g`,
      [id, c.id]
    );
    const daily = await api().post(`/api/ideas/${id}/comments`).set(c.auth).send({ text: 'Otuz birinci' });
    expect(daily.status).toBe(429);
    expect(daily.body).toMatchObject({ code: 'COMMENT_DAILY_LIMIT', limit: 30 });

    const list = await api().get(`/api/ideas/${id}/comments`).query({ limit: 10 }).set(author.auth);
    expect(list.body.data.items).toHaveLength(10);
    expect(list.body.data.has_more).toBe(true);
  });
});

describe('Ortak Akıl: değerlendirme işi (bildirimler bir kez)', () => {
  it('değerlendirme tarihi gelince yazara tek bildirim + zaman çizelgesi olayı', async () => {
    const u = await createUser();
    const s = await priced('ID');
    const id = (await create(u, body(s, { target_price: null, invalidation_price: null, review_date: istanbulDay(3) }))).body.data.id;
    await IdeasService.reviewJob();
    expect(await notes(u.id, 'ideas.review_due', id)).toHaveLength(0);

    await pool.query('UPDATE ideas SET review_date = $2::date WHERE id = $1', [id, istanbulDay(-1)]);
    await IdeasService.reviewJob();
    await IdeasService.reviewJob();
    const n = await notes(u.id, 'ideas.review_due', id);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ category: 'competition', link: `/ortak-akil/${id}` });
    const ev = await pool.query(`SELECT kind FROM idea_updates WHERE idea_id = $1 AND kind = 'review_due'`, [id]);
    expect(ev.rows).toHaveLength(1);
    const due = await api().get('/api/ideas').query({ view: 'review_due', q: s }).set(u.auth);
    expect(due.body.data.items[0]).toMatchObject({ id, review_due: true });
  });

  it('hedef ve geçersizlik seviyeleri aşılınca her biri için tek bildirim (güncel fiyat + fiyat geçmişi)', async () => {
    const u = await createUser();
    const s = await priced('IT');
    const id = (await create(u, body(s, { target_price: 110, invalidation_price: 95 }))).body.data.id;
    await IdeasService.reviewJob();
    expect(await notes(u.id, 'ideas.level_crossed', id)).toHaveLength(0);

    await setMarketPrice(s, 111);
    await IdeasService.reviewJob();
    await IdeasService.reviewJob();
    let n = await notes(u.id, 'ideas.level_crossed', id);
    expect(n).toHaveLength(1);
    expect(n[0].data).toMatchObject({ level: 'target', level_price: 110, price: 111 });

    // Fiyat geri döndü ama yayından sonra fiyat geçmişinde 94 görüldü → geçersizlik
    await setMarketPrice(s, 100);
    await pool.query(
      `INSERT INTO price_history (asset_type, symbol, granularity, bucket_start, price, currency) VALUES ('stock', $1, 'm15', now(), 94, 'USD')`,
      [s]
    );
    await IdeasService.reviewJob();
    await IdeasService.reviewJob();
    n = await notes(u.id, 'ideas.level_crossed', id);
    expect(n.map((x: any) => x.data.level).sort()).toEqual(['invalidation', 'target']);
    const d = (await api().get(`/api/ideas/${id}`).set(u.auth)).body.data;
    expect(d.target_hit_at).not.toBeNull();
    expect(d.invalidation_hit_at).not.toBeNull();
    expect(d.updates.map((x: any) => x.kind)).toEqual(['target_hit', 'invalidation_hit']);
  });
});

describe('Ortak Akıl: moderasyon', () => {
  it('şikâyet → yönetici kuyruğu; gizlenen öneri / yanıt / yorum başkalarına görünmez; denetim kaydı', async () => {
    const [author, reader, mod] = await Promise.all([createUser(), createUser(), admin()]);
    const s = await priced('IH');
    const id = (await create(author, body(s))).body.data.id;
    const resp = (await api().put(`/api/ideas/${id}/response`).set(reader.auth).send({ stance: 'katilmiyorum', reason: 'Bu kesin kazanç vaadi gibi duruyor.' })).body.data;
    const com = (await api().post(`/api/ideas/${id}/comments`).set(reader.auth).send({ text: 'Uygunsuz bir yorum' })).body.data;

    expect((await api().post('/api/ideas/reports').set(author.auth).send({ target_type: 'idea', target_id: id, reason: 'spam' })).body.code).toBe('OWN_CONTENT');
    const rep = await api().post('/api/ideas/reports').set(reader.auth).send({ target_type: 'idea', target_id: id, reason: 'tavsiye', note: 'Kesin getiri dili' });
    expect(rep.status).toBe(201);
    expect(rep.body.data.already_reported).toBe(false);
    expect((await api().post('/api/ideas/reports').set(reader.auth).send({ target_type: 'idea', target_id: id, reason: 'spam' })).body.data.already_reported).toBe(true);
    expect((await api().post('/api/ideas/reports').set(author.auth).send({ target_type: 'comment', target_id: com.id, reason: 'hakaret' })).status).toBe(201);

    // Yönetici olmayan yönetim uçlarına erişemez
    expect((await api().get('/api/admin/ideas/reports').set(reader.auth)).status).toBe(403);
    const queue = await api().get('/api/admin/ideas/reports').set(mod.auth);
    expect(queue.status).toBe(200);
    const item = queue.body.data.items.find((x: any) => x.target_id === id);
    expect(item).toMatchObject({ reason: 'tavsiye', status: 'acik', reporter_username: reader.username, target: { exists: true, hidden: false } });

    // Öneriyi gizle
    const hide = await api().post(`/api/admin/ideas/ideas/${id}/hide`).set(mod.auth).send({ reason: 'Kesin getiri vaadi' });
    expect(hide.status).toBe(200);
    expect((await api().get(`/api/ideas/${id}`).set(reader.auth)).status).toBe(404);
    expect((await api().get('/api/ideas').query({ q: s }).set(reader.auth)).body.data.items).toHaveLength(0);
    const own = (await api().get(`/api/ideas/${id}`).set(author.auth)).body.data;
    expect(own).toMatchObject({ hidden: true, hidden_reason: 'Kesin getiri vaadi', can: { close: false, add_update: false, comment: false } });
    expect((await api().post(`/api/ideas/${id}/comments`).set(author.auth).send({ text: 'Neden?' })).body.code).toBe('IDEA_HIDDEN');
    const audit = await pool.query(`SELECT action, target_type, target_label FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [id]);
    expect(audit.rows[0]).toMatchObject({ action: 'ideas.hide', target_type: 'idea', target_label: author.username });
    expect((await pool.query(`SELECT status FROM idea_reports WHERE target_id = $1`, [id])).rows.every((r: any) => r.status === 'islendi')).toBe(true);
    // Gizlenen önerinin başarı kaydına sayılmaz
    expect((await IdeasService.trackRecord(author.id)).published).toBe(0);

    await api().post(`/api/admin/ideas/ideas/${id}/unhide`).set(mod.auth).send({}).expect(200);
    expect((await api().get(`/api/ideas/${id}`).set(reader.auth)).status).toBe(200);
    expect((await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 AND action = 'ideas.unhide'`, [id])).rows).toHaveLength(1);

    // Yanıtı gizle: başkaları görmez, sayılmaz; yanıtın sahibi "gizlendi" olarak görür
    await api().post(`/api/admin/ideas/responses/${resp.id}/hide`).set(mod.auth).send({}).expect(200);
    const forAuthor = (await api().get(`/api/ideas/${id}`).set(author.auth)).body.data;
    expect(forAuthor.counts.disagree).toBe(0);
    expect(forAuthor.responses.disagree).toHaveLength(0);
    expect((await api().get(`/api/ideas/${id}`).set(reader.auth)).body.data.my_response).toMatchObject({ hidden: true });

    // Yorumu kaldır
    const del = await api().delete(`/api/admin/ideas/comments/${com.id}`).set(mod.auth);
    expect(del.status).toBe(200);
    expect((await api().get(`/api/ideas/${id}/comments`).set(author.auth)).body.data.items).toHaveLength(0);
    expect((await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1`, [com.id])).rows[0].action).toBe('ideas.comment_delete');
    expect((await pool.query(`SELECT status FROM idea_reports WHERE target_id = $1`, [com.id])).rows[0].status).toBe('islendi');

    // Yönetici listeleri
    const ideas = await api().get('/api/admin/ideas/ideas').query({ q: s }).set(mod.auth);
    expect(ideas.body.data.items[0]).toMatchObject({ id, hidden: false, username: author.username });
    const comments = await api().get('/api/admin/ideas/comments').set(mod.auth);
    expect(comments.body.data.items.find((x: any) => x.id === com.id)).toMatchObject({ deleted: true, deleted_by_username: mod.username });
    const summary = await api().get('/api/admin/ideas/summary').set(mod.auth);
    expect(summary.body.data).toHaveProperty('open_reports');

    // Şikâyeti reddet
    const rep2 = await api().post('/api/ideas/reports').set(author.auth).send({ target_type: 'response', target_id: resp.id, reason: 'diger' });
    const res = await api().post(`/api/admin/ideas/reports/${rep2.body.data.id}/resolve`).set(mod.auth).send({ status: 'reddedildi' });
    expect(res.status).toBe(200);
    expect((await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1`, [rep2.body.data.id])).rows[0].action).toBe('ideas.report_resolve');
  });
});

describe('Ortak Akıl: karşılaştırma, profil ve KVKK', () => {
  it('2–3 öneriyi yan yana döndürür; herkese açık profilde sakin başarı kaydı', async () => {
    const u = await createUser();
    const [s1, s2] = await Promise.all([priced('IK'), priced('IJ', 50)]);
    const a = (await create(u, body(s1))).body.data.id;
    const b = (await create(u, body(s2, { stance: 'izle', target_price: 60, invalidation_price: 40 }))).body.data.id;
    const cmp = await api().get('/api/ideas/compare').query({ ids: `${a},${b}` }).set(u.auth);
    expect(cmp.status).toBe(200);
    expect(cmp.body.data.items.map((x: any) => x.symbol)).toEqual([s1, s2]);
    expect(cmp.body.data.items[1]).toMatchObject({ stance: 'izle', ref_price: 50, rationale: RATIONALE, risks: RISKS });
    expect((await api().get('/api/ideas/compare').query({ ids: a }).set(u.auth)).status).toBe(400);

    const profile = await api().get(`/api/public/users/${u.username}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.ideas).toEqual({ published: 2, closed: 0, as_expected_pct: null, avg_days_to_close: null });
  });

  it('verilerimi indir önerileri içerir; hesap silinince öneriler ve yanıtlar silinir, yorum metni temizlenir', async () => {
    const [u, other] = await Promise.all([createUser(), createUser()]);
    const s = await priced('IX');
    const mine = (await create(u, body(s))).body.data.id;
    const theirs = (await create(other, body(s))).body.data.id;
    await api().put(`/api/ideas/${theirs}/response`).set(u.auth).send({ stance: 'katiliyorum', reason: 'Gerekçe yeterli görünüyor.' }).expect(200);
    await api().post(`/api/ideas/${theirs}/comments`).set(u.auth).send({ text: 'Kişisel yorumum' }).expect(201);
    await api().put(`/api/ideas/${theirs}/bookmark`).set(u.auth).expect(200);

    const exp = await AccountExportService.build(u.id);
    expect((exp.ideas as any[]).map((x) => x.id)).toEqual([mine]);
    expect(exp.idea_responses as any[]).toHaveLength(1);
    expect(exp.idea_comments as any[]).toHaveLength(1);
    expect(exp.idea_bookmarks as any[]).toHaveLength(1);
    expect(typeof exp.meta.sections.ideas).toBe('string');

    await AccountDeletionService.deleteAccount(u.id, { password: 'test-password-123' });
    expect((await pool.query('SELECT 1 FROM ideas WHERE id = $1', [mine])).rows).toHaveLength(0);
    expect((await pool.query('SELECT 1 FROM idea_responses WHERE user_id = $1', [u.id])).rows).toHaveLength(0);
    expect((await pool.query('SELECT 1 FROM idea_bookmarks WHERE user_id = $1', [u.id])).rows).toHaveLength(0);
    const c = (await pool.query('SELECT text, deleted_at FROM idea_comments WHERE user_id = $1', [u.id])).rows[0];
    expect(c.text).toBe('[silindi]');
    expect(c.deleted_at).not.toBeNull();
    expect((await api().get(`/api/ideas/${theirs}`).set(other.auth)).body.data.counts).toMatchObject({ agree: 0, comments: 0 });
  });
});
