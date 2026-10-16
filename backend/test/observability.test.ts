import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { api } from './helpers';
import { bearerMatches } from '../src/routes/metrics';
import { metricsObserver } from '../src/jobs/runtime';
import { metricsRegistry } from '../src/observability/metrics';
import { instrumentProvider } from '../src/observability/providerMetrics';
import { REDACTED, captureError, scrubEvent, scrubText, sentryEnabled } from '../src/observability/sentry';
import { sanitizeClientError, sanitizePath, sanitizeStack } from '../src/routes/clientErrors';
import { logger } from '../src/utils/logger';

const TOKEN = 'test-metrics-token-0123456789';

describe('GET /metrics (Prometheus)', () => {
  let app: Express;

  beforeAll(async () => {
    process.env.METRICS_TOKEN = TOKEN;
    const { createApp } = await import('../src/app');
    app = createApp(); // METRICS_TOKEN tanımlıyken kurulan uygulama: istek süresi histogramı takılı
  });

  afterAll(() => {
    process.env.METRICS_TOKEN = '';
  });

  it('METRICS_TOKEN tanımsızken 404 (uç yokmuş gibi)', async () => {
    process.env.METRICS_TOKEN = '';
    try {
      const res = await api().get('/metrics');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'Endpoint bulunamadı' });
    } finally {
      process.env.METRICS_TOKEN = TOKEN;
    }
  });

  it('belirteç yok / yanlış → 401', async () => {
    expect((await request(app).get('/metrics')).status).toBe(401);
    const wrong = await request(app).get('/metrics').set('Authorization', 'Bearer yanlis');
    expect(wrong.status).toBe(401);
    expect(wrong.headers['www-authenticate']).toContain('Bearer');
    expect(bearerMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(bearerMatches(`Basic ${TOKEN}`, TOKEN)).toBe(false);
    expect(bearerMatches(undefined, TOKEN)).toBe(false);
  });

  it('doğru belirteç → 200; istek süresi rota şablonu + durum koduyla, iş ve sağlayıcı metrikleri', async () => {
    await request(app).get('/api/health');
    // Hata yolunda (AppError → errorHandler) da rota şablonu korunur
    await request(app).get('/api/arena/broadcast/0123456789abcdef0123456789abcdef');
    await request(app).get('/bu-yol-yok');
    metricsObserver.onFinish?.('orders', { status: 'ok', startedAt: new Date(), durationMs: 12, errorMessage: null });
    metricsObserver.onSkip?.('orders', 'locked', new Date());

    const res = await request(app).get('/metrics').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    const body = res.text;
    expect(body).toMatch(/portfoygo_http_request_duration_seconds_bucket\{[^}]*method="GET"[^}]*route="\/api\/health"[^}]*status_code="200"/);
    expect(body).toMatch(/portfoygo_http_request_duration_seconds_count\{[^}]*route="\/api\/arena\/broadcast\/:token"[^}]*status_code="404"/);
    expect(body).toMatch(/route="unmatched"/);
    expect(body).not.toContain('0123456789abcdef0123456789abcdef');
    expect(body).toMatch(/portfoygo_job_runs_total\{job="orders",status="ok"\} 1/);
    expect(body).toMatch(/portfoygo_job_skips_total\{job="orders",reason="locked"\} 1/);
    expect(body).toContain('portfoygo_job_duration_seconds_bucket');
    expect(body).toContain('portfoygo_sse_connections');
    expect(body).toContain('portfoygo_process_cpu_user_seconds_total');
  });

  it('sağlayıcı sarmalayıcısı: Promise hatası error, başarı ok sayılır; davranış ve spyOn değişmez', async () => {
    const provider = instrumentProvider('stocks', {
      id: 'fake',
      isConfigured: () => true,
      ok: async (x: number) => x * 2,
      fail: async () => {
        throw new Error('429');
      },
    });
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.ok(2)).toBe(4);
    await expect(provider.fail()).rejects.toThrow('429');
    const spy = vi.spyOn(provider, 'ok').mockResolvedValue(99);
    expect(await provider.ok(1)).toBe(99);
    spy.mockRestore();
    const text = await metricsRegistry.metrics();
    expect(text).toMatch(/portfoygo_provider_calls_total\{kind="stocks",provider="fake",method="fail",outcome="error"\} 1/);
    expect(text).toMatch(/portfoygo_provider_calls_total\{kind="stocks",provider="fake",method="ok",outcome="ok"\} 2/);
  });
});

