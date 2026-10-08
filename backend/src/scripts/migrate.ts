import fs from 'fs';
import path from 'path';
import pool from '../config/database';

/**
 * backend/migrations/*.sql dosyalarını isim sırasıyla çalıştırır.
 * Her dosya tek bir transaction içinde çalışır; uygulanan dosyalar schema_migrations
 * tablosuna kaydedilir ve tekrar çalıştırılmaz (dosyalar ayrıca idempotent yazılmıştır).
 *
 * Kullanım:  npm run migrate              → bekleyen tüm migration'lar
 *            npm run migrate -- 001_hardening.sql   → sadece belirtilen dosya
 *
 * ⚠️ .env içindeki DATABASE_URL / DB_* hedefine bağlanır. Önce yedek alın.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function main() {
  const only = process.argv[2];
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .filter((f) => !only || f === only)
    .sort();

  if (files.length === 0) {
    console.log('Çalıştırılacak migration bulunamadı.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rows.length > 0 && !only) {
      console.log(`↷ ${file} zaten uygulanmış, atlandı`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      console.log(`→ ${file} uygulanıyor...`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET applied_at = CURRENT_TIMESTAMP',
        [file]
      );
      await client.query('COMMIT');
      console.log(`✓ ${file} tamamlandı`);
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`✗ ${file} başarısız (geri alındı): ${error?.message}`);
      process.exitCode = 1;
      return;
    } finally {
      client.release();
    }
  }
}

main()
  .catch((err) => {
    console.error('Migration hatası:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
