import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { startPgliteServer, PgliteServer } from '../src/dev/pgliteServer';
import { runMigrations } from '../src/db/migrator';

/**
 * Tüm test dosyaları için tek bir bellek içi PGlite + wire protokol sunucusu.
 * DATABASE_URL, worker süreçleri başlamadan önce ayarlanır; src/config/database.ts'deki pool ona bağlanır.
 */
export const TEST_USD_TRY = 40;

let db: PGlite | undefined;
let server: PgliteServer | undefined;

export async function setup(): Promise<void> {
  db = await PGlite.create();
  server = await startPgliteServer({ db, port: 0 });
  const url = server.url();

  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await runMigrations(pool, { log: () => undefined });
    // Sabit USD/TRY: tüm işlem fiyatları buna göre hesaplanır (PricingService 30 sn memo'lar)
    await pool.query(
      `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
       VALUES ('USD', 'Amerikan Doları', $1, $1, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (code) DO UPDATE SET buying = $1, selling = $1, updated_at = CURRENT_TIMESTAMP`,
      [TEST_USD_TRY]
    );
  } finally {
    await pool.end();
  }

  process.env.DATABASE_URL = url;
  process.env.TEST_DATABASE_URL = url;
}

export async function teardown(): Promise<void> {
  await server?.stop();
  await db?.close();
}
