import { describe, expect, it, beforeAll } from 'vitest';
import { api, createUser, pool, setMarketPrice, uniqueSymbol, type TestUser } from './helpers';
import { LeagueService } from '../src/services/leagues';
import { AccountExportService } from '../src/services/account/export';

// Portföy Ligi (023): kurallar, eşit sermaye, dönem dışı işlem yasağı, takım işlemleri, kapanış idempotentliği.
// Paylaşılan bellek içi PGlite (test/globalSetup.ts); uzak veritabanına asla bağlanılmaz.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as any[];

async function createPL(owner: TestUser, body: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/portfolio-leagues')
    .set(owner.auth)
    .send({ name: `TEST PL ${Math.random().toString(36).slice(2, 7)}`, starts_at: iso(HOUR), ends_at: iso(3 * DAY), ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; invite_code: string; mode: string; status: string };
}

async function join(user: TestUser, code: string) {
  return api().post('/api/leagues/join').set(user.auth).send({ code });
}

/** Başlangıcı geçmişe çekip ligi başlatır (cron / tembel geçişle aynı yol) */
async function startNow(leagueId: string) {
  await q(`UPDATE leagues SET starts_at = now() - INTERVAL '1 second' WHERE id = $1`, [leagueId]);
  return LeagueService.startLeague(leagueId);
}

async function endNow(leagueId: string) {
  await q(`UPDATE leagues SET ends_at = now() - INTERVAL '1 second' WHERE id = $1`, [leagueId]);
}

const trade = (user: TestUser, leagueId: string, body: Record<string, unknown>) =>
  api().post(`/api/portfolio-leagues/${leagueId}/portfolio/trades`).set(user.auth).send(body);

const notifications = (userId: string, type: string, leagueId: string) =>
  q(`SELECT * FROM notifications WHERE user_id = $1 AND type = $2 AND data->>'league_id' = $3 ORDER BY created_at`, [userId, type, leagueId]);

describe('Portföy Ligi (bireysel)', () => {
  let owner: TestUser;
  let a: TestUser;
  let b: TestUser;
  let sym: string;

  beforeAll(async () => {
    owner = await createUser();
    a = await createUser();
    b = await createUser({ balance: 0 }); // ana TL varlığı 0 olsa da portföy ligine katılabilir
    sym = uniqueSymbol('PL');
    await setMarketPrice(sym, 100, { assetType: 'stock' });
  });

  it('oluşturma: mode = portfolio, kurallar saklanır, listede rozet için mode döner; ana lig etkilenmez', async () => {
    const pl = await createPL(owner, { starting_capital_usd: 10_000, commission_bps: 50 });
    expect(pl.mode).toBe('portfolio');
    expect(pl.status).toBe('upcoming');
    const rules = (await q(`SELECT * FROM portfolio_league_rules WHERE league_id = $1`, [pl.id]))[0];
    expect(Number(rules.starting_capital_usd)).toBe(10_000);
    expect(rules.commission_bps).toBe(50);
    expect(rules.participation).toBe('solo');

    const main = await api().post('/api/leagues').set(owner.auth).send({ name: 'TEST Ana Lig', duration: '1w' });
    expect(main.status).toBe(201);
    expect(main.body.data.mode).toBe('main');
    // Ana lig: üyenin TL referansı hemen yazılır, portföy ligi uçları 404
    const m = (await q(`SELECT baseline_set_at FROM league_members WHERE league_id = $1`, [main.body.data.id]))[0];
    expect(m.baseline_set_at).not.toBeNull();
    expect((await api().get(`/api/portfolio-leagues/${main.body.data.id}`).set(owner.auth)).status).toBe(404);

    const list = await api().get('/api/leagues').set(owner.auth);
    const modes = Object.fromEntries(list.body.data.map((l: any) => [l.id, l.mode]));
    expect(modes[pl.id]).toBe('portfolio');
    expect(modes[main.body.data.id]).toBe('main');
  });

  it('geçersiz kurallar reddedilir (sermaye, komisyon, dönem)', async () => {
    const bad = async (body: Record<string, unknown>) =>
      (await api().post('/api/portfolio-leagues').set(owner.auth).send({ name: 'TEST kötü', starts_at: iso(HOUR), ends_at: iso(2 * DAY), ...body })).status;
    expect(await bad({ starting_capital_usd: 50_000 })).toBe(400);
    expect(await bad({ commission_bps: 30 })).toBe(400);
    expect(await bad({ ends_at: iso(HOUR + 12 * HOUR) })).toBe(400); // < 1 gün
    expect(await bad({ ends_at: iso(400 * DAY) })).toBe(400); // > 1 yıl
    expect(await bad({ participation: 'team', team_size: 7 })).toBe(400);
  });

  it('kurallar başlamadan değişir, başladıktan sonra değişmez (servis + veritabanı tetikleyicisi)', async () => {
    const pl = await createPL(owner);
    const ok = await api().patch(`/api/portfolio-leagues/${pl.id}/rules`).set(owner.auth).send({ commission_bps: 10 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.rules.commission_bps).toBe(10);
    // Sadece kurucu
    await join(a, pl.invite_code);
    expect((await api().patch(`/api/portfolio-leagues/${pl.id}/rules`).set(a.auth).send({ commission_bps: 0 })).status).toBe(403);

    expect(await startNow(pl.id)).toBe(true);
    const locked = await api().patch(`/api/portfolio-leagues/${pl.id}/rules`).set(owner.auth).send({ commission_bps: 50 });
    expect(locked.status).toBe(409);
    expect(locked.body.code ?? locked.body.error?.code ?? locked.body.message).toBeTruthy();
    await expect(pool.query(`UPDATE portfolio_league_rules SET starting_capital_usd = 1000000 WHERE league_id = $1`, [pl.id])).rejects.toThrow(
      /locked/
    );
    // Ana lig PATCH ucu da tarihleri kilitler
    const dates = await api().patch(`/api/leagues/${pl.id}`).set(owner.auth).send({ duration: '1m' });
    expect(dates.status).toBe(400);
    const detail = await api().get(`/api/portfolio-leagues/${pl.id}`).set(owner.auth);
    expect(detail.body.data.rules.locked).toBe(true);
    expect(detail.body.data.rules.commission_bps).toBe(10);
  });

  it('eşit sermaye, başlamadan / bittikten sonra işlem yok, kapanış idempotent', async () => {
    const pl = await createPL(owner, { starting_capital_usd: 100_000, commission_bps: 25 });
    expect((await join(a, pl.invite_code)).status).toBe(200);
    expect((await join(b, pl.invite_code)).status).toBe(200);

    // Başlamadan işlem yok, strateji yazılabilir (başkaları göremez)
    const early = await trade(a, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 1000 });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('LEAGUE_NOT_STARTED');
    expect((await api().put(`/api/portfolio-leagues/${pl.id}/strategy`).set(a.auth).send({ text: 'Teknoloji ağırlıklı al-tut' })).status).toBe(200);
    const hidden = await api().get(`/api/portfolio-leagues/${pl.id}/strategies`).set(owner.auth);
    const aRowBefore = hidden.body.data.rows.find((r: any) => r.label === a.username);
    expect(aRowBefore.strategy).toBeNull();
    expect(aRowBefore.strategy_hidden).toBe(true);

    // Katılımlar başlangıçtan 1 saat önce yapılmış olsun (beyan yazmaya fırsat vardı → başlayınca kilitlenir)
    await q(`UPDATE portfolio_league_entries SET created_at = now() - INTERVAL '1 hour' WHERE league_id = $1`, [pl.id]);
    expect(await startNow(pl.id)).toBe(true);
    expect(await LeagueService.startLeague(pl.id)).toBe(false); // ikinci başlatma etkisiz

    const ports = await q(
      `SELECT p.* FROM portfolio_league_entries e JOIN sandbox_portfolios p ON p.id = e.portfolio_id WHERE e.league_id = $1`,
      [pl.id]
    );
    expect(ports).toHaveLength(3);
    for (const p of ports) {
      expect(p.kind).toBe('league');
      expect(Number(p.starting_cash)).toBe(100_000);
      expect(Number(p.cash)).toBe(100_000);
      expect(p.commission_bps).toBe(25);
      expect(p.league_id).toBe(pl.id);
    }
    const ready = await notifications(a.id, 'league.portfolio_started', pl.id);
    expect(ready).toHaveLength(1);
    expect(ready[0].body).toContain('100.000 USD');

    // Strateji başladıktan sonra kilitli, herkes görebilir
    expect((await api().put(`/api/portfolio-leagues/${pl.id}/strategy`).set(a.auth).send({ text: 'değişti' })).status).toBe(409);
    const shown = await api().get(`/api/portfolio-leagues/${pl.id}/strategies`).set(owner.auth);
    expect(shown.body.data.rows.find((r: any) => r.label === a.username).strategy).toBe('Teknoloji ağırlıklı al-tut');

    // Dönem içinde işlem
    const buy = await trade(a, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 50_000 });
    expect(buy.status, JSON.stringify(buy.body)).toBe(201);
    await setMarketPrice(sym, 110, { assetType: 'stock' });
    const st = await api().get(`/api/portfolio-leagues/${pl.id}/standings`).set(b.auth);
    expect(st.status).toBe(200);
    expect(st.body.data.rows[0].label).toBe(a.username);
    expect(st.body.data.rows[0].rank).toBe(1);
    expect(st.body.data.rows[0].return_pct).toBeGreaterThan(4.5);
    expect(st.body.data.rows.find((r: any) => r.is_me).label).toBe(b.username);

    // Listede sıra / getiri portföyden gelir
    const mine = (await api().get('/api/leagues').set(a.auth)).body.data.find((l: any) => l.id === pl.id);
    expect(mine.my_rank).toBe(1);
    expect(mine.my_return_pct).toBeGreaterThan(4.5);

    // Bitiş geldi: kapanış işi çalışmamış olsa da işlem yok
    await endNow(pl.id);
    const late = await trade(a, pl.id, { side: 'sell', asset_type: 'stock', symbol: sym, all: true });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('LEAGUE_ENDED');

    // İstek anında tembel geçiş ligi zaten kapattı (cron'u beklemeden); ikinci kapanış etkisiz
    expect((await q(`SELECT finalized_at FROM leagues WHERE id = $1`, [pl.id]))[0].finalized_at).not.toBeNull();
    expect(await LeagueService.finalizeLeague(pl.id)).toBe(false);
    const finals = await q(`SELECT * FROM portfolio_league_entries WHERE league_id = $1 ORDER BY final_rank`, [pl.id]);
    expect(finals.map((e) => e.final_rank)).toEqual([1, 2, 3]);
    expect(finals[0].user_id).toBe(a.id);
    expect(Number(finals[0].final_return_pct)).toBeGreaterThan(4.5);
    expect(finals[0].final_trades).toBe(1);
    expect(finals[0].final_style_tags).toBeInstanceOf(Array);
    expect(finals.every((e) => e.finalized_at !== null && e.final_equity_usd !== null)).toBe(true);
    const frozen = await q(`SELECT status FROM sandbox_portfolios WHERE league_id = $1`, [pl.id]);
    expect(frozen.every((p) => p.status === 'frozen')).toBe(true);

    // İdempotent: ikinci kapanış hiçbir şey yapmaz; fiyat değişse de sonuç donuk
    await setMarketPrice(sym, 500, { assetType: 'stock' });
    expect(await LeagueService.finalizeLeague(pl.id)).toBe(false);
    expect(await LeagueService.finalizeDue()).toBeGreaterThanOrEqual(0);
    const again = await q(`SELECT id, final_rank, final_return_pct FROM portfolio_league_entries WHERE league_id = $1 ORDER BY final_rank`, [pl.id]);
    expect(again.map((e) => [e.final_rank, e.final_return_pct])).toEqual(finals.map((e) => [e.final_rank, e.final_return_pct]));
    expect(await notifications(a.id, 'league.portfolio_finished', pl.id)).toHaveLength(1);
    const st2 = await api().get(`/api/portfolio-leagues/${pl.id}/standings`).set(a.auth);
    expect(st2.body.data.status).toBe('finished');
    expect(st2.body.data.rows[0].return_pct).toBe(Number(finals[0].final_return_pct));

    // Bittikten sonra işlem yok (motor da donmuş portföyü reddeder), değerlendirme notu yazılabilir
    expect((await trade(b, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 100 })).status).toBe(409);
    expect((await api().put(`/api/portfolio-leagues/${pl.id}/reflection`).set(a.auth).send({ text: 'Erken yoğunlaştım, işe yaradı.' })).status).toBe(200);
    const perf = await api().get(`/api/portfolio-leagues/${pl.id}/performance`).set(a.auth);
    expect(perf.status).toBe(200);
    expect(perf.body.data.series.length).toBe(3);
    expect(perf.body.data.series[0].points[0].v).toBe(100);
    expect(perf.body.data.weekly.rows).toHaveLength(3);
  });

  it('geç katılım: süre içinde aynı sermaye + işaret; süre sonra katılım kapalı', async () => {
    const pl = await createPL(await createUser(), { starting_capital_usd: 1_000_000 });
    await startNow(pl.id);
    const late = await createUser();
    expect((await join(late, pl.invite_code)).status).toBe(200);
    const e = (await q(`SELECT e.late_join, p.starting_cash FROM portfolio_league_entries e JOIN sandbox_portfolios p ON p.id = e.portfolio_id
                        WHERE e.league_id = $1 AND e.user_id = $2`, [pl.id, late.id]))[0];
    expect(e.late_join).toBe(true);
    expect(Number(e.starting_cash)).toBe(1_000_000);

    // Geç katılım süresi: dönemin ilk %20'si — başlangıcı geriye çekince kapanır
    await q(`UPDATE leagues SET started_at = now() - INTERVAL '3 days', ends_at = now() + INTERVAL '7 days' WHERE id = $1`, [pl.id]);
    const tooLate = await createUser();
    const r = await join(tooLate, pl.invite_code);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('LATE_JOIN_CLOSED');
    expect((await q(`SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`, [pl.id, tooLate.id])).length).toBe(0);
  });

  it('ayrılan katılımcı sıralamadan çıkar; geri dönerse aynı portföy (sıfırlama yok)', async () => {
    owner = await createUser();
    const pl = await createPL(owner);
    const x = await createUser();
    await join(x, pl.invite_code);
    await startNow(pl.id);
    expect((await trade(x, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 10_000 })).status).toBe(201);
    const before = (await q(`SELECT portfolio_id FROM portfolio_league_entries WHERE league_id = $1 AND user_id = $2`, [pl.id, x.id]))[0];
    expect((await api().post(`/api/leagues/${pl.id}/leave`).set(x.auth)).status).toBe(200);
    const st = await api().get(`/api/portfolio-leagues/${pl.id}/standings`).set(owner.auth);
    expect(st.body.data.rows.some((r: any) => r.user_id === x.id)).toBe(false);
    expect((await join(x, pl.invite_code)).status).toBe(200);
    const after = (await q(`SELECT portfolio_id, withdrawn_at FROM portfolio_league_entries WHERE league_id = $1 AND user_id = $2`, [pl.id, x.id]))[0];
    expect(after.portfolio_id).toBe(before.portfolio_id);
    expect(after.withdrawn_at).toBeNull();
  });
});

