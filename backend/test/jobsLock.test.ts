import { afterAll, describe, expect, it } from 'vitest';
import { JobRegistry, JOB_NAMES, mergeJobInfo, type JobInfo, type JobLock, type JobObserver } from '../src/services/jobs';
import { JOB_LOCK_NAMESPACE, PgAdvisoryJobLock, jobLockKey } from '../src/jobs/advisoryLock';
import { createSentryJobObserver } from '../src/jobs/runtime';
import { parseBoolEnv, runJobsEnabled } from '../src/infra/runtime';

/** Elle kontrol edilen sahte kilit: `holder` başka bir örneği temsil eder */
function fakeLock() {
  const state = { held: new Set<string>(), foreign: new Set<string>(), acquires: 0, releases: 0, fail: false };
  const lock: JobLock = {
    async tryAcquire(name) {
      if (state.fail) throw new Error('bağlantı yok');
      state.acquires += 1;
      if (state.foreign.has(name) || state.held.has(name)) return false;
      state.held.add(name);
      return true;
    },
    async release(name) {
      state.releases += 1;
      state.held.delete(name);
    },
  };
  return { lock, state };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('JobRegistry + iş kilidi', () => {
  it('kilit alınırsa iş çalışır ve kilit bırakılır', async () => {
    const r = new JobRegistry(true);
    const { lock, state } = fakeLock();
    r.configure({ lock, instanceId: 'api-1' });
    let calls = 0;
    r.register('a', '* * * * *', async () => {
      calls += 1;
    });
    expect(await r.run('a')).toEqual({ ran: true, status: 'ok' });
    expect(calls).toBe(1);
    expect(state).toMatchObject({ acquires: 1, releases: 1 });
    expect(state.held.size).toBe(0);
    expect(r.list()[0]).toMatchObject({ last_status: 'ok', run_count: 1, skip_count: 0, last_instance: 'api-1' });
  });

  it('başka örnek tutuyorsa tur "skipped (locked)" olur: hata değil, son durum ve sayaç korunur', async () => {
    const r = new JobRegistry(true);
    const { lock, state } = fakeLock();
    const skips: string[] = [];
    const observer: JobObserver = { onSkip: (name, reason) => skips.push(`${name}:${reason}`) };
    r.configure({ lock, observers: [observer] });
    let calls = 0;
    r.register('b', '* * * * *', async () => {
      calls += 1;
    });
    await r.run('b');
    state.foreign.add('b');
    expect(await r.run('b')).toEqual({ ran: false, status: 'skipped', reason: 'locked' });
    expect(await r.run('b')).toEqual({ ran: false, status: 'skipped', reason: 'locked' });
    expect(calls).toBe(1);
    const info = r.list()[0];
    expect(info).toMatchObject({ last_status: 'ok', last_error: null, run_count: 1, skip_count: 2 });
    expect(info.last_skipped_at).not.toBeNull();
    expect(skips).toEqual(['b:locked', 'b:locked']);
    expect(r.isRunning('b')).toBe(false);
    // Hiç çalışmamış iş kilitliyse "never" kalır
    r.register('c', '* * * * *', async () => undefined);
    state.foreign.add('c');
    await r.run('c');
    expect(r.list()[1]).toMatchObject({ last_status: 'never', skip_count: 1 });
  });

  it('kilit alınamazsa (DB hatası) iş çalışmaz, hata kaydedilir; running bayrağı temizlenir', async () => {
    const r = new JobRegistry(true);
    const { lock, state } = fakeLock();
    const finished: string[] = [];
    r.configure({ lock, observers: [{ onFinish: (n, o) => finished.push(`${n}:${o.status}`) }] });
    let calls = 0;
    r.register('d', '* * * * *', async () => {
      calls += 1;
    });
    state.fail = true;
    const errSpy = console.error;
    console.error = () => undefined;
    try {
      expect(await r.run('d')).toEqual({ ran: false, status: 'error' });
    } finally {
      console.error = errSpy;
    }
    expect(calls).toBe(0);
    expect(r.list()[0].last_status).toBe('error');
    expect(r.list()[0].last_error).toContain('İş kilidi alınamadı');
    expect(finished).toEqual(['d:error']);
    state.fail = false;
    await r.run('d');
    expect(r.list()[0]).toMatchObject({ last_status: 'ok', last_error: null });
  });

  it('running bayrağı kilitten önce senkron set edilir; waitIdle süren işleri bekler', async () => {
    const r = new JobRegistry(true);
    const { lock } = fakeLock();
    r.configure({ lock });
    const d = deferred();
    r.register('slow', '* * * * *', () => d.promise);
    const p = r.run('slow');
    expect(r.isRunning('slow')).toBe(true);
    expect(r.list()[0].last_status).toBe('running');
    expect(await r.run('slow')).toEqual({ ran: false, status: 'running' });
    expect(await r.waitIdle(20)).toBe(false);
    d.resolve();
    expect(await r.waitIdle(1000)).toBe(true);
    expect(await p).toEqual({ ran: true, status: 'ok' });
  });

  it('gözlemci hatası işi bozmaz; onStart/onFinish süre ve hata mesajı taşır', async () => {
    const r = new JobRegistry(true);
    const seen: unknown[] = [];
    r.configure({
      observers: [
        {
          onStart: () => {
            throw new Error('gözlemci patladı');
          },
        },
        { onFinish: (n, o) => seen.push({ n, status: o.status, msg: o.errorMessage, ms: o.durationMs >= 0 }) },
      ],
    });
    r.register('e', '* * * * *', async () => {
      throw new Error('kota doldu');
    });
    const errSpy = console.error;
    console.error = () => undefined;
    try {
      expect(await r.run('e')).toEqual({ ran: true, status: 'error' });
    } finally {
      console.error = errSpy;
    }
    expect(seen).toEqual([{ n: 'e', status: 'error', msg: 'kota doldu', ms: true }]);
  });
});

describe('mergeJobInfo (paylaşılan durum)', () => {
  const base: JobInfo = {
    name: 'orders',
    schedule: '* * * * *',
    schedules: ['* * * * *'],
    enabled: true,
    description: null,
    last_run_at: null,
    last_duration_ms: null,
    last_status: 'never',
    last_error: null,
    run_count: 0,
    skip_count: 0,
    last_skipped_at: null,
    last_instance: null,
  };

  it('API hiç çalıştırmadıysa worker durumu görünür (RUN_JOBS=0)', () => {
    const m = mergeJobInfo(base, {
      last_run_at: '2026-10-15T10:00:00.000Z',
      last_status: 'error',
      last_error: 'x',
      last_duration_ms: 12,
      last_instance: 'worker-1',
      run_count: 42,
      skip_count: 3,
      last_skipped_at: '2026-10-15T09:59:00.000Z',
    });
    expect(m).toMatchObject({ last_status: 'error', last_error: 'x', last_duration_ms: 12, last_instance: 'worker-1', run_count: 42, skip_count: 3 });
  });

  it('yerel çalışma daha yeniyse veya şu an yerelde çalışıyorsa yerel kalır; sayaçlar en büyüğü', () => {
    const local: JobInfo = { ...base, last_run_at: '2026-10-15T10:05:00.000Z', last_status: 'ok', run_count: 5, last_instance: 'api-1' };
    const shared = { last_run_at: '2026-10-15T10:00:00.000Z', last_status: 'error' as const, run_count: 9 };
    expect(mergeJobInfo(local, shared)).toMatchObject({ last_status: 'ok', last_instance: 'api-1', run_count: 9 });
    const running: JobInfo = { ...base, last_run_at: '2026-10-15T09:00:00.000Z', last_status: 'running' };
    expect(mergeJobInfo(running, shared).last_status).toBe('running');
    expect(mergeJobInfo(base, undefined)).toBe(base);
  });

  it('listAll: okuyucu hata verirse yerel liste döner', async () => {
    const r = new JobRegistry(true);
    r.register('a', '* * * * *', async () => undefined);
    r.configure({
      statusReader: {
        loadAll: async () => {
          throw new Error('redis yok');
        },
      },
    });
    expect((await r.listAll())[0].name).toBe('a');
  });
});

describe('advisory lock anahtarları', () => {
  it('her iş adı kararlı, pozitif int4 ve benzersiz anahtara eşlenir', () => {
    const keys = JOB_NAMES.map(jobLockKey);
    expect(new Set(keys).size).toBe(JOB_NAMES.length);
    for (const k of keys) {
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(0x7fffffff);
    }
    expect(jobLockKey('orders')).toBe(jobLockKey('orders'));
    expect(JOB_LOCK_NAMESPACE).toBeLessThanOrEqual(0x7fffffff);
  });
});

describe('PgAdvisoryJobLock (test veritabanı: PGlite)', () => {
  const a = new PgAdvisoryJobLock();
  const b = new PgAdvisoryJobLock();

  afterAll(async () => {
    await a.close();
    await b.close();
  });

  it('iki ayrı kilit bağlantısı ("iki örnek") aynı işi aynı anda alamaz; bırakınca diğeri alır', async () => {
    expect(await a.tryAcquire('lock-test-job')).toBe(true);
    // PGlite tek oturumludur → pg_locks kontrolü devrede
    expect(a.isSharedSession).toBe(true);
    expect(await b.tryAcquire('lock-test-job')).toBe(false);
    // Farklı iş bağımsızdır
    expect(await b.tryAcquire('lock-test-other')).toBe(true);
    await a.release('lock-test-job');
    expect(await b.tryAcquire('lock-test-job')).toBe(true);
    expect(await a.tryAcquire('lock-test-job')).toBe(false);
    await b.release('lock-test-job');
    await b.release('lock-test-other');
    // Tutulmayan kilidi bırakmak no-op
    await a.release('lock-test-job');
  });

  it('JobRegistry ile: iki kayıt aynı işi eşzamanlı çalıştırınca biri çalışır, diğeri kilitli atlanır', async () => {
    const r1 = new JobRegistry(true);
    const r2 = new JobRegistry(true);
    r1.configure({ lock: a });
    r2.configure({ lock: b });
    const d = deferred();
    let concurrent = 0;
    let maxConcurrent = 0;
    const fn = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await d.promise;
      concurrent -= 1;
    };
    r1.register('shared-job', '* * * * *', fn);
    r2.register('shared-job', '* * * * *', fn);
    const p1 = r1.run('shared-job');
    // r1 kilidi alana kadar bekle
    for (let i = 0; i < 50 && concurrent === 0; i++) await new Promise((res) => setTimeout(res, 10));
    expect(await r2.run('shared-job')).toEqual({ ran: false, status: 'skipped', reason: 'locked' });
    d.resolve();
    expect(await p1).toEqual({ ran: true, status: 'ok' });
    expect(maxConcurrent).toBe(1);
    // r1 bitirip bıraktıktan sonra r2 çalışabilir
    expect(await r2.run('shared-job')).toEqual({ ran: true, status: 'ok' });
  });
});