describe('Sentry temizleme (SENTRY_DSN yokken no-op)', () => {
  it('kapalıyken captureError hiçbir şey yapmaz', () => {
    expect(sentryEnabled()).toBe(false);
    expect(() => captureError(new Error('x'))).not.toThrow();
  });

  it('çerez, Authorization, şifre / token alanları, sorgu dizesi ve e-postalar temizlenir', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'kayıt başarısız: ali@example.com',
      request: {
        url: 'https://api.portfoygo.com/api/auth/reset?token=abc&email=ali@example.com',
        query_string: 'token=abc',
        cookies: { pg_session: 'secret-jwt' },
        headers: { Authorization: 'Bearer x', cookie: 'pg_session=1', 'user-agent': 'UA' },
        data: { email: 'ali@example.com', password: 'p4ss', nested: { newPassword: 'n', totpCode: '123456', ok: 1 } },
      },
      user: { id: 'u-1', email: 'ali@example.com', ip_address: '1.2.3.4' },
      exception: { values: [{ type: 'Error', value: 'duplicate key ali@example.com' }] },
      extra: { apiKey: 'k', note: 'GET /api/x?code=123' },
      breadcrumbs: [{ category: 'http', data: { url: 'http://x/y?token=1' }, message: 'veli@example.com' }],
    });
    const json = JSON.stringify(event);
    for (const leak of ['secret-jwt', 'p4ss', 'ali@example.com', 'veli@example.com', 'token=abc', 'Bearer x', '123456', 'code=123', '1.2.3.4']) {
      expect(json).not.toContain(leak);
    }
    expect(event.request?.url).toBe('https://api.portfoygo.com/api/auth/reset');
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers?.Authorization).toBe(REDACTED);
    expect(event.request?.headers?.['user-agent']).toBe('UA');
    expect((event.request?.data as Record<string, unknown>).password).toBe(REDACTED);
    expect(event.user).toEqual({ id: 'u-1' });
    expect((event.extra as Record<string, unknown>).apiKey).toBe(REDACTED);
    expect(event.breadcrumbs?.[0].data?.url).toBe('http://x/y');
    expect(scrubText('see /verify-email?code=1 and https://a.b/c#frag')).toBe('see /verify-email and https://a.b/c');
  });
});

describe('POST /api/client-errors', () => {
  const valid = {
    app: 'web',
    source: 'error',
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading 'x') for ali@example.com",
    stack: 'TypeError: x\n    at f (http://localhost:3000/_next/static/chunks/app.js?token=abc:1:2)\n' + '    at g (a.js:1:1)\n'.repeat(40),
    url: 'http://localhost:3000/yayin/0123456789abcdef0123456789abcdef?ref=mail#x',
    digest: '12345',
    release: 'abc123',
  };
  let warnSpy: { mock: { calls: unknown[][] }; mockClear: () => void; mockRestore: () => void };

  beforeAll(() => {
    warnSpy = vi.spyOn(logger, 'warn') as unknown as typeof warnSpy;
  });

  afterEach(() => {
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('geçerli rapor → 204; pino ile istek kimliğiyle ve temizlenmiş olarak loglanır', async () => {
    const res = await api().post('/api/client-errors').set('X-Request-Id', 'client-err-test-0001').send(valid);
    expect(res.status).toBe(204);
    const call = warnSpy.mock.calls.find((c: unknown[]) => String(c[1] ?? '').startsWith('[client-error]'));
    expect(call).toBeTruthy();
    const payload = call![0] as { reqId: string; clientError: Record<string, unknown> };
    expect(payload.reqId).toBe('client-err-test-0001');
    const logged = JSON.stringify(payload.clientError);
    expect(logged).not.toContain('ali@example.com');
    expect(logged).not.toContain('token=abc');
    expect(logged).not.toContain('0123456789abcdef0123456789abcdef');
    expect(payload.clientError.path).toBe('/yayin/:id');
  });

  it('geçersiz gövde 400, JSON olmayan 415, 8 KB üstü 413; oturum gerekmez', async () => {
    expect((await api().post('/api/client-errors').send({ app: 'x', source: 'error', message: 'm' })).status).toBe(400);
    expect((await api().post('/api/client-errors').set('Content-Type', 'text/plain').send('hata')).status).toBe(415);
    const big = await api().post('/api/client-errors').send({ ...valid, stack: 'x'.repeat(9000) });
    expect(big.status).toBe(413);
  });

  it('IP başına dakikada 20 rapor → sonra 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await api().post('/api/client-errors').send(valid)).status);
    expect(statuses).toContain(429);
  });

  it('temizleme yardımcıları: yol maskesi, yığın kısaltma, mesaj sınırı', () => {
    expect(sanitizePath('https://x.com/arena/rounds/3f1c2a9e-1b2c-4d5e-8f90-123456789abc?x=1')).toBe('/arena/rounds/:id');
    expect(sanitizePath('/portfolio-performance-overview')).toBe('/portfolio-performance-overview');
    expect(sanitizePath(undefined)).toBeNull();
    const stack = sanitizeStack(valid.stack)!;
    expect(stack.split('\n')).toHaveLength(20);
    const r = sanitizeClientError({ ...valid, message: 'a'.repeat(3000) } as Parameters<typeof sanitizeClientError>[0], 'UA/1.0');
    expect(r.message.length).toBeLessThanOrEqual(500);
    expect(r.ua).toBe('UA/1.0');
    expect(r.digest).toBe('12345');
  });
});
