import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { startPgliteServer } from './pgliteServer';
import { runMigrations } from '../db/migrator';
import { DEMO_EMAIL, DEMO_USERNAME, seedMarketData, seedUsers, tickMarket } from './seed';

/**
 * Yerel geliştirme veritabanı: gömülü PostgreSQL (PGlite, WASM) + wire protokol soketi.
 *
 *   npm run db:local            → sadece veritabanı (127.0.0.1:54329), Ctrl+C ile durur
 *   npm run db:local -- --reset → .localdb klasörünü silip sıfırdan kurar
 *   npm run dev:local           → veritabanı + backend (bkz. src/dev/devLocal.ts)
 *
 * Veriler backend/.localdb/pgdata altında saklanır (git'e girmez). Harici hiçbir veritabanına bağlanmaz.
 *
 * Ortam değişkenleri:
 *   LOCAL_DB_PORT        (varsayılan 54329)
 *   LOCAL_DEMO_PASSWORD  demo kullanıcısının şifresi (boş: ilk kurulumda rastgele üretilir ve
 *                        backend/.localdb/demo-credentials.txt dosyasına yazılır)
 *   LOCAL_DB_TICK_MS     sahte fiyat hareketi aralığı (varsayılan 60000; 0 = kapalı)
 */

export const LOCALDB_DIR = path.resolve(__dirname, '../../.localdb');
export const DEFAULT_LOCAL_DB_PORT = 54329;

export interface LocalDb {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

export interface StartLocalDbOptions {
  port?: number;
  /** undefined → backend/.localdb/pgdata ; 'memory://' → kalıcı değil */
  dataDir?: string;
  reset?: boolean;
  demoPassword?: string;
  tickMs?: number;
  log?: (msg: string) => void;
}

export async function startLocalDb(opts: StartLocalDbOptions = {}): Promise<LocalDb> {
  const log = opts.log ?? ((m: string) => console.log(`[db:local] ${m}`));
  const port = opts.port ?? parseInt(process.env.LOCAL_DB_PORT || String(DEFAULT_LOCAL_DB_PORT), 10);
  const dataDir = opts.dataDir ?? path.join(LOCALDB_DIR, 'pgdata');
  const persistent = !dataDir.startsWith('memory://');

  if (opts.reset && persistent && fs.existsSync(LOCALDB_DIR)) {
    log(`${LOCALDB_DIR} siliniyor (--reset)`);
    fs.rmSync(LOCALDB_DIR, { recursive: true, force: true });
  }
  if (persistent) fs.mkdirSync(dataDir, { recursive: true });

  const t0 = Date.now();
  const db = await PGlite.create(persistent ? dataDir : undefined);
  let server;
  try {
    server = await startPgliteServer({ db, host: '127.0.0.1', port });
  } catch (err: any) {
    await db.close().catch(() => undefined);
    if (err?.code === 'EADDRINUSE') {
      throw new Error(`127.0.0.1:${port} kullanımda. Başka bir db:local açık olabilir (LOCAL_DB_PORT ile değiştirin).`);
    }
    throw err;
  }
  const url = server.url();
  log(`PGlite hazır (${persistent ? dataDir : 'bellek içi'}) → ${url}  [${Date.now() - t0} ms]`);

  const pool = new Pool({ connectionString: url, max: 4 });
  try {
    const res = await runMigrations(pool, { log: (m) => log(m) });
    log(`Migration: ${res.applied.length} uygulandı, ${res.skipped.length} zaten uygulanmıştı`);

    await seedMarketData(pool);
    const demoPassword = opts.demoPassword ?? (process.env.LOCAL_DEMO_PASSWORD || undefined);
    const seeded = await seedUsers(pool, demoPassword);
    if (seeded.created) {
      log(`Örnek veri yüklendi: demo kullanıcı + 4 örnek kullanıcı, portföyler, işlem geçmişi`);
      if (seeded.generatedPassword && persistent) {
        const credFile = path.join(LOCALDB_DIR, 'demo-credentials.txt');
        fs.writeFileSync(
          credFile,
          `# Yerel PGlite demo hesabı (sadece bu bilgisayardaki .localdb veritabanı için)\n` +
            `email=${DEMO_EMAIL}\nusername=${DEMO_USERNAME}\npassword=${seeded.generatedPassword}\n`,
          'utf8'
        );
        log(`Demo hesabı: ${DEMO_EMAIL} — şifre (bir kez gösterilir): ${seeded.generatedPassword}`);
        log(`(Şifre ayrıca ${credFile} dosyasına yazıldı.)`);
      } else if (seeded.generatedPassword) {
        log(`Demo hesabı: ${DEMO_EMAIL} — şifre: ${seeded.generatedPassword}`);
      } else {
        log(`Demo hesabı: ${DEMO_EMAIL} (şifre: LOCAL_DEMO_PASSWORD)`);
      }
    } else {
      log(`Demo hesabı mevcut: ${DEMO_EMAIL} (şifre: .localdb/demo-credentials.txt veya LOCAL_DEMO_PASSWORD)`);
    }
  } catch (err) {
    await pool.end().catch(() => undefined);
    await server.stop().catch(() => undefined);
    await db.close().catch(() => undefined);
    throw err;
  }

  const tickMs = opts.tickMs ?? parseInt(process.env.LOCAL_DB_TICK_MS || '60000', 10);
  let ticking = false;
  const timer =
    tickMs > 0
      ? setInterval(() => {
          if (ticking) return;
          ticking = true;
          tickMarket(pool)
            .catch((err) => log(`Fiyat simülasyonu hatası: ${err?.message || err}`))
            .finally(() => {
              ticking = false;
            });
        }, tickMs)
      : null;
  if (timer) log(`Çevrimdışı fiyat simülasyonu açık (${Math.round(tickMs / 1000)} sn'de bir; LOCAL_DB_TICK_MS=0 ile kapatın)`);

  let stopped = false;
  return {
    url,
    port: server.port,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      await pool.end().catch(() => undefined);
      await server.stop().catch(() => undefined);
      await db.close().catch(() => undefined);
      log('Veritabanı kapatıldı');
    },
  };
}

/** SIGINT/SIGTERM'de veritabanını düzgün kapat */
export function closeOnSignals(stop: () => Promise<void>, before?: () => void | Promise<void>): void {
  let closing = false;
  const handler = async () => {
    if (closing) return;
    closing = true;
    try {
      await before?.();
      await stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  process.on('SIGHUP', handler);
}

if (require.main === module) {
  startLocalDb({ reset: process.argv.includes('--reset') })
    .then((ldb) => {
      console.log(`[db:local] Bağlantı: DATABASE_URL=${ldb.url} DB_SSL=false`);
      console.log('[db:local] Durdurmak için Ctrl+C');
      closeOnSignals(ldb.stop);
    })
    .catch((err) => {
      console.error(`[db:local] HATA: ${err?.message || err}`);
      process.exit(1);
    });
}
