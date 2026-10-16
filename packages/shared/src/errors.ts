// Tarayıcı hata raporlayıcısı (frontend + admin ortak). @sentry/nextjs yerine küçük, gizlilik dostu bir istemci:
// window.onerror / unhandledrejection ve React hata sınırları (error.tsx, global-error.tsx) hatayı
// POST {API}/client-errors ucuna gönderir; backend pino ile loglar ve SENTRY_DSN varsa Sentry'ye iletir.
//
// Gizlilik: oturum çerezi gönderilmez (credentials: 'omit'), kullanıcı kimliği eklenmez; adres yalnızca yol
// (sorgu dizesi / #parça yok), e-postalar ve URL sorguları metinden silinir, yığın izi 20 satıra kısaltılır.
// Gürültü: sayfa başına en fazla 10 rapor, aynı hata 60 sn içinde bir kez; beklenen API hataları (4xx),
// iptal edilen istekler ve tarayıcı eklentisi / ResizeObserver gürültüsü gönderilmez.
// Kapatmak için: NEXT_PUBLIC_CLIENT_ERRORS=0.

import { API_BASE_URL } from './api/client';

export type ClientApp = 'web' | 'admin';
export type ClientErrorSource = 'error' | 'unhandledrejection' | 'boundary' | 'global-boundary';

export interface ClientErrorPayload {
  app: ClientApp;
  source: ClientErrorSource;
  name: string;
  message: string;
  stack?: string;
  url?: string;
  digest?: string;
  release?: string;
}

const MAX_PER_PAGE = 10;
const DEDUPE_MS = 60_000;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_QUERY_RE = /(\bhttps?:\/\/[^\s?#"'<>]+|(?<![\w/])\/[^\s?#"'<>]*)[?#][^\s"'<>)]*/g;
const IGNORED_MESSAGES = [/^ResizeObserver loop/i, /^Script error\.?$/i, /^AbortError/i, /The (user aborted|operation was aborted)/i];

let sentCount = 0;
const recent = new Map<string, number>();

export function scrubClientText(value: string): string {
  return value.replace(EMAIL_RE, '[email]').replace(URL_QUERY_RE, '$1');
}

function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name || 'Error', message: error.message || String(error), stack: error.stack };
  if (typeof error === 'string') return { name: 'Error', message: error };
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; message?: unknown };
    if (typeof e.message === 'string') return { name: typeof e.name === 'string' ? e.name : 'Error', message: e.message };
  }
  let text: string;
  try {
    text = JSON.stringify(error) ?? String(error);
  } catch {
    text = String(error);
  }
  return { name: 'NonError', message: text };
}

/** Beklenen / gürültü hataları raporlanmaz (ApiError 4xx, iptal, eklenti gürültüsü). */
export function isIgnorable(error: unknown): boolean {
  const e = error as { name?: unknown; status?: unknown; message?: unknown } | null;
  if (e && e.name === 'ApiError' && typeof e.status === 'number' && e.status > 0 && e.status < 500) return true;
  if (e && e.name === 'AbortError') return true;
  const msg = typeof e?.message === 'string' ? e.message : typeof error === 'string' ? error : '';
  return IGNORED_MESSAGES.some((re) => re.test(msg));
}

export function buildClientErrorPayload(
  app: ClientApp,
  source: ClientErrorSource,
  error: unknown,
  extra: { digest?: string; href?: string } = {},
): ClientErrorPayload {
  const d = describe(error);
  const href = extra.href ?? (typeof window !== 'undefined' ? window.location.href : undefined);
  let url: string | undefined;
  if (href) {
    try {
      const u = new URL(href);
      url = `${u.origin}${u.pathname}`;
    } catch {
      url = undefined;
    }
  }
  const release = process.env.NEXT_PUBLIC_RELEASE;
  return {
    app,
    source,
    name: scrubClientText(d.name).slice(0, 100),
    message: scrubClientText(d.message.replace(/\s+/g, ' ')).slice(0, 500) || 'Unknown error',
    ...(d.stack ? { stack: scrubClientText(d.stack).split('\n').slice(0, 20).join('\n').slice(0, 4000) } : {}),
    ...(url ? { url } : {}),
    ...(extra.digest ? { digest: extra.digest.slice(0, 100) } : {}),
    ...(release ? { release: release.slice(0, 64) } : {}),
  };
}

function enabled(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_CLIENT_ERRORS !== '0';
}

/** Hatayı backend'e bildirir (ateşle ve unut; asla fırlatmaz). */
export function reportClientError(app: ClientApp, source: ClientErrorSource, error: unknown, extra: { digest?: string } = {}): void {
  try {
    if (!enabled() || isIgnorable(error) || sentCount >= MAX_PER_PAGE) return;
    const payload = buildClientErrorPayload(app, source, error, extra);
    const key = `${payload.name}|${payload.message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    sentCount += 1;
    void fetch(`${API_BASE_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Raporlayıcı uygulamayı asla bozmasın
  }
}

let installed = false;

/** window.onerror + unhandledrejection dinleyicilerini bir kez kurar; kaldırma fonksiyonu döner. */
export function installGlobalErrorReporter(app: ClientApp): () => void {
  if (typeof window === 'undefined' || installed) return () => undefined;
  installed = true;
  const onError = (ev: ErrorEvent) => {
    // Başka origin'den gelen betik hataları ayrıntısızdır ("Script error.") → atla
    if (!ev.error && (!ev.message || /^Script error\.?$/i.test(ev.message))) return;
    reportClientError(app, 'error', ev.error ?? ev.message);
  };
  const onRejection = (ev: PromiseRejectionEvent) => reportClientError(app, 'unhandledrejection', ev.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    installed = false;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Testler için sayaçları sıfırlar. */
export function resetClientErrorReporterForTests(): void {
  sentCount = 0;
  recent.clear();
  installed = false;
}
