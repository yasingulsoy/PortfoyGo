import { afterEach, describe, expect, it } from 'vitest';
import { api, createUser, pool, TestUser } from './helpers';
import {
  DigestMail,
  DigestService,
  digestSendEnabled,
  previousWeekWindow,
  publicUrls,
  tradeExtremes,
} from '../src/services/email/digest';
import { DigestData, formatPct, rankChangeText, renderDigestHtml, renderDigestText } from '../src/services/email/digestTemplate';
import { tipForWeek } from '../src/services/email/tips';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../src/services/email/unsubscribe';

// Haftalık e-posta özeti: abonelik token'ı, tek tıkla abonelikten çıkma, gönderim koruması ve idempotentlik.
// GERÇEK E-POSTA GÖNDERİLMEZ: testlerde sahte bir `mailer` verilir (SMTP_* değişkenleri vitest.config'te boş).

const prefsOf = async (userId: string) => (await pool.query('SELECT notification_prefs FROM users WHERE id = $1', [userId])).rows[0].notification_prefs;
const digestRow = async (userId: string, week: string) =>
  (await pool.query('SELECT status, attempts, error, sent_at FROM email_digests WHERE user_id = $1 AND week_key = $2', [userId, week])).rows[0];

function fakeMailer(opts: { fail?: boolean; noTransport?: boolean } = {}) {
  const sent: DigestMail[] = [];
  const mailer = async (mail: DigestMail) => {
    if (opts.noTransport) return false;
    if (opts.fail) throw new Error('SMTP 421 geçici hata');
    sent.push(mail);
    return true;
  };
  return { sent, mailer };
}

