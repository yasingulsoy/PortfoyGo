import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';

/**
 * SQL migration çalıştırıcısı.
 *
 * - backend/migrations/NNN_ad.sql dosyalarını isim (lexical) sırasıyla uygular.
 * - Her dosya kendi transaction'ında çalışır (dosyalarda BEGIN/COMMIT olmamalı).
 * - Uygulananlar schema_migrations(filename, applied_at, checksum) tablosuna yazılır ve atlanır.
 * - Uygulanmış bir dosya sonradan değiştiyse (checksum farklı) uyarı verilir, yeniden çalıştırılmaz.
 *
 * Hem CLI (src/scripts/migrate.ts) hem yerel geliştirme veritabanı (src/dev/localDb.ts)
 * hem de testler tarafından kullanılır; bu yüzden pool dışarıdan verilir.
 */

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

const FILE_PATTERN = /^\d+_.+\.sql$/;

export interface MigrationFile {
  filename: string;
  checksum: string;
  sql: string;
}

export interface MigrateOptions {
  /** Hiçbir şey uygulama; sadece bekleyenleri listele */
  dryRun?: boolean;
  /** Sadece bu dosyayı uygula (daha önce uygulanmış olsa bile yeniden çalıştırır) */
  only?: string;
  /** Varsayılan: backend/migrations */
  dir?: string;
  /** Çıktı fonksiyonu (varsayılan console.log); sessiz mod için () => {} verin */
  log?: (msg: string) => void;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
  pending: string[];
  changed: string[];
}

/** CRLF/LF farkı (Windows ↔ Linux checkout) checksum'ı değiştirmesin */
export function checksumOf(sql: string): string {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function listMigrationFiles(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((f) => FILE_PATTERN.test(f))
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
      return { filename, sql, checksum: checksumOf(sql) };
    });
}

/**
 * schema_migrations tablosunu oluşturur. Eski runner'ın (name, applied_at) şemasıyla
 * oluşturulmuş bir tablo varsa (filename, applied_at, checksum) şemasına yükseltir.
 */
async function ensureMigrationsTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum   VARCHAR(64)
      )
    `);
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'schema_migrations'`
    );
    const names = new Set(cols.rows.map((r: any) => r.column_name as string));
    if (!names.has('filename') && names.has('name')) {
      await client.query('ALTER TABLE schema_migrations RENAME COLUMN name TO filename');
    }
    if (!names.has('checksum')) {
      await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)');
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(pool: Pool, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const all = listMigrationFiles(opts.dir);
  const result: MigrateResult = { applied: [], skipped: [], pending: [], changed: [] };

  if (opts.only && !all.some((f) => f.filename === opts.only)) {
    throw new Error(`Migration dosyası bulunamadı: ${opts.only}`);
  }
  if (all.length === 0) {
    log('Migration dosyası bulunamadı.');
    return result;
  }

  // Dry-run hiçbir şey yazmamalı: tablo yoksa her şey bekliyor demektir
  let appliedRows: { filename: string; checksum: string | null }[] = [];
  if (opts.dryRun) {
    const exists = await pool.query(`SELECT to_regclass('schema_migrations') IS NOT NULL AS ok`);
    if (exists.rows[0]?.ok) {
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'schema_migrations'`
      );
      const names = new Set(cols.rows.map((r: any) => r.column_name as string));
      const fileCol = names.has('filename') ? 'filename' : 'name';
      const sumCol = names.has('checksum') ? 'checksum' : 'NULL::text';
      appliedRows = (await pool.query(`SELECT ${fileCol} AS filename, ${sumCol} AS checksum FROM schema_migrations`)).rows;
    }
  } else {
    await ensureMigrationsTable(pool);
    appliedRows = (await pool.query('SELECT filename, checksum FROM schema_migrations')).rows;
  }
  const applied = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

  for (const file of all) {
    if (opts.only && file.filename !== opts.only) continue;

    const prev = applied.get(file.filename);
    const isApplied = applied.has(file.filename);

    if (isApplied && !opts.only) {
      if (prev && prev !== file.checksum) {
        result.changed.push(file.filename);
        log(`! ${file.filename} uygulandıktan sonra DEĞİŞMİŞ (checksum farklı) — yeniden çalıştırılmadı`);
      } else {
        log(`= ${file.filename} zaten uygulanmış`);
      }
      if (!prev && !opts.dryRun) {
        // Eski runner checksum kaydetmiyordu: mevcut içeriği referans al
        await pool.query('UPDATE schema_migrations SET checksum = $2 WHERE filename = $1 AND checksum IS NULL', [
          file.filename,
          file.checksum,
        ]);
      }
      result.skipped.push(file.filename);
      continue;
    }

    result.pending.push(file.filename);
    if (opts.dryRun) {
      log(`+ ${file.filename} bekliyor${isApplied ? ' (yeniden uygulanacak)' : ''}`);
      continue;
    }

    const client = await pool.connect();
    const started = Date.now();
    try {
      log(`→ ${file.filename} uygulanıyor...`);
      await client.query('BEGIN');
      await client.query(file.sql);
      await client.query(
        `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
         ON CONFLICT (filename) DO UPDATE SET applied_at = CURRENT_TIMESTAMP, checksum = EXCLUDED.checksum`,
        [file.filename, file.checksum]
      );
      await client.query('COMMIT');
      result.applied.push(file.filename);
      log(`✓ ${file.filename} tamamlandı (${Date.now() - started} ms)`);
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      const where = error?.position ? ` (konum ${error.position})` : '';
      const err = new Error(`${file.filename} başarısız, geri alındı: ${error?.message || error}${where}`);
      (err as any).cause = error;
      throw err;
    } finally {
      client.release();
    }
  }

  return result;
}
