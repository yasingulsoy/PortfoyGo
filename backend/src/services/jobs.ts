import cron from 'node-cron';
import { AppError } from '../utils/errors';

/**
 * Süreç içi zamanlanmış iş kaydı.
 *
 * - `register(name, schedule, fn)`: işi kaydeder (henüz zamanlamaz). Bir işin birden fazla cron
 *   ifadesi olabilir (ör. haftalık sıfırlama + saatlik güvenlik kontrolü); hepsi AYNI çakışma
 *   korumasını paylaşır.
 * - `start(tz)`: etkin işlerin tüm cron ifadelerini node-cron ile zamanlar (src/index.ts).
 * - `run(name)`: çakışma korumalı çalıştırma; bir önceki çalışma bitmediyse tur atlanır.
 *   Son çalışma zamanı/süresi/durumu/hatası ve çalışma sayısı kaydedilir.
 * - `runNow(name)`: admin paneli için arka planda hemen başlatır. Bilinmeyen iş → 404,
 *   çalışıyorsa veya devre dışıysa → 409.
 *
 * İş adları (kararlı; admin paneli ve /api/admin/jobs/:name/run bunları kullanır):
 *   market-cache               hisse + kripto piyasa cache'i (DISABLE_MARKET_REFRESH=1 iken devre dışı)
 *   orders                     bekleyen emirler (limit / zarar durdur / kâr al + süre dolumu)
 *   portfolio-reprice          portföy fiyatlarının yeniden hesaplanması
 *   currency-rates             döviz kurları
 *   leaderboard-ranks          kümülatif sıralama (users.rank)
 *   week-baseline              haftalık liderlik referansı (Pazartesi + saatlik kontrol)
 *   seasons                    aylık sezonlar (sonlandırma + oluşturma + kayıt)
 *   price-history              varlık fiyat geçmişi (15 dk kovalar)
 *   portfolio-snapshots-hourly portföy geçmişi saatlik nokta
 *   portfolio-snapshots-daily  portföy geçmişi günlük kapanış
 *   arena-tick                 Arena: açık pozisyonların SL/TP/tasfiye kontrolü (2 sn)
 *   arena-finalize             Arena: süresi dolan turların kapanışı (5 sn)
 *   arena-challenges           Arena: zamanı gelen meydan okumaların başlatılması (5 sn)
 *   arena-matchmaking          Arena: düello eşleştirmesi (1 sn; 15 sn sonra antrenman botu)
 *   arena-bots                 Arena: antrenman botunun düello işlemleri (1 sn)
 *   arena-duels                Arena: süresi dolan düello davetleri + düello durum eşitlemesi (5 sn)
 *   weekly-picks               Haftalık Seçim: hafta satırları, açıklama bildirimi, giriş fiyatları, kapanış + ödüller (5 dk)
 *   weekly-digest              Haftalık e-posta özeti (Pazartesi 09:00; production dışında yalnızca önizleme — EMAIL_DIGEST_SEND)
 *   sandbox-snapshots          Sanal portföyler (Model Portföy / Portföy Ligi): saatlik + gün sonu değer noktası
 *   idea-reviews               Ortak Akıl: değerlendirme tarihi gelen öneriler, hedef/geçersizlik seviyesi aşımları, toplu etkileşim bildirimleri (günlük)
 *   subscriptions-expire       Abonelikler: süresi dolan deneme / Premium satırları + bitişe 3 gün kala hatırlatma (15 dk)
 */