describe('abonelik token’ı', () => {
  const id = '6f1c2f7e-9a51-4c1e-8e7a-0f6f1b2c3d4e';

  it('imzalar ve doğrular; değiştirilmiş / başka amaç / başka anahtar geçersiz', () => {
    const token = signUnsubscribeToken(id);
    expect(token.startsWith(`${id}.`)).toBe(true);
    expect(verifyUnsubscribeToken(token)).toBe(id);
    expect(verifyUnsubscribeToken(token.toUpperCase())).toBeNull();
    expect(verifyUnsubscribeToken(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(verifyUnsubscribeToken(token.replace(id, '00000000-0000-4000-8000-000000000000'))).toBeNull();
    expect(verifyUnsubscribeToken(token, 'baska_amac')).toBeNull();
    expect(verifyUnsubscribeToken(signUnsubscribeToken(id, 'email_digest', 'baska-anahtar'))).toBeNull();
    for (const bad of ['', 'abc', `${id}.`, `.${'x'.repeat(43)}`, null, 42, 'x'.repeat(500)]) expect(verifyUnsubscribeToken(bad)).toBeNull();
    expect(() => signUnsubscribeToken('kullanici')).toThrow();
  });
});

describe('abonelikten çıkma uçları', () => {
  it('GET: aboneliği kapatır ve onay sayfası döner; geçersiz token 400', async () => {
    const u = await createUser();
    const token = signUnsubscribeToken(u.id);
    const r = await api().get('/api/email/unsubscribe').query({ token });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.text).toContain('aboneliğin iptal edildi');
    expect(r.text).toContain('Yeniden abone ol');
    expect((await prefsOf(u.id)).email_digest).toBe(false);
    // Bildirim tercihlerinde de görünür
    expect((await api().get('/api/notifications/prefs').set(u.auth)).body.data.email_digest).toBe(false);

    const bad = await api().get('/api/email/unsubscribe').query({ token: `${token}x` });
    expect(bad.status).toBe(400);
    expect(bad.text).toContain('Bağlantı geçersiz');
    expect((await api().get('/api/email/unsubscribe')).status).toBe(400);
  });

  it('POST: RFC 8058 tek tık (JSON) ve form ile yeniden abone olma', async () => {
    const u = await createUser();
    const token = signUnsubscribeToken(u.id);
    const one = await api()
      .post(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(one.status).toBe(200);
    expect(one.body).toEqual({ success: true, data: { email_digest: false } });
    expect((await prefsOf(u.id)).email_digest).toBe(false);

    const re = await api()
      .post(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .set('Accept', 'text/html')
      .type('form')
      .send('action=resubscribe');
    expect(re.status).toBe(200);
    expect(re.text).toContain('Yeniden abone oldun');
    expect((await prefsOf(u.id)).email_digest).toBe(true);

    expect((await api().post('/api/email/unsubscribe?token=bozuk').type('form').send('List-Unsubscribe=One-Click')).status).toBe(400);
  });

  it('silinmiş kullanıcının token’ı → 404', async () => {
    const u = await createUser();
    const token = signUnsubscribeToken(u.id);
    await pool.query('DELETE FROM users WHERE id = $1', [u.id]);
    const r = await api().get('/api/email/unsubscribe').query({ token });
    expect(r.status).toBe(404);
    expect(r.text).toContain('Hesap bulunamadı');
  });
});

describe('gönderim koruması', () => {
  it('production dışında yalnızca EMAIL_DIGEST_SEND=1 ile; production’da EMAIL_DIGEST_SEND=0 kapatır', () => {
    expect(digestSendEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(digestSendEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(digestSendEnabled({ NODE_ENV: 'development', EMAIL_DIGEST_SEND: 'true' })).toBe(false);
    expect(digestSendEnabled({ NODE_ENV: 'development', EMAIL_DIGEST_SEND: '1' })).toBe(true);
    expect(digestSendEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(digestSendEnabled({ NODE_ENV: 'production', EMAIL_DIGEST_SEND: '0' })).toBe(false);
    // Bu test sürecinin kendisi: gönderim kapalı
    expect(digestSendEnabled()).toBe(false);
  });
});

describe('saf yardımcılar', () => {
  it('previousWeekWindow: Pazartesi 09:00 İstanbul → önceki tam hafta; yıl geçişi; Pazar gecesi', () => {
    const w = previousWeekWindow(new Date('2026-10-12T06:00:00Z'));
    expect(w).toEqual({
      weekKey: '2026-W41',
      start: new Date('2026-10-04T21:00:00Z'),
      end: new Date('2026-10-11T21:00:00Z'),
      label: '5–11 Ekim 2026',
    });
    expect(previousWeekWindow(new Date('2026-01-05T06:00:00Z'))).toMatchObject({ weekKey: '2026-W01', label: '29 Aralık 2025 – 4 Ocak 2026' });
    // Pazar 23:30 İstanbul: içinde bulunulan hafta henüz bitmedi → bir önceki
    expect(previousWeekWindow(new Date('2026-10-11T20:30:00Z'))).toMatchObject({ weekKey: '2026-W40', label: '28 Eylül – 4 Ekim 2026' });
    // Pazartesi 00:00 İstanbul (tam sınır)
    expect(previousWeekWindow(new Date('2026-10-11T21:00:00Z')).weekKey).toBe('2026-W41');
  });

  it('tradeExtremes: haftadaki satışları ortalama maliyete göre değerlendirir', () => {
    const rows = [
      { type: 'buy' as const, symbol: 'AAPL', asset_type: 'stock', quantity: 10, price: 100, in_window: false },
      { type: 'buy' as const, symbol: 'AAPL', asset_type: 'stock', quantity: 10, price: 120, in_window: true },
      { type: 'sell' as const, symbol: 'AAPL', asset_type: 'stock', quantity: 5, price: 132, in_window: true }, // ort. 110 → +%20
      { type: 'buy' as const, symbol: 'BTC', asset_type: 'crypto', quantity: 1, price: 50, in_window: true },
      { type: 'sell' as const, symbol: 'BTC', asset_type: 'crypto', quantity: 1, price: 45, in_window: true }, // −%10
      { type: 'sell' as const, symbol: 'ETH', asset_type: 'crypto', quantity: 1, price: 45, in_window: true }, // alışı yok → sayılmaz
    ];
    expect(tradeExtremes(rows)).toEqual({ count: 5, best: { symbol: 'AAPL', return_pct: 20 }, worst: { symbol: 'BTC', return_pct: -10 } });
    // Tek satış: yönüne göre
    expect(tradeExtremes(rows.slice(3, 5))).toEqual({ count: 2, best: null, worst: { symbol: 'BTC', return_pct: -10 } });
    expect(tradeExtremes([])).toEqual({ count: 0, best: null, worst: null });
    // Hafta öncesi satış sayılmaz ama maliyeti düşürür
    expect(
      tradeExtremes([
        { type: 'buy', symbol: 'X', asset_type: 'stock', quantity: 2, price: 10, in_window: false },
        { type: 'sell', symbol: 'X', asset_type: 'stock', quantity: 1, price: 20, in_window: false },
        { type: 'sell', symbol: 'X', asset_type: 'stock', quantity: 1, price: 15, in_window: true },
      ])
    ).toEqual({ count: 1, best: { symbol: 'X', return_pct: 50 }, worst: null });
  });

  it('şablon: kaçışlama, abonelik bağlantısı, tutar yok', () => {
    const data: DigestData = {
      username: '<script>x</script>',
      week: { key: '2026-W41', label: '5–11 Ekim 2026' },
      portfolio: { change_pct: 1.234, total_return_pct: -2.5 },
      rank: { current: 3, previous: 7, players: 120, joined_this_week: false },
      trades: { count: 4, best: { symbol: 'AAPL', return_pct: 12.5 }, worst: { symbol: 'TSLA', return_pct: -3.25 } },
      arena: { rounds: 2, best_return_pct: 4.5 },
      picks: { week_id: '2026-W41', symbol: 'BTC', direction: 'up', status: 'active', return_pct: 2.1, rank: 2, participants: 40 },
      tip: tipForWeek('2026-W41'),
      links: { site: 'https://portfoygo.test', profile: 'https://portfoygo.test/u/x', unsubscribe: 'https://api.portfoygo.test/api/email/unsubscribe?token=a.b', preferences: 'https://portfoygo.test/profile' },
    };
    const html = renderDigestHtml(data);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('+%1,23');
    expect(html).toContain('−%2,50');
    expect(html).toContain('▲ 4 sıra yükseldin');
    expect(html).toContain('https://api.portfoygo.test/api/email/unsubscribe?token=a.b');
    expect(html).toContain('sanal para');
    const text = renderDigestText(data);
    expect(text).toContain('En iyi işlemin: AAPL +%12,50');
    expect(text).toContain('Abonelikten çık: https://api.portfoygo.test/api/email/unsubscribe?token=a.b');
    for (const out of [html, text]) {
      expect(out).not.toMatch(/\d[\d.,]*\s?(TL|₺)/);
      expect(out).not.toContain('₺');
    }
    expect(formatPct(0.004)).toBe('%0,00');
    expect(rankChangeText(5, 5)).toBe('Sıran değişmedi');
    expect(rankChangeText(9, 5)).toBe('▼ 4 sıra geriledin');
    expect(rankChangeText(3, null, true)).toBe('Bu hafta sıralamaya girdin');
    expect(rankChangeText(null, null)).toBe('Sıralama bilgisi henüz yok');
  });

  it('publicUrls: göreli API adresi site üzerinden çözülür', () => {
    expect(publicUrls({ PUBLIC_SITE_URL: 'https://portfoygo.com/', PUBLIC_API_URL: '/api/backend' })).toEqual({
      site: 'https://portfoygo.com',
      api: 'https://portfoygo.com/api/backend',
    });
    expect(publicUrls({})).toEqual({ site: 'http://localhost:3000', api: 'http://localhost:5001/api' });
  });
});

describe('haftalık özet işi (DB)', () => {
  // Pazartesi 12 Şubat 2001 09:00 İstanbul → özetlenen hafta 5–11 Şubat 2001 (2001-W06)
  const NOW = new Date('2001-02-12T06:00:00Z');
  const WEEK = '2001-W06';
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  async function seedActivity(u: TestUser) {
    // Günlük kapanış noktaları: hafta başı 100.000 → hafta sonu 105.000 (+%5)
    await pool.query(
      `INSERT INTO portfolio_snapshots (user_id, granularity, bucket_start, taken_at, cash, holdings_value, total_value) VALUES
         ($1, 'day', '2001-02-03T21:00:00Z', '2001-02-04T20:55:00Z', 100000, 0, 100000),
         ($1, 'day', '2001-02-10T21:00:00Z', '2001-02-11T20:55:00Z', 50000, 55000, 105000)`,
      [u.id]
    );
    // Haftadan önce alış (100), hafta içinde satış (110) → +%10
    await pool.query(
      `INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount, created_at) VALUES
         ($1, 'buy', 'DGST', 'Digest Test', 'stock', 10, 100, 1000, 0, 1000, '2001-01-20 10:00:00'),
         ($1, 'sell', 'DGST', 'Digest Test', 'stock', 10, 110, 1100, 0, 1100, '2001-02-07 10:00:00')`,
      [u.id]
    );
  }

  it('tercihi kapalı / doğrulanmamış kullanıcılar atlanır; aynı hafta ikinci kez gönderilmez', async () => {
    const a = await createUser();
    const optedOut = await createUser();
    const unverified = await createUser({ verified: false });
    await pool.query(`UPDATE users SET notification_prefs = '{"email_digest": false}'::jsonb WHERE id = $1`, [optedOut.id]);
    await seedActivity(a);

    const { sent, mailer } = fakeMailer();
    const only = [a.id, optedOut.id, unverified.id];
    const first = await DigestService.run({ now: NOW, send: true, mailer, onlyUserIds: only });
    expect(first).toMatchObject({ week_key: WEEK, mode: 'send', recipients: 1, sent: 1, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe(a.email);
    expect(mail.subject).toContain('+%5,00');
    expect(mail.html).toContain('DGST');
    expect(mail.html).toContain('+%10,00');
    expect(mail.text).toContain('Portföy (geçen hafta): +%5,00');
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<http:\/\/localhost:5001\/api\/email\/unsubscribe\?token=.+>$/);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    // Bağlantıdaki token gerçekten bu kullanıcıya ait
    const token = decodeURIComponent(/token=([^>]+)>/.exec(mail.headers['List-Unsubscribe'])![1]);
    expect(verifyUnsubscribeToken(token)).toBe(a.id);
    expect(await digestRow(a.id, WEEK)).toMatchObject({ status: 'sent', attempts: 1 });

    // İdempotent: ikinci çalıştırma hiçbir şey göndermez
    const second = await DigestService.run({ now: NOW, send: true, mailer, onlyUserIds: only });
    expect(second).toMatchObject({ recipients: 1, sent: 0, skipped: 1 });
    expect(sent).toHaveLength(1);
  });

  it('gönderim kapalıyken (varsayılan, production dışı) yalnızca önizleme; önizleme gerçek gönderimi engellemez', async () => {
    delete process.env.EMAIL_DIGEST_SEND;
    const u = await createUser();
    await seedActivity(u);
    const { sent, mailer } = fakeMailer();

    const preview = await DigestService.run({ now: NOW, mailer, onlyUserIds: [u.id] });
    expect(preview).toMatchObject({ mode: 'preview', recipients: 1, previewed: 1, sent: 0 });
    expect(sent).toHaveLength(0); // mailer HİÇ çağrılmadı
    expect(await digestRow(u.id, WEEK)).toMatchObject({ status: 'preview', attempts: 0 });
    // Önizleme de idempotent
    expect(await DigestService.run({ now: NOW, mailer, onlyUserIds: [u.id] })).toMatchObject({ previewed: 0, skipped: 1 });
    expect(sent).toHaveLength(0);

    // Açıkça izin verilirse gönderilir (önizleme satırı engel değil), sonra tekrar gönderilmez
    process.env.EMAIL_DIGEST_SEND = '1';
    expect(await DigestService.run({ now: NOW, mailer, onlyUserIds: [u.id] })).toMatchObject({ mode: 'send', sent: 1 });
    expect(await DigestService.run({ now: NOW, mailer, onlyUserIds: [u.id] })).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(1);
  });

  it('SMTP hatası kaydedilir ve en fazla 3 kez yeniden denenir; taşıyıcı yoksa tur durur', async () => {
    const u = await createUser();
    const failing = fakeMailer({ fail: true });
    expect(await DigestService.run({ now: NOW, send: true, mailer: failing.mailer, onlyUserIds: [u.id] })).toMatchObject({ failed: 1, sent: 0 });
    expect(await digestRow(u.id, WEEK)).toMatchObject({ status: 'failed', attempts: 1, error: expect.stringContaining('SMTP') });
    await DigestService.run({ now: NOW, send: true, mailer: failing.mailer, onlyUserIds: [u.id] });
    const ok = fakeMailer();
    expect(await DigestService.run({ now: NOW, send: true, mailer: ok.mailer, onlyUserIds: [u.id] })).toMatchObject({ sent: 1 });
    expect(await digestRow(u.id, WEEK)).toMatchObject({ status: 'sent', attempts: 3, error: null });

    const v = await createUser();
    const none = fakeMailer({ noTransport: true });
    expect(await DigestService.run({ now: NOW, send: true, mailer: none.mailer, onlyUserIds: [v.id] })).toMatchObject({ aborted: 'no_transport', sent: 0 });
    expect(await digestRow(v.id, WEEK)).toBeUndefined();

    // Deneme hakkı biten satır tekrar denenmez
    const w = await createUser();
    for (let i = 0; i < 4; i++) await DigestService.run({ now: NOW, send: true, mailer: failing.mailer, onlyUserIds: [w.id] });
    expect(await digestRow(w.id, WEEK)).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('geliştirme önizleme ucu: HTML / metin; yerel DB dışında 404', async () => {
    const u = await createUser();
    const r = await api().get('/api/dev/email/digest-preview').query({ username: u.username });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.text).toContain(`Merhaba ${u.username}`);
    expect(r.headers['x-digest-week']).toMatch(/^\d{4}-W\d{2}$/);
    const t = await api().get('/api/dev/email/digest-preview').query({ username: u.username, format: 'text' });
    expect(t.text).toContain('Konu:');
    expect((await api().get('/api/dev/email/digest-preview').query({ username: 'boyle_biri_yok_xyz' })).status).toBe(404);
    expect((await api().get('/api/dev/email/digest-preview')).status).toBe(400);
    // Önizleme hiçbir şey kaydetmez
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM email_digests WHERE user_id = $1', [u.id])).rows[0].n).toBe(0);

    process.env.DEV_LOGIN = '0';
    expect((await api().get('/api/dev/email/digest-preview').query({ username: u.username })).status).toBe(404);
  });
});
