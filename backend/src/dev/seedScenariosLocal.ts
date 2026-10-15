import { Pool } from 'pg';
import { seedScenarios } from './seed';

/**
 * Çalışan YEREL PGlite veritabanına senaryo örnek verisini (SENTETİK "Ani Çöküş Tatbikatı") bir kez uygular
 * (idempotent):
 *
 *   npx ts-node --transpile-only src/dev/seedScenariosLocal.ts
 *
 * Yalnızca 127.0.0.1:54329 (npm run db:local / dev:local) kabul edilir; başka her adres REDDEDİLİR.
 * backend/.env OKUNMAZ (dotenv yüklenmez). Adres SCENARIO_SEED_DATABASE_URL ile verilebilir (yine yalnızca yerel).
 * Önce 015_scenarios.sql uygulanmış olmalıdır.
 */
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

function assertLocal(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Geçersiz veritabanı adresi');
  }
  if (u.hostname !== '127.0.0.1' || u.port !== '54329') {
    throw new Error(`Reddedildi: yalnızca yerel PGlite (127.0.0.1:54329) kabul edilir, verilen: ${u.hostname}:${u.port || '(varsayılan)'}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.SCENARIO_SEED_DATABASE_URL || DEFAULT_URL;
  assertLocal(url);
  const pool = new Pool({ connectionString: url, max: 2, ssl: false });
  try {
    const res = await seedScenarios(pool);
    console.log(
      `[seed:scenarios] seriler: [${res.series.join(', ') || '-'}], senaryo: ${res.scenarioCreated ? 'oluşturuldu' : 'zaten var (veya 015 uygulanmamış)'}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[seed:scenarios] HATA: ${err?.message || err}`);
  process.exit(1);
});
