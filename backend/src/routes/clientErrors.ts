import express, { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../infra/rateLimitStore';
import { clientErrors } from '../observability/metrics';
import { captureClientMessage, scrubText } from '../observability/sentry';
import { logger } from '../utils/logger';

/**
 * POST /api/client-errors — tarayıcı hata raporu (site + yönetim paneli; @portfoygo/shared/errors gönderir).
 *
 * - Oturum GEREKMEZ (hata giriş sayfasında da olabilir); çerez okunmaz, kullanıcı kimliği kaydedilmez.
 * - Yalnızca application/json; gövde en fazla 8 KB (app.ts'te genel 50 KB ayrıştırıcıdan önce takılır).
 * - IP başına dakikada 20 rapor (Redis varsa örnekler arası ortak).
 * - Gizlilik: e-posta adresleri ve URL sorgu dizeleri silinir, adres yalnızca yol (uzun kimlik/jeton parçaları
 *   ":id" olur), yığın izi 20 satır / 4000 karakterle kısaltılır.
 * - pino ile istek kimliğiyle loglanır; SENTRY_DSN varsa Sentry'ye de iletilir. Yanıt: 204.
 */

export const CLIENT_ERRORS_PATH = '/api/client-errors';
export const CLIENT_ERROR_BODY_LIMIT = '8kb';

/** Genel JSON ayrıştırıcısından ÖNCE takılır (gövde bir kez ayrıştırılır; büyükse 413). */
export const clientErrorsBodyParser = express.json({ limit: CLIENT_ERROR_BODY_LIMIT });

const reportSchema = z.object({
  app: z.enum(['web', 'admin']),
  source: z.enum(['error', 'unhandledrejection', 'boundary', 'global-boundary']),
  name: z.string().max(200).optional(),
  message: z.string().trim().min(1).max(4000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(2000).optional(),
  digest: z.string().max(200).optional(),
  release: z.string().max(100).optional(),
});

export type ClientErrorInput = z.infer<typeof reportSchema>;

export interface ClientErrorReport {
  app: 'web' | 'admin';
  source: ClientErrorInput['source'];
  name: string;
  message: string;
  stack: string | null;
  path: string | null;
  digest: string | null;
  release: string | null;
  ua: string | null;
}

const MAX_MESSAGE = 500;
const MAX_STACK_LINES = 20;
const MAX_STACK_LINE = 300;
const MAX_STACK = 4000;
/** hex ≥16, UUID, ≥4 haneli sayı veya rakam içeren ≥24 karakterlik jeton (ör. /yayin/<jeton>) */
const ID_SEGMENT = /^(?:[0-9a-f]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4,}|(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{24,})$/i;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const safeToken = (s: string | undefined, n: number) => {
  const v = (s ?? '').replace(/[^A-Za-z0-9._:@+-]/g, '').slice(0, n);
  return v || null;
};

/** Sayfa adresi → yalnızca yol; uzun kimlik / jeton parçaları ":id". */
export function sanitizePath(url: string | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url, 'http://local.invalid').pathname;
  } catch {
    return null;
  }
  const masked = pathname
    .split('/')
    .map((seg) => (ID_SEGMENT.test(seg) ? ':id' : seg))
    .join('/');
  return clip(masked, 300);
}

export function sanitizeStack(stack: string | undefined): string | null {
  if (!stack) return null;
  const lines = scrubText(stack)
    .split(/\r?\n/)
    .slice(0, MAX_STACK_LINES)
    .map((l) => clip(l, MAX_STACK_LINE));
  return clip(lines.join('\n'), MAX_STACK);
}

export function sanitizeClientError(input: ClientErrorInput, userAgent: string | undefined): ClientErrorReport {
  return {
    app: input.app,
    source: input.source,
    name: clip(scrubText(input.name?.trim() || 'Error'), 100),
    message: clip(scrubText(input.message.replace(/\s+/g, ' ')), MAX_MESSAGE),
    stack: sanitizeStack(input.stack),
    path: sanitizePath(input.url),
    digest: safeToken(input.digest, 100),
    release: safeToken(input.release, 64),
    ua: userAgent ? clip(userAgent, 200) : null,
  };
}

const clientErrorLimiter = createRateLimiter('client-errors', {
  windowMs: 60_000,
  limit: 20,
  message: { success: false, message: 'Çok fazla hata raporu gönderildi.', code: 'RATE_LIMITED' },
});

const router = Router();

router.post('/', clientErrorLimiter, (req, res) => {
  if (!req.is('application/json')) {
    res.status(415).json({ success: false, message: 'İstek gövdesi application/json olmalı' });
    return;
  }
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Geçersiz hata raporu', code: 'VALIDATION_ERROR' });
    return;
  }
  const report = sanitizeClientError(parsed.data, req.get('user-agent'));
  clientErrors.inc({ app: report.app });
  (req.log ?? logger).warn(
    { reqId: req.id, clientError: report },
    `[client-error] ${report.app}/${report.source} ${report.path ?? '-'}: ${report.name}: ${report.message}`
  );
  captureClientMessage(`[${report.app}] ${report.name}: ${report.message}`, {
    tags: { component: 'client', app: report.app, source: report.source, release: report.release ?? undefined },
    extra: { stack: report.stack, path: report.path, digest: report.digest, ua: report.ua, reqId: String(req.id ?? '') },
    fingerprint: ['client', report.app, report.name, report.message.slice(0, 120)],
  });
  res.status(204).end();
});

export default router;
