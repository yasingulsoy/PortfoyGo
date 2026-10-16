import type * as SentryNode from '@sentry/node';
import type { Breadcrumb, ErrorEvent } from '@sentry/node';
import { logger } from '../utils/logger';
import type { AppRole } from '../infra/runtime';
import { installRouteLabelHook } from './metrics';

/**
 * İsteğe bağlı hata takibi (Sentry). YALNIZCA SENTRY_DSN tanımlıysa @sentry/node yüklenir ve başlatılır;
 * aksi halde bu modüldeki tüm fonksiyonlar no-op'tur (ek bağımlılık yüklenmez, ağ çağrısı yapılmaz).
 *
 * Ortam: SENTRY_DSN, SENTRY_ENVIRONMENT (varsayılan NODE_ENV), SENTRY_RELEASE (ör. git SHA).
 *
 * Neler gönderilir: hata middleware'indeki 5xx hatalar (utils/errors.ts), başarısız zamanlanmış işler
 * (jobs/runtime.ts), yakalanmamış istisnalar / reddedilmiş promise'ler (SDK varsayılanları) ve tarayıcıdan
 * bildirilen istemci hataları (routes/clientErrors.ts).
 *
 * Gizlilik: sendDefaultPii kapalı; performans izleme (tracing) kapalı. beforeSend / beforeBreadcrumb çerezleri,
 * Authorization / Cookie başlıklarını, şifre / token / OTP benzeri alanları, sorgu dizelerini ve e-posta
 * adreslerini temizler (bkz. scrubEvent — birim testli).
 */

let sentry: typeof SentryNode | null = null;

export function sentryEnabled(): boolean {
  return sentry !== null;
}

export function initSentry(role: AppRole): boolean {
  if (sentry) return true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  try {
    // Tembel yükleme: DSN yokken @sentry/node (ve OpenTelemetry bağımlılıkları) hiç yüklenmez
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const S = require('@sentry/node') as typeof SentryNode;
    S.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE?.trim() || undefined,
      sendDefaultPii: false,
      // Yalnızca hata takibi: performans/tracing entegrasyonları yüklenmez
      defaultIntegrations: S.getDefaultIntegrationsWithoutPerformance(),
      maxBreadcrumbs: 50,
      initialScope: { tags: { role } },
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    });
    sentry = S;
    // 5xx olaylarında rota şablonu etiketi (route tag) hata yolunda da doğru olsun
    installRouteLabelHook();
    logger.info(`[sentry] hata takibi etkin (role=${role})`);
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, '[sentry] başlatılamadı; hata takibi kapalı');
    return false;
  }
}

export interface CaptureContext {
  tags?: Record<string, string | undefined>;
  extra?: Record<string, unknown>;
}

/** İstisnayı Sentry'ye gönderir (kapalıysa no-op; asla fırlatmaz). */
export function captureError(error: unknown, ctx: CaptureContext = {}): void {
  const S = sentry;
  if (!S) return;
  try {
    S.withScope((scope) => {
      for (const [k, v] of Object.entries(ctx.tags ?? {})) if (v !== undefined) scope.setTag(k, v);
      if (ctx.extra) scope.setExtras(ctx.extra);
      S.captureException(error);
    });
  } catch {
    // Hata takibi uygulamayı asla bozmasın
  }
}

/** İstemci (tarayıcı) hatası: hazır metin + ek alanlarla mesaj olayı. */
export function captureClientMessage(message: string, ctx: CaptureContext & { fingerprint?: string[] } = {}): void {
  const S = sentry;
  if (!S) return;
  try {
    S.withScope((scope) => {
      for (const [k, v] of Object.entries(ctx.tags ?? {})) if (v !== undefined) scope.setTag(k, v);
      if (ctx.extra) scope.setExtras(ctx.extra);
      if (ctx.fingerprint) scope.setFingerprint(ctx.fingerprint);
      scope.setLevel('error');
      S.captureMessage(message);
    });
  } catch {
    // yut
  }
}

/** Kapanışta bekleyen olayları gönderir (en fazla timeoutMs). */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!sentry) return;
  try {
    await sentry.close(timeoutMs);
  } catch {
    // yut
  }
}

// ---------------------------------------------------------------------------
// Temizleme (export: birim testleri)
// ---------------------------------------------------------------------------

export const REDACTED = '[REDACTED]';

/** Değeri gizlenecek alan adları (büyük/küçük harf duyarsız, kısmi eşleşme) */
export const SENSITIVE_KEY_RE =
  /pass(word|wd)?|secret|token|authorization|cookie|session|otp|totp|api[-_]?key|private[-_]?key|credential|card|iban|tckn/i;
const SENSITIVE_HEADER_RE = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** URL'lerdeki sorgu dizesi ve parça (#…): token, e-posta, kod taşıyabilir */
const URL_QUERY_RE = /(\bhttps?:\/\/[^\s?#"'<>]+|(?<![\w/])\/[^\s?#"'<>]*)[?#][^\s"'<>)]*/g;

export function scrubText(value: string): string {
  return value.replace(EMAIL_RE, '[email]').replace(URL_QUERY_RE, '$1');
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function stripQuery(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    const req = event.request;
    delete req.cookies;
    if (req.headers) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = SENSITIVE_HEADER_RE.test(k) ? REDACTED : String(v);
      req.headers = headers;
    }
    if (req.url) req.url = stripQuery(req.url);
    delete req.query_string;
    if (req.data !== undefined) req.data = scrubValue(req.data);
  }
  if (event.user) {
    // Yalnızca takma kimlik kalsın (e-posta, IP, kullanıcı adı gönderilmez)
    event.user = event.user.id !== undefined ? { id: event.user.id } : {};
  }
  if (typeof event.message === 'string') event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = scrubText(ex.value);
  }
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is Breadcrumb => b !== null);
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const out: Breadcrumb = { ...crumb };
  if (typeof out.message === 'string') out.message = scrubText(out.message);
  if (out.data) {
    const data = scrubValue(out.data) as Record<string, unknown>;
    if (typeof data.url === 'string') data.url = stripQuery(data.url);
    out.data = data;
  }
  return out;
}
