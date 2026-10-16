import { spawn, spawnSync, ChildProcess } from 'child_process';
import path from 'path';
import { closeOnSignals, startLocalDb } from './localDb';
import { localDevEnv } from './localEnv';

/**
 * npm run dev:local — harici veritabanı / API anahtarı olmadan backend'i çalıştırır:
 *   1) Gömülü PGlite veritabanını başlatır (migration + örnek veri), bkz. localDb.ts
 *   2) Backend'i (nodemon + ts-node) yerel veritabanına bağlı, dış API'leri KAPALI şekilde başlatır.
 *
 * backend/.env dosyasındaki değerler (canlı DATABASE_URL, API anahtarları, SMTP) aşağıdaki
 * açık değerlerle EZİLİR: dotenv, ortamda zaten tanımlı (boş bile olsa) değişkenlerin üzerine yazmaz.
 *
 * Seçenekler: --reset (yerel veritabanını sıfırla). API_PORT (varsayılan 5001), LOCAL_DB_PORT (54329).
 */

const BACKEND_DIR = path.resolve(__dirname, '../..');

function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Windows süreç ağacını kendiliğinden kapatmaz (nodemon → ts-node)
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function main() {
  const ldb = await startLocalDb({ reset: process.argv.includes('--reset') });

  // Ortam (yerel DB, sabit JWT, dış servisler kapalı): bkz. localEnv.ts — dev:worker:local ile ortak
  const env = localDevEnv(ldb);

  console.log(`[dev:local] Backend başlatılıyor → http://localhost:${env.PORT}/api (DB: ${ldb.url})`);
  const nodemonBin = require.resolve('nodemon/bin/nodemon.js', { paths: [BACKEND_DIR] });
  const child = spawn(process.execPath, [nodemonBin] /* nodemon.json: exec ts-node src/index.ts */, {
    cwd: BACKEND_DIR,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    console.log(`[dev:local] Backend süreci kapandı (kod ${code}); veritabanı kapatılıyor`);
    void ldb.stop().finally(() => process.exit(code ?? 0));
  });

  closeOnSignals(ldb.stop, () => killTree(child));
}

main().catch((err) => {
  console.error(`[dev:local] HATA: ${err?.message || err}`);
  process.exit(1);
});
