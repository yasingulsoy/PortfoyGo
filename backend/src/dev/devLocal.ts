import { spawn, spawnSync, ChildProcess } from 'child_process';
import path from 'path';
import { closeOnSignals, startLocalDb } from './localDb';

/**
 * npm run dev:local — harici veritabanı / API anahtarı olmadan backend'i çalıştırır:
 *   1) Gömülü PGlite veritabanını başlatır (migration + örnek veri), bkz. localDb.ts
 *   2) Backend'i (nodemon + ts-node) yerel veritabanına bağlı, dış API'leri KAPALI şekilde başlatır.
 *
 * backend/.env dosyasındaki değerler (canlı DATABASE_URL, API anahtarları, SMTP) aşağıdaki
 * açık değerlerle EZİLİR: dotenv, ortamda zaten tanımlı (boş bile olsa) değişkenlerin üzerine yazmaz.
 *
 * Seçenekler: --reset (yerel veritabanını sıfırla). PORT (varsayılan 5001), LOCAL_DB_PORT (54329).
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

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: process.env.PORT || '5001',
    // --- Veritabanı: SADECE yerel PGlite ---
    DATABASE_URL: ldb.url,
    DB_SSL: 'false',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(ldb.port),
    // --- Kimlik doğrulama: sadece geliştirme için sabit anahtar ---
    JWT_SECRET: process.env.LOCAL_JWT_SECRET || 'dev-only-local-jwt-secret-do-not-use-in-production-000000',
    COOKIE_SECURE: 'false',
    COOKIE_DOMAIN: '',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    // --- Dış servisler kapalı: piyasa verisi tohumlanmış cache'ten gelir ---
    DISABLE_MARKET_REFRESH: '1',
    ENABLE_BACKGROUND_STOCK_REFRESH: 'false',
    FINNHUB_API_KEY: '',
    FINNHUB_API_KEYS: '',
    COINGECKO_API_KEY: '',
    NEXT_PUBLIC_COINGECKO_API_KEY: '',
    DOVIZ: '',
    EMTIA: '',
    DEFAULT_USD_TRY: '',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: '',
  };

  console.log(`[dev:local] Backend başlatılıyor → http://localhost:${env.PORT}/api (DB: ${ldb.url})`);
  const nodemonBin = require.resolve('nodemon/bin/nodemon.js', { paths: [BACKEND_DIR] });
  const child = spawn(process.execPath, [nodemonBin, 'src/index.ts'], {
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
