import { describe, expect, it } from 'vitest';
import { JobRegistry, JOB_NAMES } from '../src/services/jobs';
import { AppError } from '../src/utils/errors';

/** Elle çözülebilen söz (iş "çalışıyor" durumunda tutmak için) */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('JobRegistry', () => {
  it('kayıt: başlangıç durumu never, birden çok cron ifadesi " | " ile listelenir', () => {
    const r = new JobRegistry(true);
    r.register('a', ['5 0 * * 1', '17 * * * *'], async () => undefined, { description: 'A işi' });
    r.register('b', '* * * * *', async () => undefined, { enabled: false, disabledReason: 'X' });
    expect(() => r.register('a', '* * * * *', async () => undefined)).toThrow();
    const [a, b] = r.list();
    expect(a).toMatchObject({
      name: 'a',
      schedule: '5 0 * * 1 | 17 * * * *',
      schedules: ['5 0 * * 1', '17 * * * *'],
      enabled: true,
      description: 'A işi',
      last_run_at: null,
      last_duration_ms: null,
      last_status: 'never',
      last_error: null,
      run_count: 0,
    });
    expect(b.enabled).toBe(false);
  });

  it('run: başarı → ok, süre ve zaman kaydedilir, run_count artar', async () => {
    const r = new JobRegistry(true);
    let calls = 0;
    r.register('ok-job', '* * * * *', async () => {
      calls += 1;
    });
    expect(await r.run('ok-job')).toEqual({ ran: true, status: 'ok' });
    expect(await r.run('ok-job')).toEqual({ ran: true, status: 'ok' });
    const info = r.list()[0];
    expect(calls).toBe(2);
    expect(info.run_count).toBe(2);
    expect(info.last_status).toBe('ok');
    expect(info.last_duration_ms).toBeGreaterThanOrEqual(0);
    expect(new Date(info.last_run_at!).getTime()).toBeGreaterThan(Date.now() - 10_000);
  });

  it('run: hata yakalanır (fırlatılmaz) → error + mesaj; sonraki başarı hatayı temizler', async () => {
    const r = new JobRegistry(true);
    let fail = true;
    r.register('flaky', '* * * * *', async () => {
      if (fail) throw new Error('sağlayıcı yanıt vermedi');
    });
    const errSpy = console.error;
    console.error = () => undefined;
    try {
      expect(await r.run('flaky')).toEqual({ ran: true, status: 'error' });
    } finally {
      console.error = errSpy;
    }
    expect(r.list()[0]).toMatchObject({ last_status: 'error', last_error: 'sağlayıcı yanıt vermedi', run_count: 1 });
    fail = false;
    await r.run('flaky');
    expect(r.list()[0]).toMatchObject({ last_status: 'ok', last_error: null, run_count: 2 });
  });

  it('çakışma koruması: çalışırken ikinci run turu atlar, runNow 409 verir', async () => {
    const r = new JobRegistry(true);
    const d = deferred();
    let calls = 0;
    r.register('slow', '* * * * *', async () => {
      calls += 1;
      await d.promise;
    });

    const started = r.runNow('slow');
    expect(started).toMatchObject({ name: 'slow', started: true });
    // running bayrağı senkron set edilir
    expect(r.isRunning('slow')).toBe(true);
    expect(r.list()[0].last_status).toBe('running');

    expect(await r.run('slow')).toEqual({ ran: false, status: 'running' });
    let err: unknown;
    try {
      r.runNow('slow');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect((err as AppError).code).toBe('JOB_RUNNING');

    d.resolve();
    expect(await started.done).toEqual({ ran: true, status: 'ok' });
    expect(calls).toBe(1);
    expect(r.isRunning('slow')).toBe(false);
    // Bittikten sonra tekrar başlatılabilir
    await r.runNow('slow').done;
    expect(r.list()[0].run_count).toBe(2);
  });

  it('runNow: bilinmeyen iş 404, devre dışı iş 409', () => {
    const r = new JobRegistry(true);
    r.register('off', '* * * * *', async () => undefined, { enabled: false, disabledReason: 'DISABLE_MARKET_REFRESH' });
    const catchErr = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e as AppError;
      }
      throw new Error('hata bekleniyordu');
    };
    expect(catchErr(() => r.runNow('yok'))).toMatchObject({ status: 404, code: 'JOB_NOT_FOUND' });
    const off = catchErr(() => r.runNow('off'));
    expect(off).toMatchObject({ status: 409, code: 'JOB_DISABLED' });
    expect(off.publicMessage).toContain('DISABLE_MARKET_REFRESH');
  });

  it('kararlı iş adları', () => {
    expect(JOB_NAMES).toEqual([
      'market-cache',
      'orders',
      'portfolio-reprice',
      'currency-rates',
      'leaderboard-ranks',
      'week-baseline',
      'seasons',
      'price-history',
      'portfolio-snapshots-hourly',
      'portfolio-snapshots-daily',
      'leagues-start',
      'leagues-finalize',
      'arena-tick',
      'arena-finalize',
      'arena-challenges',
      'arena-matchmaking',
      'arena-bots',
      'arena-duels',
      'weekly-picks',
    ]);
  });
});