export const JOB_NAMES = [
  'market-cache',
  'orders',
  'portfolio-reprice',
  'currency-rates',
  'leaderboard-ranks',
  'week-baseline',
  'seasons',
  'price-history',
  'portfolio-snapshots-hourly',
  'portfolio-snapshots-daily',
  'leagues-start',
  'leagues-finalize',
  'arena-tick',
  'arena-finalize',
  'arena-challenges',
  'arena-matchmaking',
  'arena-bots',
  'arena-duels',
  'weekly-picks',
  'weekly-digest',
  'sandbox-snapshots',
  'idea-reviews',
  'subscriptions-expire',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type JobStatus = 'ok' | 'error' | 'running' | 'never';

/**
 * Atlanan tur nedeni:
 *   locked  → başka bir örnek (API / worker) aynı işi şu an çalıştırıyor (PostgreSQL advisory lock); hata DEĞİL
 *   running → bu süreçte bir önceki tur hâlâ sürüyor
 */
export type JobSkipReason = 'locked' | 'running';

export interface JobInfo {
  name: string;
  /** Cron ifadeleri ' | ' ile birleştirilmiş (tek ifade ise kendisi) */
  schedule: string;
  schedules: string[];
  enabled: boolean;
  description: string | null;
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_status: JobStatus;
  last_error: string | null;
  run_count: number;
  /** Kilit nedeniyle atlanan turlar — "skipped (locked)": başka örnek çalıştırıyordu (hata sayılmaz) */
  skip_count: number;
  last_skipped_at: string | null;
  /** Son çalışmayı yapan örnek (bkz. infra/runtime.ts INSTANCE_ID); hiç çalışmadıysa null */
  last_instance: string | null;
}

export interface RegisterOptions {
  /** false → zamanlanmaz ve elle tetiklenemez (ör. DISABLE_MARKET_REFRESH) */
  enabled?: boolean;
  description?: string;
  /** Devre dışı olduğunda gösterilecek açıklama */
  disabledReason?: string;
}

/** Örnekler arası dışlama: aynı iş iki örnekte AYNI ANDA çalışmaz (bkz. jobs/advisoryLock.ts). */
export interface JobLock {
  /** true → kilit alındı (iş bitince release çağrılır); false → başka örnek tutuyor */
  tryAcquire(name: string): Promise<boolean>;
  release(name: string): Promise<void>;
}

export interface JobRunOutcome {
  status: 'ok' | 'error';
  startedAt: Date;
  durationMs: number;
  error?: unknown;
  errorMessage: string | null;
}

/** Çalışma gözlemcileri (metrikler, Sentry, paylaşılan durum — bkz. jobs/runtime.ts). Hataları yutulur. */
export interface JobObserver {
  onStart?(name: string, startedAt: Date): void;
  onFinish?(name: string, outcome: JobRunOutcome): void;
  onSkip?(name: string, reason: JobSkipReason, at: Date): void;
}

/** Örnekler arası paylaşılan iş durumu (Redis; bkz. jobs/sharedStatus.ts) */
export interface SharedJobState {
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_status: JobStatus;
  last_error: string | null;
  last_instance: string | null;
  run_count: number;
  skip_count: number;
  last_skipped_at: string | null;
}

export interface JobStatusReader {
  loadAll(names: string[]): Promise<Map<string, Partial<SharedJobState>>>;
}

export interface JobRuntimeOptions {
  lock?: JobLock | null;
  observers?: JobObserver[];
  statusReader?: JobStatusReader | null;
  /** list()'teki last_instance için bu sürecin kimliği */
  instanceId?: string | null;
}

interface JobEntry {
  name: string;
  schedules: string[];
  fn: () => Promise<unknown>;
  enabled: boolean;
  description: string | null;
  disabledReason: string | null;
  running: boolean;
  lastRunAt: Date | null;
  lastDurationMs: number | null;
  lastStatus: JobStatus;
  lastError: string | null;
  runCount: number;
  skipCount: number;
  lastSkippedAt: Date | null;
}

export interface RunResult {
  ran: boolean;
  /** 'skipped': kilit başka örnekteydi (reason: 'locked') */
  status: JobStatus | 'skipped';
  reason?: JobSkipReason;
}

const errorMessage = (error: unknown): string => {
  const e = error as { publicMessage?: string; message?: string } | undefined;
  const msg = e?.publicMessage || e?.message || String(error);
  return msg.slice(0, 500);
};

const latestIso = (a: string | null | undefined, b: string | null | undefined): string | null => {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
};

/**
 * Yerel kayıt + paylaşılan durum birleşimi (admin paneli): son çalışma alanları hangisi daha yeniyse ondan
 * (bu süreçte çalışan iş her zaman yereldir); sayaçlar örnekler arası toplamdır (paylaşılan sayaç bu süreci de içerir).
 */
export function mergeJobInfo(local: JobInfo, shared: Partial<SharedJobState> | undefined): JobInfo {
  if (!shared) return local;
  const localAt = local.last_run_at ? Date.parse(local.last_run_at) : 0;
  const sharedAt = shared.last_run_at ? Date.parse(shared.last_run_at) : 0;
  const useShared = local.last_status !== 'running' && sharedAt > localAt;
  return {
    ...local,
    ...(useShared
      ? {
          last_run_at: shared.last_run_at ?? null,
          last_duration_ms: shared.last_duration_ms ?? null,
          last_status: shared.last_status ?? 'never',
          last_error: shared.last_error ?? null,
          last_instance: shared.last_instance ?? null,
        }
      : {}),
    run_count: Math.max(local.run_count, shared.run_count ?? 0),
    skip_count: Math.max(local.skip_count, shared.skip_count ?? 0),
    last_skipped_at: latestIso(local.last_skipped_at, shared.last_skipped_at),
  };
}

export class JobRegistry {
  private readonly jobs = new Map<string, JobEntry>();
  private readonly tasks: { stop: () => unknown }[] = [];
  private readonly inflight = new Set<Promise<RunResult>>();
  private lock: JobLock | null = null;
  private observers: JobObserver[] = [];
  private statusReader: JobStatusReader | null = null;
  private instanceId: string | null = null;

  constructor(private readonly quiet = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {}

  /**
   * Çalışma zamanı bağımlılıkları (src/index.ts ve src/worker.ts → jobs/runtime.ts). Testlerde verilmez:
   * kilit yoksa iş doğrudan çalışır (tek süreç davranışı).
   */
  configure(opts: JobRuntimeOptions): void {
    if (opts.lock !== undefined) this.lock = opts.lock;
    if (opts.observers !== undefined) this.observers = [...opts.observers];
    if (opts.statusReader !== undefined) this.statusReader = opts.statusReader;
    if (opts.instanceId !== undefined) this.instanceId = opts.instanceId;
  }

  register(name: string, schedule: string | string[], fn: () => Promise<unknown>, opts: RegisterOptions = {}): void {
    if (this.jobs.has(name)) {
      throw new Error(`[jobs] "${name}" zaten kayıtlı`);
    }
    this.jobs.set(name, {
      name,
      schedules: Array.isArray(schedule) ? [...schedule] : [schedule],
      fn,
      enabled: opts.enabled ?? true,
      description: opts.description ?? null,
      disabledReason: opts.disabledReason ?? null,
      running: false,
      lastRunAt: null,
      lastDurationMs: null,
      lastStatus: 'never',
      lastError: null,
      runCount: 0,
      skipCount: 0,
      lastSkippedAt: null,
    });
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  isRunning(name: string): boolean {
    return this.jobs.get(name)?.running ?? false;
  }

  names(): string[] {
    return [...this.jobs.keys()];
  }

  /** Zamanlayıcı bu süreçte çalışıyor mu? (start çağrıldı, stop çağrılmadı) */
  isScheduling(): boolean {
    return this.tasks.length > 0;
  }

  /** Etkin işlerin tüm cron ifadelerini zamanlar. */
  start(timezone: string): void {
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      for (const expr of job.schedules) {
        this.tasks.push(cron.schedule(expr, () => void this.run(job.name), { timezone }));
      }
    }
  }

  stop(): void {
    for (const t of this.tasks.splice(0)) t.stop();
  }

  /** Süren tüm çalışmaların bitmesini bekler (en fazla timeoutMs). true → hepsi bitti. */
  async waitIdle(timeoutMs = 30_000): Promise<boolean> {
    if (this.inflight.size === 0) return true;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const done = (async () => {
      while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
      return true as const;
    })();
    try {
      return await Promise.race([done, timedOut]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Çakışma korumalı çalıştırma. Hata fırlatmaz (hata kaydedilir ve loglanır).
   * `running` bayrağı ilk await'ten ÖNCE set edilir: aynı tick'teki ikinci çağrı turu atlar.
   * Kilit yapılandırılmışsa (jobs/runtime.ts) iş yalnızca PostgreSQL advisory lock alınabilirse çalışır;
   * alınamazsa tur "skipped (locked)" olarak kaydedilir (hata değil) ve son çalışma durumu korunur.
   */
  run(name: string): Promise<RunResult> {
    const p = this.runGuarded(name);
    this.inflight.add(p);
    const cleanup = () => {
      this.inflight.delete(p);
    };
    p.then(cleanup, cleanup);
    return p;
  }

  private async runGuarded(name: string): Promise<RunResult> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`[jobs] Bilinmeyen iş: ${name}`);
    }
    if (job.running) {
      if (!this.quiet) console.warn(`[cron] ${name} hâlâ çalışıyor; bu tur atlandı`);
      this.notify((o) => o.onSkip?.(name, 'running', new Date()));
      return { ran: false, status: 'running' };
    }
    job.running = true;
    const previousStatus = job.lastStatus;
    job.lastStatus = 'running';

    let locked = false;
    if (this.lock) {
      try {
        locked = await this.lock.tryAcquire(name);
      } catch (error) {
        // Kilit alınamadı (ör. veritabanına ulaşılamıyor): iş çalıştırılmaz, hata olarak kaydedilir
        const startedAt = new Date();
        job.lastRunAt = startedAt;
        job.lastDurationMs = 0;
        job.lastStatus = 'error';
        job.lastError = `İş kilidi alınamadı: ${errorMessage(error)}`.slice(0, 500);
        job.running = false;
        console.error(`[cron] ${name} kilit hatası:`, job.lastError);
        const outcome: JobRunOutcome = { status: 'error', startedAt, durationMs: 0, error, errorMessage: job.lastError };
        this.notify((o) => o.onFinish?.(name, outcome));
        return { ran: false, status: 'error' };
      }
      if (!locked) {
        const at = new Date();
        job.lastStatus = previousStatus;
        job.skipCount += 1;
        job.lastSkippedAt = at;
        job.running = false;
        this.notify((o) => o.onSkip?.(name, 'locked', at));
        return { ran: false, status: 'skipped', reason: 'locked' };
      }
    }

    const startedAt = new Date();
    job.lastRunAt = startedAt;
    job.runCount += 1;
    this.notify((o) => o.onStart?.(name, startedAt));
    let failure: unknown;
    let failed = false;
    try {
      await job.fn();
      job.lastStatus = 'ok';
      job.lastError = null;
    } catch (error) {
      failed = true;
      failure = error;
      job.lastStatus = 'error';
      job.lastError = errorMessage(error);
      console.error(`[cron] ${name} hatası:`, job.lastError);
    } finally {
      job.lastDurationMs = Date.now() - startedAt.getTime();
      if (locked && this.lock) {
        try {
          await this.lock.release(name);
        } catch {
          // Kilit bağlantısı koptuysa sunucu kilidi zaten bıraktı
        }
      }
      job.running = false;
    }
    const outcome: JobRunOutcome = {
      status: failed ? 'error' : 'ok',
      startedAt,
      durationMs: job.lastDurationMs ?? 0,
      ...(failed ? { error: failure } : {}),
      errorMessage: job.lastError,
    };
    this.notify((o) => o.onFinish?.(name, outcome));
    return { ran: true, status: job.lastStatus };
  }

  private notify(fn: (o: JobObserver) => void): void {
    for (const o of this.observers) {
      try {
        fn(o);
      } catch {
        // Gözlemci hatası işi etkilemesin
      }
    }
  }

  /**
   * Admin: işi arka planda hemen başlatır (sonucu beklemez).
   * 404 bilinmeyen iş, 409 çalışıyor / devre dışı.
   * (Başka bir örnek o an çalıştırıyorsa tur "skipped (locked)" olarak kaydedilir.)
   */
  runNow(name: string): { name: string; started: true; done: Promise<RunResult> } {
    const job = this.jobs.get(name);
    if (!job) {
      throw new AppError(404, 'İş bulunamadı', 'JOB_NOT_FOUND');
    }
    if (!job.enabled) {
      throw new AppError(409, `Bu iş devre dışı${job.disabledReason ? ` (${job.disabledReason})` : ''}`, 'JOB_DISABLED');
    }
    if (job.running) {
      throw new AppError(409, 'İş zaten çalışıyor', 'JOB_RUNNING');
    }
    const done = this.run(name);
    return { name, started: true, done };
  }

  /** Bu süreçteki durum (senkron). */
  list(): JobInfo[] {
    return [...this.jobs.values()].map((j) => ({
      name: j.name,
      schedule: j.schedules.join(' | '),
      schedules: [...j.schedules],
      enabled: j.enabled,
      description: j.description,
      last_run_at: j.lastRunAt ? j.lastRunAt.toISOString() : null,
      last_duration_ms: j.lastDurationMs,
      last_status: j.lastStatus,
      last_error: j.lastError,
      run_count: j.runCount,
      skip_count: j.skipCount,
      last_skipped_at: j.lastSkippedAt ? j.lastSkippedAt.toISOString() : null,
      last_instance: j.lastRunAt ? this.instanceId : null,
    }));
  }

  /**
   * Admin paneli: bu süreç + (Redis varsa) diğer örneklerin paylaştığı durum. Ayrı worker kullanılan dağıtımda
   * (API'de RUN_JOBS=0) işlerin son çalışması buradan görünür. Paylaşılan durum okunamazsa yerel liste döner.
   */
  async listAll(): Promise<JobInfo[]> {
    const local = this.list();
    if (!this.statusReader) return local;
    try {
      const shared = await this.statusReader.loadAll(local.map((j) => j.name));
      return local.map((j) => mergeJobInfo(j, shared.get(j.name)));
    } catch {
      return local;
    }
  }
}

/** Uygulama genelindeki tek kayıt (src/index.ts / src/worker.ts doldurur; testlerde boştur). */
export const jobs = new JobRegistry();
