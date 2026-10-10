import { describe, expect, it, vi } from 'vitest';
import { api, pool } from './helpers';
import { resolveRequestId } from '../src/utils/logger';

describe('sağlık uçları', () => {
  it('GET /healthz veritabanına dokunmadan 200 döner', async () => {
    const spy = vi.spyOn(pool, 'query');
    const res = await api().get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('GET /readyz DB erişilebilirse 200 + gecikme döner', async () => {
    const res = await api().get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(typeof res.body.db_latency_ms).toBe('number');
  });

  it('GET /readyz DB hatasında 503 döner', async () => {
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('bağlantı yok') as never);
    const res = await api().get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready' });
    spy.mockRestore();
  });
});

describe('istek kimliği (X-Request-Id)', () => {
  it('geçerli gelen kimliği yanıtta geri yansıtır', async () => {
    const id = '3f1c2a9e-1b2c-4d5e-8f90-123456789abc';
    const res = await api().get('/healthz').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('kimlik yoksa veya geçersizse yeni UUID üretir', async () => {
    const res = await api().get('/api/health').set('X-Request-Id', 'bad value <script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('kısa')).not.toBe('kısa');
  });
});
