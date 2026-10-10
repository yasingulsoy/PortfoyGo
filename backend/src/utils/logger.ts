import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pino, { LoggerOptions } from 'pino';
import pinoHttp from 'pino-http';

/**
 * Yapılandırılmış loglama (pino).
 *
 * - production: satır başına bir JSON nesnesi (log toplayıcılar için)
 * - geliştirme: pino-pretty ile okunabilir çıktı — NODE_ENV !== 'production' VE
 *   (stdout bir TTY ya da LOG_PRETTY=1). LOG_PRETTY=0 her zaman JSON'a zorlar.
 * - test: varsayılan seviye 'silent' (LOG_LEVEL ile açılabilir)
 *
 * Ortam: LOG_LEVEL (trace|debug|info|warn|error|fatal|silent; varsayılan info), LOG_PRETTY.
 * Authorization / Cookie / Set-Cookie başlıkları ve şifre alanları loglara yazılmaz.
 */

const env = process.env.NODE_ENV;
const isTest = env === 'test' || process.env.VITEST === 'true';

function resolveLevel(): string {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw) return raw;
  return isTest ? 'silent' : 'info';
}

function wantsPretty(): boolean {
  if (env === 'production' || isTest) return false;
  const flag = process.env.LOG_PRETTY?.trim().toLowerCase();
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return Boolean(process.stdout.isTTY);
}

function prettyAvailable(): boolean {
  try {
    // pino-pretty bir devDependency'dir; production imajında kurulu değildir
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'password',
  'newPassword',
  'currentPassword',
  'oldPassword',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.oldPassword',
  'body.password',
  'req.body.password',
];

const options: LoggerOptions = {
  level: resolveLevel(),
  base: { service: 'portfoygo-api' },
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (wantsPretty() && prettyAvailable()) {
  options.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
  };
}

export const logger = pino(options);

// Gelen X-Request-Id yalnızca makul bir kimlikse (UUID benzeri, 8-128 karakter) kabul edilir
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function resolveRequestId(incoming: unknown): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  if (typeof value === 'string' && REQUEST_ID_RE.test(value.trim())) {
    return value.trim();
  }
  return randomUUID();
}

/** Express alt router'ları req.url'i kısaltır; asıl yol originalUrl'dedir. Sorgu dizesi atılır. */
function pathOf(req: IncomingMessage): string {
  const url = (req as IncomingMessage & { originalUrl?: string }).originalUrl || req.url || '';
  return url.split('?')[0];
}

/**
 * İstek logu + istek kimliği. req.id ve X-Request-Id yanıt başlığı her istekte ayarlanır.
 * Sağlık uçları (/healthz, /readyz) loglanmaz (orkestratör yoklamaları gürültü üretmesin).
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const id = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: {
    ignore: (req) => {
      const url = req.url || '';
      return url === '/healthz' || url === '/readyz' || url.startsWith('/healthz?') || url.startsWith('/readyz?');
    },
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res, responseTime) => `${req.method} ${pathOf(req)} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${pathOf(req)} ${res.statusCode}`,
  serializers: {
    // Sorgu dizesi (e-posta, kod vb. içerebilir) loglanmaz; sadece yol
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: typeof req.url === 'string' ? req.url.split('?')[0] : req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
