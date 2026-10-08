import pool from '../config/database';
import { runMigrations } from '../db/migrator';

/**
 * backend/migrations/*.sql dosyalarını isim sırasıyla uygular (bkz. src/db/migrator.ts).
 *
 * Kullanım:
 *   npm run migrate                          → bekleyen tüm migration'lar
 *   npm run migrate -- --dry-run             → sadece bekleyenleri listele, hiçbir şey yazma
 *   npm run migrate -- 001_hardening.sql     → sadece bu dosya (uygulanmış olsa bile yeniden)
 *
 * ⚠️ DATABASE_URL / DB_* hedefine bağlanır (ortamda tanımlı değilse backend/.env'den okunur).
 *    Canlı veritabanında çalıştırmadan önce yedek alın.
 */
function describeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
    } catch {
      return '(DATABASE_URL)';
    }
  }
  return `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'trading_platform'}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const unknown = args.filter((a) => a.startsWith('-') && a !== '--dry-run');
  if (unknown.length > 0) {
    throw new Error(`Bilinmeyen seçenek: ${unknown.join(' ')} (desteklenen: --dry-run, <dosya.sql>)`);
  }
  const only = args.find((a) => !a.startsWith('-'));

  console.log(`[migrate] Hedef: ${describeTarget()}${dryRun ? ' (dry-run)' : ''}`);
  const result = await runMigrations(pool, { dryRun, only });

  if (dryRun) {
    console.log(
      result.pending.length === 0
        ? '[migrate] Bekleyen migration yok.'
        : `[migrate] ${result.pending.length} migration bekliyor: ${result.pending.join(', ')}`
    );
  } else {
    console.log(
      `[migrate] Bitti: ${result.applied.length} uygulandı, ${result.skipped.length} zaten uygulanmıştı.`
    );
  }
  if (result.changed.length > 0) {
    console.warn(`[migrate] UYARI: uygulandıktan sonra değişen dosyalar: ${result.changed.join(', ')}`);
  }
}

main()
  .catch((err) => {
    console.error(`[migrate] HATA: ${err?.message || err}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
