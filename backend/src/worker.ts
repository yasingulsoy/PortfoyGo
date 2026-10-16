// İLK import: süreç rolünü 'worker' yapar (logger `service` alanı vb. buna göre kurulur)
import './infra/workerRole';
import { validateServerEnv } from './config/env';

validateServerEnv();

import { initSentry, flushSentry } from './observability/sentry';
initSentry('worker');

import type { Server } from 'http';
import express from 'express';
import pool from './config/database';
import healthRoutes from './routes/health';
import { createMetricsRouter } from './routes/metrics';
import { jobs } from './services/jobs';
import { GameListeners } from './services/game/listeners';
import { CRON_TZ, registerAllJobs, runStartupJobs } from './jobs/definitions';
import { configureJobRuntime } from './jobs/runtime';
import { closeRedis, isRedisEnabled } from './infra/redis';
import { INSTANCE_ID, parseBoolEnv } from './infra/runtime';
import { metricsToken, startDefaultMetrics } from './observability/metrics';
import { logger } from './utils/logger';

/**
 * Zamanlanmış işler için ayrı süreç (npm run start:worker / dev:worker). HTTP API SUNMAZ; yalnızca:
 *   GET /healthz   canlılık       GET /readyz   veritabanı hazır mı
 *   GET /metrics   Prometheus (METRICS_TOKEN)   GET /jobs   iş durumları JSON (METRICS_TOKEN)
 * Port: WORKER_PORT (varsayılan 5002).
 *
 * Dağıtım: API örneklerinde RUN_JOBS=0, tek (veya birden çok — advisory lock aynı işi aynı anda çalıştırmaz)
 * worker. Worker'ın ürettiği canlı olayların (emir dolumu bildirimi, Arena tur sonu …) API'deki SSE
 * istemcilerine ulaşması ve admin panelindeki iş durumları için REDIS_URL gerekir.
 * RUN_JOBS bu süreçte yok sayılır (worker'ın tek işi budur).
 */

const PORT = parseInt(process.env.WORKER_PORT || '5002', 10);
const SHUTDOWN_GRACE_MS = parseInt(process.env.WORKER_SHUTDOWN_GRACE_MS || '25000', 10);

if (parseBoolEnv(process.env.RUN_JOBS) === false) {
  logger.warn('[worker] RUN_JOBS=0 worker sürecinde yok sayılır; işler bu süreçte çalışır');
}
if (!isRedisEnabled()) {
  logger.warn(
    '[worker] REDIS_URL yok: işlerin ürettiği canlı olaylar yalnızca bu süreçte kalır (API örneklerindeki SSE istemcilerine ' +
      'ulaşmaz; istemciler yenileyince görür) ve admin paneli iş durumlarını göremez.'
  );
}

// Arena olaylarına bağlı oyun ekonomisi dinleyicileri (XP / jeton / görev). API'de routes/game.ts kaydeder;
// worker'da arena-finalize gibi işler aynı olayları ürettiği için burada da gerekir (idempotent kayıt).
GameListeners.register();

registerAllJobs(jobs);
const runtime = configureJobRuntime(jobs);
jobs.start(CRON_TZ);
runStartupJobs(jobs);

const app = express();
app.disable('x-powered-by');
app.use(healthRoutes);
if (metricsToken()) startDefaultMetrics();
app.use(createMetricsRouter({ jobs }));
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint bulunamadı' });
});

const server: Server = app.listen(PORT, () => {
  logger.info(`[worker] ${jobs.names().length} iş zamanlandı (örnek ${INSTANCE_ID}); sağlık: http://localhost:${PORT}/healthz`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[worker] ${signal} alındı: yeni çalıştırma yok, süren işler bekleniyor (en fazla ${SHUTDOWN_GRACE_MS} ms)`);
  jobs.stop();
  const idle = await jobs.waitIdle(SHUTDOWN_GRACE_MS);
  if (!idle) logger.warn('[worker] bazı işler süre dolmadan bitmedi; kilit bağlantısı kapanınca kilitler bırakılır');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.close();
  await closeRedis();
  await flushSentry(2000);
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
