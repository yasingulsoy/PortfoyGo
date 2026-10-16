import net from 'net';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { localDevEnv } from './localEnv';

/**
 * npm run dev:worker:local — ayrı worker sürecini (src/worker.ts) ZATEN ÇALIŞAN yerel PGlite'a bağlar
 * (önce `npm run dev:local` veya `npm run db:local`). backend/.env'deki uzak DATABASE_URL KULLANILMAZ.
 *
 * Yerel API (dev:local) RUN_JOBS tanımsız olduğu için işleri kendisi de çalıştırır; iki süreç aynı işi aynı
 * anda çalıştırmaz (PostgreSQL advisory lock; PGlite'ın tek oturumu için pg_locks kontrolü — bkz.
 * jobs/advisoryLock.ts). Atlanan turlar /jobs ve admin panelinde "skipped (locked)" olarak görünür.
 * Yalnızca worker'ın çalıştırması için API'yi LOCAL_RUN_JOBS=0 ile başlatın.
 *
 * Ortam: LOCAL_DB_PORT (54329), WORKER_PORT (5102), LOCAL_REDIS_URL, LOCAL_METRICS_TOKEN.
 */

const BACKEND_DIR = path.resolve(__dirname, '../..');
const port = parseInt(process.env.LOCAL_DB_PORT || '54329', 10);
const url = `postgres://postgres@127.0.0.1:${port}/postgres`;

function reachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(2000, () => {
      s.destroy();
      resolve(false);
    });
  });
}

function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function main() {
  if (!(await reachable())) {
    console.error(`[dev:worker:local] 127.0.0.1:${port} yanıt vermiyor. Önce "npm run dev:local" (veya db:local) çalıştırın.`);
    process.exit(1);
  }
  const env = localDevEnv({ url, port }, { WORKER_PORT: process.env.WORKER_PORT || '5102', APP_ROLE: 'worker' });
  console.log(`[dev:worker:local] Worker başlatılıyor → http://localhost:${env.WORKER_PORT}/healthz (DB: ${url})`);
  const nodemonBin = require.resolve('nodemon/bin/nodemon.js', { paths: [BACKEND_DIR] });
  const child = spawn(process.execPath, [nodemonBin, '--exec', 'ts-node src/worker.ts'], { cwd: BACKEND_DIR, env, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      killTree(child);
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(`[dev:worker:local] HATA: ${err?.message || err}`);
  process.exit(1);
});
