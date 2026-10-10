import { Router } from 'express';
import pool from '../config/database';
import { logger } from '../utils/logger';

/**
 * Orkestratör / yük dengeleyici sağlık uçları (rate limit DIŞINDA, /api önekisiz):
 *
 *   GET /healthz → süreç ayakta mı? (veritabanına dokunmaz)   200 { status: 'ok' }
 *   GET /readyz  → trafik almaya hazır mı? (DB'de SELECT 1, 2 sn zaman aşımı)
 *                  200 { status: 'ready', db_latency_ms } | 503 { status: 'not_ready' }
 *
 * Eski GET /api/health (bkz. app.ts) geriye dönük uyumluluk için duruyor.
 */
export const READY_DB_TIMEOUT_MS = 2000;

const router = Router();

router.get('/healthz', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok' });
});

router.get('/readyz', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const started = process.hrtime.bigint();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`DB yanıtı ${READY_DB_TIMEOUT_MS}ms içinde gelmedi`)), READY_DB_TIMEOUT_MS);
      }),
    ]);
    const dbLatencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    res.status(200).json({ status: 'ready', db_latency_ms: Math.round(dbLatencyMs * 10) / 10 });
  } catch (err: any) {
    (req.log ?? logger).warn({ err: err?.message || String(err) }, '[readyz] veritabanı hazır değil');
    res.status(503).json({ status: 'not_ready' });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

export default router;
