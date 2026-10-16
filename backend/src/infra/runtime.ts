import os from 'os';
import { randomUUID } from 'crypto';

/**
 * Süreç rolü ve çalışma zamanı bayrakları (çoklu örnek / worker ayrımı).
 *
 *   APP_ROLE  api | worker   — src/worker.ts 'worker' yapar (bkz. infra/workerRole.ts); loglarda `service` alanı
 *   RUN_JOBS  1 | 0          — API sürecinde zamanlanmış işler (cron) çalışsın mı?
 *                              Tanımsızsa AÇIK (bugünkü tek süreç davranışı; `npm run dev:local` değişmez).
 *                              Ayrı worker kullanılan dağıtımda API örneklerinde RUN_JOBS=0 yapın.
 *                              Worker (src/worker.ts) bu bayraktan bağımsız olarak işleri her zaman çalıştırır.
 *
 * İşler her durumda PostgreSQL advisory lock ile korunur (bkz. jobs/advisoryLock.ts): RUN_JOBS açık birden
 * fazla örnek aynı işi AYNI ANDA çalıştırmaz.
 */

export type AppRole = 'api' | 'worker';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/** '1/true/yes/on' → true, '0/false/no/off' → false, boş/tanımsız/geçersiz → undefined */
export function parseBoolEnv(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return undefined;
}

export function appRole(): AppRole {
  return process.env.APP_ROLE?.trim().toLowerCase() === 'worker' ? 'worker' : 'api';
}

/** API sürecinde cron işleri çalışsın mı? (RUN_JOBS; tanımsız → açık) */
export function runJobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBoolEnv(env.RUN_JOBS) ?? true;
}

/**
 * Bu sürecin kararlı kimliği (pub/sub'da kendi yayınını tanımak, iş durumunda "hangi örnek çalıştırdı").
 * Biçim: <host>:<pid>:<rastgele>. Gizli bilgi içermez.
 */
export const INSTANCE_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
