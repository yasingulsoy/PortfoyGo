import { logger } from '../utils/logger';
import { isRedisEnabled } from '../infra/redis';
import { INSTANCE_ID } from '../infra/runtime';
import { jobDuration, jobLastSuccess, jobRuns, jobSkips } from '../observability/metrics';
import { captureError } from '../observability/sentry';
import { jobs as defaultJobs, type JobObserver, type JobRegistry } from '../services/jobs';
import { PgAdvisoryJobLock } from './advisoryLock';
import { RedisJobStatusStore } from './sharedStatus';

/**
 * Zamanlanmış işlerin çalışma zamanı bağlantıları (API: src/index.ts, worker: src/worker.ts):
 *   - PostgreSQL advisory lock (her çalıştırma; iki örnek aynı işi aynı anda çalıştırmaz)
 *   - Prometheus metrikleri (süre, ok/error, atlama)
 *   - Sentry (başarısız işler; iş başına 5 dakikada en fazla bir olay, mesaj değişirse hemen)
 *   - Redis varsa paylaşılan iş durumu (admin paneli tüm örneklerin son çalışmasını görür)
 */

export const metricsObserver: JobObserver = {
  onFinish(name, o) {
    jobRuns.inc({ job: name, status: o.status });
    jobDuration.observe({ job: name, status: o.status }, o.durationMs / 1000);
    if (o.status === 'ok') jobLastSuccess.set({ job: name }, Date.now() / 1000);
  },
  onSkip(name, reason) {
    jobSkips.inc({ job: name, reason });
  },
};

const SENTRY_JOB_THROTTLE_MS = 5 * 60 * 1000;

/** Saniyelik işler (ör. arena-tick) DB kesintisinde Sentry'yi doldurmasın */
export function createSentryJobObserver(capture: typeof captureError = captureError, now: () => number = Date.now): JobObserver {
  const last = new Map<string, { at: number; message: string | null }>();
  return {
    onFinish(name, o) {
      if (o.status !== 'error') return;
      const prev = last.get(name);
      const t = now();
      if (prev && prev.message === o.errorMessage && t - prev.at < SENTRY_JOB_THROTTLE_MS) return;
      last.set(name, { at: t, message: o.errorMessage });
      const error = o.error instanceof Error ? o.error : new Error(o.errorMessage || `İş başarısız: ${name}`);
      capture(error, { tags: { component: 'job', job: name } });
    },
  };
}

export interface JobRuntime {
  lock: PgAdvisoryJobLock;
  /** Kilit bağlantısını kapatır (oturumdaki kilitler sunucuda bırakılır). */
  close(): Promise<void>;
}

export function configureJobRuntime(registry: JobRegistry = defaultJobs): JobRuntime {
  const lock = new PgAdvisoryJobLock();
  const observers: JobObserver[] = [metricsObserver, createSentryJobObserver()];
  let statusStore: RedisJobStatusStore | null = null;
  if (isRedisEnabled()) {
    statusStore = new RedisJobStatusStore(INSTANCE_ID);
    observers.push(statusStore);
  }
  registry.configure({ lock, observers, statusReader: statusStore, instanceId: INSTANCE_ID });
  logger.info(
    `[jobs] advisory lock etkin (örnek ${INSTANCE_ID})${statusStore ? '; iş durumu Redis üzerinden paylaşılıyor' : ''}`
  );
  return {
    lock,
    close: () => lock.close(),
  };
}
