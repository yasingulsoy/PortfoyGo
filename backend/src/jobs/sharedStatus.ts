import { logger } from '../utils/logger';
import { getRedis, isRedisUsable, redisKey, type RedisClient } from '../infra/redis';
import type { JobObserver, JobRunOutcome, JobSkipReason, JobStatus, JobStatusReader, SharedJobState } from '../services/jobs';

/**
 * Örnekler arası paylaşılan iş durumu (yalnızca REDIS_URL tanımlıyken; bkz. jobs/runtime.ts).
 *
 * Her iş için bir hash: portfoygo:jobs:<ad>
 *   last_run_at, last_status, last_duration_ms, last_error, last_instance  (son çalışma)
 *   run_count, skip_count (HINCRBY; tüm örneklerin toplamı), last_skipped_at
 *
 * Yazma tarafı JobObserver'dır (çalışma başı/sonu, kilitli atlama); okuma tarafı admin paneli
 * (JobRegistry.listAll → GET /api/admin/jobs, /api/admin/health). Böylece API'de RUN_JOBS=0 iken de
 * worker'ın çalıştırdığı işlerin durumu panelde görünür. Yazma hataları yutulur (iş akışını etkilemez).
 */

const KEY_TTL_S = 30 * 24 * 60 * 60;
const JOB_STATUSES: readonly JobStatus[] = ['ok', 'error', 'running', 'never'];

export class RedisJobStatusStore implements JobObserver, JobStatusReader {
  constructor(
    private readonly instanceId: string,
    private readonly client: () => RedisClient = getRedis
  ) {}

  private key(name: string): string {
    return redisKey('jobs', name);
  }

  private exec(name: string, build: (p: ReturnType<RedisClient['pipeline']>) => void): void {
    let c: RedisClient;
    try {
      c = this.client();
    } catch {
      return;
    }
    if (!isRedisUsable(c)) return;
    const p = c.pipeline();
    build(p);
    p.expire(this.key(name), KEY_TTL_S);
    p.exec().catch((err: Error) => logger.debug({ err: err?.message, job: name }, '[jobs] paylaşılan durum yazılamadı'));
  }

  onStart(name: string, startedAt: Date): void {
    this.exec(name, (p) => {
      p.hset(this.key(name), {
        last_run_at: startedAt.toISOString(),
        last_status: 'running',
        last_instance: this.instanceId,
      });
      p.hincrby(this.key(name), 'run_count', 1);
    });
  }

  onFinish(name: string, outcome: JobRunOutcome): void {
    this.exec(name, (p) => {
      p.hset(this.key(name), {
        last_run_at: outcome.startedAt.toISOString(),
        last_status: outcome.status,
        last_duration_ms: String(Math.round(outcome.durationMs)),
        last_instance: this.instanceId,
        last_error: outcome.errorMessage ?? '',
      });
    });
  }

  onSkip(name: string, reason: JobSkipReason, at: Date): void {
    if (reason !== 'locked') return;
    this.exec(name, (p) => {
      p.hincrby(this.key(name), 'skip_count', 1);
      p.hset(this.key(name), { last_skipped_at: at.toISOString() });
    });
  }

  async loadAll(names: string[]): Promise<Map<string, Partial<SharedJobState>>> {
    const out = new Map<string, Partial<SharedJobState>>();
    if (names.length === 0) return out;
    const c = this.client();
    if (!isRedisUsable(c)) return out;
    const p = c.pipeline();
    for (const n of names) p.hgetall(this.key(n));
    const results = (await p.exec()) ?? [];
    results.forEach(([err, raw], i) => {
      if (err || !raw || typeof raw !== 'object') return;
      const parsed = parseState(raw as Record<string, string>);
      if (parsed) out.set(names[i], parsed);
    });
    return out;
  }
}

const intOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Redis hash → durum (bilinmeyen / boş alanlar atlanır). Export: birim testleri. */
export function parseState(raw: Record<string, string>): Partial<SharedJobState> | null {
  if (!raw || Object.keys(raw).length === 0) return null;
  const s: Partial<SharedJobState> = {};
  if (raw.last_run_at) s.last_run_at = raw.last_run_at;
  if (raw.last_status && (JOB_STATUSES as readonly string[]).includes(raw.last_status)) s.last_status = raw.last_status as JobStatus;
  const d = intOrNull(raw.last_duration_ms);
  if (d !== null) s.last_duration_ms = d;
  if (raw.last_error !== undefined) s.last_error = raw.last_error || null;
  if (raw.last_instance) s.last_instance = raw.last_instance;
  s.run_count = intOrNull(raw.run_count) ?? 0;
  s.skip_count = intOrNull(raw.skip_count) ?? 0;
  if (raw.last_skipped_at) s.last_skipped_at = raw.last_skipped_at;
  return s;
}