describe('Portföy Ligi (takım)', () => {
  let owner: TestUser;
  let m1: TestUser;
  let m2: TestUser;
  let loner: TestUser;
  let sym: string;

  beforeAll(async () => {
    owner = await createUser();
    m1 = await createUser();
    m2 = await createUser();
    loner = await createUser();
    sym = uniqueSymbol('TM');
    await setMarketPrice(sym, 50, { assetType: 'stock' });
  });

  it('takım kur / koda göre katıl; takımın her üyesi işlem yapar, işlemi yapan kaydedilir', async () => {
    const pl = await createPL(owner, { participation: 'team', team_size: 2, max_teams: 3 });
    for (const u of [m1, m2, loner]) expect((await join(u, pl.invite_code)).status).toBe(200);

    const t1 = await api().post(`/api/portfolio-leagues/${pl.id}/teams`).set(m1.auth).send({ name: 'Boğalar' });
    expect(t1.status).toBe(201);
    const code = t1.body.data.invite_code as string;
    expect((await api().post(`/api/portfolio-leagues/${pl.id}/teams`).set(owner.auth).send({ name: 'boğalar' })).status).toBe(409);
    expect((await api().post(`/api/portfolio-leagues/${pl.id}/teams/join`).set(m2.auth).send({ code })).status).toBe(200);
    // Takım dolu (kapasite 2)
    const full = await api().post(`/api/portfolio-leagues/${pl.id}/teams/join`).set(loner.auth).send({ code });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('TEAM_FULL');
    // Takımdan ayrılıp yeniden katılma (başlamadan)
    expect((await api().post(`/api/portfolio-leagues/${pl.id}/teams/leave`).set(m2.auth)).status).toBe(200);
    expect((await api().post(`/api/portfolio-leagues/${pl.id}/teams/join`).set(m2.auth).send({ code })).status).toBe(200);
    expect((await api().post(`/api/portfolio-leagues/${pl.id}/teams`).set(owner.auth).send({ name: 'Ayılar' })).status).toBe(201);

    const detail = await api().get(`/api/portfolio-leagues/${pl.id}`).set(m2.auth);
    expect(detail.body.data.teams).toHaveLength(2);
    const mine = detail.body.data.teams.find((t: any) => t.is_mine);
    expect(mine.members.map((x: any) => x.username).sort()).toEqual([m1.username, m2.username].sort());
    expect(mine.members.find((x: any) => x.is_captain).username).toBe(m1.username);
    // Başka takımın kodu görünmez
    expect(detail.body.data.teams.find((t: any) => !t.is_mine).invite_code).toBeNull();
    expect(detail.body.data.unassigned.map((x: any) => x.username)).toEqual([loner.username]);

    await startNow(pl.id);
    const teamPortfolios = await q(`SELECT * FROM sandbox_portfolios WHERE league_id = $1 ORDER BY created_at`, [pl.id]);
    expect(teamPortfolios).toHaveLength(2);
    expect(teamPortfolios.every((p) => p.team_id !== null && Number(p.starting_cash) === 100_000)).toBe(true);
    // Başladıktan sonra takım değiştirilemez
    expect((await api().post(`/api/portfolio-leagues/${pl.id}/teams/leave`).set(m2.auth)).status).toBe(409);

    // Her iki üye de AYNI takım portföyünde işlem yapar
    expect((await trade(m1, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 20_000 })).status).toBe(201);
    expect((await trade(m2, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 10_000 })).status).toBe(201);
    // Takımı olmayan işlem yapamaz
    const no = await trade(loner, pl.id, { side: 'buy', asset_type: 'stock', symbol: sym, amount_usd: 100 });
    expect(no.status).toBe(409);
    expect(no.body.code).toBe('NO_ENTRY');

    const port = await api().get(`/api/portfolio-leagues/${pl.id}/portfolio`).set(m1.auth);
    expect(port.status).toBe(200);
    expect(port.body.data.kind).toBe('team');
    const actors = port.body.data.portfolio.trades.map((t: any) => t.actor_username).sort();
    expect(actors).toEqual([m1.username, m2.username].sort());

    const st = await api().get(`/api/portfolio-leagues/${pl.id}/standings`).set(m2.auth);
    const teamRow = st.body.data.rows.find((r: any) => r.label === 'Boğalar');
    expect(teamRow.kind).toBe('team');
    expect(teamRow.is_me).toBe(true);
    expect(teamRow.trades_count).toBe(2);
    expect(Object.fromEntries(teamRow.members.map((x: any) => [x.username, x.trades_count]))).toEqual({ [m1.username]: 1, [m2.username]: 1 });

    // Kapanış: takım üyelerine sıra bildirimi
    await endNow(pl.id);
    expect(await LeagueService.finalizeLeague(pl.id)).toBe(true);
    const n = await notifications(m2.id, 'league.portfolio_finished', pl.id);
    expect(n).toHaveLength(1);
    expect(n[0].data.rank).not.toBeNull();
    expect(await notifications(loner.id, 'league.portfolio_finished', pl.id)).toHaveLength(1);
  });

  it('KVKK: takım üyeliği ve strateji notları dışa aktarılır', async () => {
    const pl = await createPL(owner, { participation: 'team', team_size: 3, max_teams: 2 });
    const u = await createUser();
    await join(u, pl.invite_code);
    await api().post(`/api/portfolio-leagues/${pl.id}/teams`).set(u.auth).send({ name: 'Veri Takımı' });
    await api().put(`/api/portfolio-leagues/${pl.id}/strategy`).set(u.auth).send({ text: 'Dengeli dağılım' });
    const out = await AccountExportService.build(u.id);
    expect((out.portfolio_league_teams as any[]).map((t) => t.team_name)).toEqual(['Veri Takımı']);
    expect((out.portfolio_league_entries as any[])[0].strategy).toBe('Dengeli dağılım');
  });
});
