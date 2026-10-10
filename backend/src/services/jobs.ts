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
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type JobStatus = 'ok' | 'error' | 'running' | 'never';

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
}

export interface RegisterOptions {
  /** false → zamanlanmaz ve elle tetiklenemez (ör. DISABLE_MARKET_REFRESH) */
  enabled?: boolean;
  description?: string;
  /** Devre dışı olduğunda gösterilecek açıklama */
  disabledReason?: string;
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
}

export interface RunResult {
  ran: boolean;
  status: JobStatus;
}

const errorMessage = (error: unknown): string => {
  const e = error as { publicMessage?: string; message?: string } | undefined;
  const msg = e?.publicMessage || e?.message || String(error);
  return msg.slice(0, 500);
};

export class JobRegistry {
  private readonly jobs = new Map<string, JobEntry>();
  private readonly tasks: { stop: () => unknown }[] = [];

  constructor(private readonly quiet = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {}

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

  /**
   * Çakışma korumalı çalıştırma. Hata fırlatmaz (hata kaydedilir ve loglanır).
   * `running` bayrağı ilk await'ten ÖNCE set edilir: aynı tick'teki ikinci çağrı turu atlar.
   */
  async run(name: string): Promise<RunResult> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`[jobs] Bilinmeyen iş: ${name}`);
    }
    if (job.running) {
      if (!this.quiet) console.warn(`[cron] ${name} hâlâ çalışıyor; bu tur atlandı`);
      return { ran: false, status: 'running' };
    }
    job.running = true;
    job.lastStatus = 'running';
    job.lastRunAt = new Date();
    job.runCount += 1;
    const started = Date.now();
    try {
      await job.fn();
      job.lastStatus = 'ok';
      job.lastError = null;
    } catch (error) {
      job.lastStatus = 'error';
      job.lastError = errorMessage(error);
      console.error(`[cron] ${name} hatası:`, job.lastError);
    } finally {
      job.lastDurationMs = Date.now() - started;
      job.running = false;
    }
    return { ran: true, status: job.lastStatus };
  }

  /**
   * Admin: işi arka planda hemen başlatır (sonucu beklemez).
   * 404 bilinmeyen iş, 409 çalışıyor / devre dışı.
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
    }));
  }
}

/** Uygulama genelindeki tek kayıt (src/index.ts doldurur; testlerde boştur). */
export const jobs = new JobRegistry();
