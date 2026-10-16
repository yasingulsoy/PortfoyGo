import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FanoutChannel, RedisFanoutTransport, setFanoutTransportForTests, type FanoutTransport } from '../src/infra/fanout';
import { isRedisEnabled, redisKey, setRedisFactoryForTests } from '../src/infra/redis';
import { autoLimiterName } from '../src/infra/rateLimitStore';
import { RedisJobStatusStore, parseState } from '../src/jobs/sharedStatus';
import { JobRegistry } from '../src/services/jobs';
import { flushMockRedis, mockRedisFactory, mockSendCommand } from './redisMock';

/**
 * Çoklu örnek (Redis) adaptörleri — gerçek Redis GEREKMEZ: ioredis-mock veya bellek içi sahte taşıyıcı.
 * "İki örnek" aynı süreçte farklı örnek kimlikleri / ayrı modül örnekleri ile taklit edilir.
 */

/** Bellek içi pub/sub (tek kanal listesi; yayınlayan dahil tüm abonelere iletir — Redis gibi) */
class Hub implements FanoutTransport {
  readonly published: { channel: string; payload: string }[] = [];
  private readonly handlers = new Map<string, ((p: string) => void)[]>();
  publish(channel: string, payload: string): void {
    this.published.push({ channel, payload });
    for (const h of this.handlers.get(channel) ?? []) h(payload);
  }
  subscribe(channel: string, onMessage: (payload: string) => void): void {
    this.handlers.set(channel, [...(this.handlers.get(channel) ?? []), onMessage]);
  }
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

afterAll(() => {
  setFanoutTransportForTests(undefined);
  setRedisFactoryForTests(null);
});

describe('FanoutChannel (SSE olay dağıtımı)', () => {
  it('Redis yokken yalnızca yerel teslim (bugünkü davranış)', () => {
    expect(isRedisEnabled()).toBe(false);
    const got: string[] = [];
    const ch = new FanoutChannel<{ n: number }>('local-only', (t, e) => got.push(`${t}:${e.n}`));
    ch.ensureSubscribed();
    ch.publish('u1', { n: 1 });
    expect(got).toEqual(['u1:1']);
  });

  it('örnek A yayınlar → A yerelde bir kez, B Redis üzerinden bir kez alır (çift teslim yok)', () => {
    const hub = new Hub();
    const a: string[] = [];
    const b: string[] = [];
    const chA = new FanoutChannel<{ n: number }>('t', (t, e) => a.push(`${t}:${e.n}`), { instanceId: 'A', transport: hub });
    const chB = new FanoutChannel<{ n: number }>('t', (t, e) => b.push(`${t}:${e.n}`), { instanceId: 'B', transport: hub });
    chA.ensureSubscribed();
    chB.ensureSubscribed();
    chA.ensureSubscribed(); // idempotent
    chA.publish('user-1', { n: 7 });
    chB.publish('user-2', { n: 8 });
    expect(a).toEqual(['user-1:7', 'user-2:8']);
    expect(b).toEqual(['user-1:7', 'user-2:8']);
    expect(hub.published).toHaveLength(2);
    expect(hub.published[0].channel).toBe(redisKey('bus', 't'));
    expect(JSON.parse(hub.published[0].payload)).toEqual({ o: 'A', t: 'user-1', e: { n: 7 } });
  });

  it('bozuk / tanınmayan mesajlar yok sayılır; revive uzak olayı dönüştürür', () => {
    const hub = new Hub();
    const got: unknown[] = [];
    const ch = new FanoutChannel<{ at: Date }>('r', (_t, e) => got.push(e), {
      instanceId: 'B',
      transport: hub,
      revive: (raw) => ({ at: new Date((raw as { at: string }).at) }),
    });
    ch.ensureSubscribed();
    hub.publish(ch.channel, 'not json');
    hub.publish(ch.channel, JSON.stringify({ o: 'A' }));
    hub.publish(ch.channel, JSON.stringify({ o: 'A', t: 'x', e: { at: '2026-10-15T10:00:00.000Z' } }));
    expect(got).toHaveLength(1);
    expect((got[0] as { at: Date }).at).toBeInstanceOf(Date);
  });

  it('RedisFanoutTransport (ioredis-mock): iki "örnek" ayrı abone bağlantılarıyla birbirinin olaylarını alır', async () => {
    setRedisFactoryForTests(mockRedisFactory);
    try {
      const tA = new RedisFanoutTransport();
      const tB = new RedisFanoutTransport();
      const a: string[] = [];
      const b: string[] = [];
      const chA = new FanoutChannel<{ v: string }>('ioredis', (t, e) => a.push(`${t}:${e.v}`), { instanceId: 'A', transport: tA });
      const chB = new FanoutChannel<{ v: string }>('ioredis', (t, e) => b.push(`${t}:${e.v}`), { instanceId: 'B', transport: tB });
      chA.ensureSubscribed();
      chB.ensureSubscribed();
      await tick();
      chA.publish('round-1', { v: 'x' });
      await tick();
      expect(a).toEqual(['round-1:x']);
      expect(b).toEqual(['round-1:x']);
    } finally {
      setRedisFactoryForTests(null);
    }
  });
});

describe('bildirim ve Arena yolları — örnekler arası', () => {
  it('notificationBus: başka örnekten gelen olay yerel SSE aboneye iletilir; yerel yayın Redis\'e de gider', async () => {
    const hub = new Hub();
    setFanoutTransportForTests(hub);
    const { notificationBus } = await import('../src/services/notificationBus');
    const got: string[] = [];
    const off = notificationBus.subscribe('user-remote', (e) => got.push(e.kind));
    // Diğer örnek (ör. worker'daki emir işi) yayınladı
    hub.publish(redisKey('bus', 'notifications'), JSON.stringify({ o: 'worker-1', t: 'user-remote', e: { kind: 'unread_changed' } }));
    expect(got).toEqual(['unread_changed']);
    // Bu örnek yayınlar: yerel abone bir kez alır (kendi Redis mesajını yok sayar), zarf Redis'e gider
    notificationBus.publish('user-remote', { kind: 'unread_changed' });
    expect(got).toEqual(['unread_changed', 'unread_changed']);
    expect(hub.published.at(-1)?.channel).toBe(redisKey('bus', 'notifications'));
    off();
    expect(notificationBus.subscriberCount('user-remote')).toBe(0);
  });

  it('arenaBus: uzak pozisyon olayında tarih alanları Date olarak döner', async () => {
    const hub = new Hub();
    setFanoutTransportForTests(hub);
    const { arenaBus, reviveArenaBusEvent } = await import('../src/services/arena/bus');
    const got: unknown[] = [];
    const off = arenaBus.subscribe('round-9', (e) => got.push(e));
    const position = {
      id: 'p1', round_id: 'round-9', user_id: 'u1', instrument: 'BTC', side: 'long', qty: 1, amount: 100, entry_price: 10,
      entry_tick: 1, stop_loss: null, take_profit: null, last_checked_tick: 1, status: 'closed', close_price: 11, close_tick: 5,
      pnl: 10, close_reason: 'manual', opened_at: '2026-10-15T10:00:00.000Z', closed_at: '2026-10-15T10:01:00.000Z',
    };
    hub.publish(redisKey('bus', 'arena'), JSON.stringify({ o: 'worker-1', t: 'round-9', e: { kind: 'position', userId: 'u1', position } }));
    expect(got).toHaveLength(1);
    const ev = got[0] as { kind: string; position: { opened_at: Date; closed_at: Date | null } };
    expect(ev.kind).toBe('position');
    expect(ev.position.opened_at).toBeInstanceOf(Date);
    expect(ev.position.closed_at).toBeInstanceOf(Date);
    expect(reviveArenaBusEvent({ kind: 'finished' })).toEqual({ kind: 'finished' });
    off();
  });
});

describe('paylaşılan rate limit deposu (rate-limit-redis + ioredis-mock)', () => {
  beforeEach(async () => {
    await flushMockRedis();
  });

  /** Ayrı modül örneği = ayrı süreç (API örneği); hepsi aynı (mock) Redis'e bağlanır */
  async function apiInstance(send: (...a: string[]) => Promise<unknown>, limit: number) {
    vi.resetModules();
    const m = await import('../src/infra/rateLimitStore');
    m.setRateLimitSendCommandForTests(send as Parameters<typeof m.setRateLimitSendCommandForTests>[0]);
    const limiter = m.createRateLimiter('it-shared', { windowMs: 60_000, limit, message: { success: false, message: 'yavaş' } });
    const app = express();
    app.get('/x', limiter, (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('iki API örneği sayaçları paylaşır: toplam limit aşılınca diğer örnek de 429 verir', async () => {
    const send = mockSendCommand();
    const a = await apiInstance(send, 3);
    const b = await apiInstance(send, 3);
    expect((await request(a).get('/x')).status).toBe(200);
    expect((await request(b).get('/x')).status).toBe(200);
    const third = await request(a).get('/x');
    expect(third.status).toBe(200);
    expect(third.headers['ratelimit']).toMatch(/remaining=0/);
    expect((await request(b).get('/x')).status).toBe(429);
    expect((await request(a).get('/x')).status).toBe(429);
  });

  it('Redis hatasında istek sınırlanmadan geçer; Redis dönünce sayım yeniden başlar', async () => {
    const real = mockSendCommand();
    let down = true;
    const send = async (...args: string[]) => {
      if (down) throw new Error('ECONNREFUSED');
      return real(...args);
    };
    const app = await apiInstance(send, 2);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (let i = 0; i < 4; i++) expect((await request(app).get('/x')).status).toBe(200);
    } finally {
      errSpy.mockRestore();
    }
    down = false;
    // Betikler yeniden yüklenir; ilk istek yükleme sırasında hâlâ geçebilir, ardından limit uygulanır
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(app).get('/x')).status);
    expect(statuses).toContain(429);
  });

  it('adsız sınırlayıcı adları kararlıdır ve aynı imza ikinci kez kullanılınca ayrışır', () => {
    const n1 = autoLimiterName(60_000, 10, 'mesaj-x');
    const n2 = autoLimiterName(60_000, 10, 'mesaj-x');
    const n3 = autoLimiterName(60_000, 11, 'mesaj-x');
    expect(n1).toMatch(/^m-[0-9a-f]{10}$/);
    expect(n2).toBe(`${n1}-1`);
    expect(n3).not.toBe(n1);
  });
});

describe('paylaşılan iş durumu (admin paneli, RUN_JOBS=0 API)', () => {
  beforeEach(async () => {
    await flushMockRedis();
    setRedisFactoryForTests(mockRedisFactory);
  });

  it('worker çalıştırır → API (işi hiç çalıştırmayan) listAll ile son durumu ve sayaçları görür', async () => {
    const worker = new JobRegistry(true);
    worker.register('orders', '* * * * *', async () => undefined);
    worker.register('flaky', '* * * * *', async () => {
      throw new Error('sağlayıcı yanıt vermedi');
    });
    worker.configure({ observers: [new RedisJobStatusStore('worker-1')], instanceId: 'worker-1' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await worker.run('orders');
      await worker.run('orders');
      await worker.run('flaky');
    } finally {
      errSpy.mockRestore();
    }
    // İkinci worker kilidi alamıyor → skipped (locked) sayacı paylaşılır
    const worker2 = new JobRegistry(true);
    worker2.register('orders', '* * * * *', async () => undefined);
    worker2.configure({
      lock: { tryAcquire: async () => false, release: async () => undefined },
      observers: [new RedisJobStatusStore('worker-2')],
    });
    await worker2.run('orders');
    await tick();

    const api = new JobRegistry(true);
    api.register('orders', '* * * * *', async () => undefined);
    api.register('flaky', '* * * * *', async () => undefined);
    api.register('never-ran', '* * * * *', async () => undefined);
    api.configure({ statusReader: new RedisJobStatusStore('api-1') });
    expect(api.list()[0].last_status).toBe('never');
    const [orders, flaky, never] = await api.listAll();
    expect(orders).toMatchObject({ last_status: 'ok', run_count: 2, skip_count: 1, last_instance: 'worker-1', last_error: null });
    expect(orders.last_skipped_at).not.toBeNull();
    expect(flaky).toMatchObject({ last_status: 'error', last_error: 'sağlayıcı yanıt vermedi', run_count: 1 });
    expect(never).toMatchObject({ last_status: 'never', run_count: 0 });
  });

  it('parseState: boş hash null, geçersiz durum atlanır', () => {
    expect(parseState({})).toBeNull();
    expect(parseState({ last_status: 'bogus', run_count: '3' })).toEqual({ run_count: 3, skip_count: 0 });
  });
});
