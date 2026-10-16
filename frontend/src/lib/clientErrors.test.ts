import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildClientErrorPayload,
  installGlobalErrorReporter,
  isIgnorable,
  reportClientError,
  resetClientErrorReporterForTests,
  scrubClientText,
} from '@portfoygo/shared/errors';

describe('istemci hata raporlayıcısı (@portfoygo/shared/errors)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetClientErrorReporterForTests();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sentBodies = () => fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));

  it('yükü temizler: e-posta, sorgu dizesi ve #parça yok; adres yalnızca yol; yığın ≤ 20 satır', () => {
    const err = new TypeError('ali@example.com için /reset?token=abc başarısız');
    err.stack = `TypeError: x\n${'    at f (https://app.portfoygo.com/_next/chunk.js?v=1:1:2)\n'.repeat(40)}`;
    const p = buildClientErrorPayload('web', 'error', err, { href: 'https://app.portfoygo.com/portfolio?email=ali@example.com#tab', digest: 'd1' });
    expect(p).toMatchObject({ app: 'web', source: 'error', name: 'TypeError', url: 'https://app.portfoygo.com/portfolio', digest: 'd1' });
    expect(JSON.stringify(p)).not.toContain('ali@example.com');
    expect(JSON.stringify(p)).not.toContain('token=abc');
    expect(p.stack!.split('\n')).toHaveLength(20);
    expect(scrubClientText('x /a?b=1 y')).toBe('x /a y');
  });

  it('POST {API}/client-errors, çerezsiz; aynı hata tekrarlanmaz; sayfa başına en fazla 10 rapor', () => {
    reportClientError('admin', 'boundary', new Error('patladı'));
    reportClientError('admin', 'boundary', new Error('patladı'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/client-errors$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    for (let i = 0; i < 20; i++) reportClientError('admin', 'error', new Error(`hata ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('beklenen hatalar gönderilmez (ApiError 4xx, AbortError, ResizeObserver)', () => {
    const apiErr = Object.assign(new Error('Yetkisiz'), { name: 'ApiError', status: 401 });
    const apiDown = Object.assign(new Error('Sunucu'), { name: 'ApiError', status: 503 });
    expect(isIgnorable(apiErr)).toBe(true);
    expect(isIgnorable(apiDown)).toBe(false);
    expect(isIgnorable(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isIgnorable('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    reportClientError('web', 'unhandledrejection', apiErr);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('window error / unhandledrejection olaylarını yakalar; kaldırılınca dinlemez', () => {
    const uninstall = installGlobalErrorReporter('web');
    window.dispatchEvent(new ErrorEvent('error', { error: new RangeError('sınır'), message: 'sınır' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = new Error('reddedildi');
    window.dispatchEvent(ev);
    uninstall();
    // Kaldırıldıktan sonra raporlanmamalı (test çalıştırıcısı bunu "yakalanmamış hata" saymasın diye susturulur)
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener('error', swallow);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('sonra'), message: 'sonra', cancelable: true }));
    window.removeEventListener('error', swallow);
    const bodies = sentBodies();
    expect(bodies.map((b) => [b.source, b.name, b.message])).toEqual([
      ['error', 'RangeError', 'sınır'],
      ['unhandledrejection', 'Error', 'reddedildi'],
    ]);
  });
});
