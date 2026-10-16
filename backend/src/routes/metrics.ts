import { Router, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { createRateLimiter } from '../infra/rateLimitStore';
import { metricsRegistry, metricsToken } from '../observability/metrics';
import type { JobRegistry } from '../services/jobs';

/**
 * GET /metrics — Prometheus metinsel biçimi (rate limit ve /api öneki DIŞINDA; bkz. app.ts, worker.ts).
 *
 *   METRICS_TOKEN tanımsız  → 404 (uç yokmuş gibi)
 *   tanımlı, başlık yok/yanlış → 401
 *   Authorization: Bearer <METRICS_TOKEN> → 200 text/plain; version=0.0.4
 *
 * Worker ek olarak GET /jobs sunar (aynı belirteçle): iş durumları JSON (Redis'siz ayrık kurulumda teşhis için).
 */

const notFoundBody = { success: false, message: 'Endpoint bulunamadı' };

/** Sabit zamanlı karşılaştırma (uzunluk sızdırmamak için SHA-256 özetleri karşılaştırılır). */
export function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header) return false;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!m) return false;
  const a = createHash('sha256').update(m[1]).digest();
  const b = createHash('sha256').update(token).digest();
  return timingSafeEqual(a, b);
}

/** Belirteç tanımsızsa 404, yanlışsa 401 yanıtlar ve false döner. */
function authorize(req: Request, res: Response): boolean {
  res.set('Cache-Control', 'no-store');
  const token = metricsToken();
  if (!token) {
    res.status(404).json(notFoundBody);
    return false;
  }
  if (!bearerMatches(req.get('authorization'), token)) {
    res.set('WWW-Authenticate', 'Bearer realm="metrics"');
    res.status(401).json({ success: false, message: 'Yetkisiz' });
    return false;
  }
  return true;
}

// Kazıyıcı 15 sn'de bir gelir; belirteç tahminini yavaşlatmak için IP başına dakikada 120
const metricsLimiter = createRateLimiter('metrics', {
  windowMs: 60_000,
  limit: 120,
  message: { success: false, message: 'Çok fazla istek gönderildi.' },
});

export function createMetricsRouter(opts: { jobs?: JobRegistry } = {}): Router {
  const router = Router();

  router.get('/metrics', metricsLimiter, async (req, res, next) => {
    if (!authorize(req, res)) return;
    try {
      const body = await metricsRegistry.metrics();
      res.set('Content-Type', metricsRegistry.contentType);
      res.status(200).send(body);
    } catch (err) {
      next(err);
    }
  });

  if (opts.jobs) {
    const registry = opts.jobs;
    router.get('/jobs', metricsLimiter, async (req, res, next) => {
      if (!authorize(req, res)) return;
      try {
        res.json({ success: true, data: await registry.listAll() });
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
