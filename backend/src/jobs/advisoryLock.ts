import type { Client } from 'pg';
import { createStandaloneClient } from '../config/database';
import { logger } from '../utils/logger';
import { appRole } from '../infra/runtime';
import type { JobLock } from '../services/jobs';

/**
 * Zamanlanmış işler için PostgreSQL advisory lock (oturum düzeyi).
 *
 * - Her iş adı kararlı bir anahtara eşlenir: pg_try_advisory_lock(JOB_LOCK_NAMESPACE, jobLockKey(ad)).
 *   (İki int4'lü biçim: pg_locks'ta classid = ad alanı, objid = iş anahtarı, objsubid = 2.)
 * - Kilit, havuz DIŞINDAKİ tek ve kalıcı bir bağlantı üzerinde alınır/bırakılır (iş sorguları havuzu kullanmaya
 *   devam eder). Bu bağlantı koparsa PostgreSQL o oturumun tüm kilitlerini kendiliğinden bırakır; sonraki
 *   denemede yeni bağlantı açılır.
 * - Kilit alınamazsa (başka örnek aynı işi çalıştırıyor) iş bu turda atlanır ("skipped (locked)"), hata sayılmaz.
 *
 * DİKKAT — bağlantı havuzlayıcıları: PgBouncer / Supabase "transaction" modu, Neon "-pooler" uç noktası gibi
 * işlem düzeyinde havuzlayan adreslerde oturum kilitleri ÇALIŞMAZ. Ana DATABASE_URL böyle bir adresse
 * JOB_LOCK_DATABASE_URL ile doğrudan (session) bağlantı adresi verin.
 *
 * PGlite (yerel geliştirme): tüm bağlantılar TEK bir PostgreSQL oturumunu paylaşır; advisory lock'lar
 * bağlantılar arasında yeniden girişlidir (re-entrant) ve dışlama sağlamaz. Bu durum açılışta `version()`
 * ile algılanır ve kilit almadan önce pg_locks'ta aynı anahtarın tutulup tutulmadığına bakılır. Böylece yerelde
 * API + worker aynı PGlite'a bağlıyken de iki süreç aynı işi aynı anda çalıştırmaz.
 */

/** 'PGJB' (0x50474A42) — PortfoyGo iş kilitleri ad alanı (int4) */
export const JOB_LOCK_NAMESPACE = 0x50474a42;

/** İş adı → kararlı pozitif int4 (FNV-1a 32 bit, işaret biti temizlenmiş) */
export function jobLockKey(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

const TRY_LOCK_SQL = 'SELECT pg_try_advisory_lock($1::int4, $2::int4) AS ok';
const TRY_LOCK_SHARED_SESSION_SQL = `
  SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM pg_locks
              WHERE locktype = 'advisory' AND granted
                AND classid = $1::int4::oid AND objid = $2::int4::oid AND objsubid = 2
           ) THEN FALSE
           ELSE pg_try_advisory_lock($1::int4, $2::int4)
         END AS ok`;
const UNLOCK_SQL = 'SELECT pg_advisory_unlock($1::int4, $2::int4) AS ok';

export class PgAdvisoryJobLock implements JobLock {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private sharedSession = false;
  private readonly held = new Set<string>();
  private closed = false;
  /** Tek bağlantı: sorgular sırayla gönderilir (pg, aynı istemcide eşzamanlı query'yi kaldırıyor) */
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  constructor(private readonly factory: () => Client = defaultLockClient) {}

  /** Yerel PGlite gibi tek oturumlu arka uç algılandı mı? (bilgi / test) */
  get isSharedSession(): boolean {
    return this.sharedSession;
  }

  private async getClient(): Promise<Client> {
    if (this.closed) throw new Error('İş kilidi kapatıldı');
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const c = this.factory();
        c.on('error', (err) => {
          logger.warn({ err: err?.message }, '[jobs] kilit bağlantısı hatası; kilitler sunucuda bırakıldı, yeniden bağlanılacak');
          this.drop(c);
        });
        c.on('end', () => this.drop(c));
        try {
          await c.connect();
          const v = await c.query<{ v: string }>('SELECT version() AS v');
          this.sharedSession = /pglite/i.test(v.rows[0]?.v ?? '');
        } catch (err) {
          this.drop(c);
          throw err;
        }
        this.client = c;
        return c;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private drop(c: Client): void {
    if (this.client === c) {
      this.client = null;
      // Oturum kapandıysa sunucu tüm kilitleri bıraktı
      this.held.clear();
    }
    c.end().catch(() => undefined);
  }

  tryAcquire(name: string): Promise<boolean> {
    return this.serial(async () => {
      const c = await this.getClient();
      const r = await c.query<{ ok: boolean }>(this.sharedSession ? TRY_LOCK_SHARED_SESSION_SQL : TRY_LOCK_SQL, [
        JOB_LOCK_NAMESPACE,
        jobLockKey(name),
      ]);
      const ok = r.rows[0]?.ok === true;
      if (ok) this.held.add(name);
      return ok;
    });
  }

  release(name: string): Promise<void> {
    if (!this.held.delete(name)) return Promise.resolve();
    return this.serial(async () => {
      const c = this.client;
      if (!c) return; // bağlantı koptu → kilit zaten bırakıldı
      try {
        await c.query(UNLOCK_SQL, [JOB_LOCK_NAMESPACE, jobLockKey(name)]);
      } catch (err) {
        logger.warn({ err: (err as Error)?.message, job: name }, '[jobs] kilit bırakılamadı; bağlantı yenilenecek');
        this.drop(c);
      }
    });
  }

  /** Kapanış: bağlantıyı kapatır (oturumdaki tüm kilitler sunucuda bırakılır). */
  async close(): Promise<void> {
    this.closed = true;
    const c = this.client;
    this.client = null;
    this.held.clear();
    if (c) await c.end().catch(() => undefined);
  }
}

function defaultLockClient(): Client {
  const url = process.env.JOB_LOCK_DATABASE_URL?.trim();
  return createStandaloneClient({
    ...(url ? { connectionString: url } : {}),
    application_name: `portfoygo-${appRole()}-job-locks`,
    keepAlive: true,
    // Kilit sorguları anlıktır; askıda kalan bir bağlantı zamanlayıcıyı kilitlemesin
    query_timeout: 5000,
    connectionTimeoutMillis: 5000,
  });
}