describe('Sentry iş gözlemcisi', () => {
  it('aynı hata 5 dk içinde tekrar gönderilmez; mesaj değişince ve süre dolunca gönderilir', () => {
    const sent: string[] = [];
    let t = 0;
    const obs = createSentryJobObserver((err) => sent.push((err as Error).message), () => t);
    const fail = (msg: string) =>
      obs.onFinish?.('arena-tick', { status: 'error', startedAt: new Date(), durationMs: 1, error: new Error(msg), errorMessage: msg });
    fail('db yok');
    fail('db yok');
    fail('başka hata');
    t += 5 * 60 * 1000 + 1;
    fail('başka hata');
    obs.onFinish?.('arena-tick', { status: 'ok', startedAt: new Date(), durationMs: 1, errorMessage: null });
    expect(sent).toEqual(['db yok', 'başka hata', 'başka hata']);
  });
});

describe('RUN_JOBS', () => {
  it('tanımsız → açık (bugünkü tek süreç davranışı); 0/false → kapalı', () => {
    expect(runJobsEnabled({})).toBe(true);
    expect(runJobsEnabled({ RUN_JOBS: '' })).toBe(true);
    expect(runJobsEnabled({ RUN_JOBS: '0' })).toBe(false);
    expect(runJobsEnabled({ RUN_JOBS: 'false' })).toBe(false);
    expect(runJobsEnabled({ RUN_JOBS: 'yes' })).toBe(true);
    expect(parseBoolEnv('garip')).toBeUndefined();
  });
});
