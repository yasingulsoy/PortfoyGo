import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { checksumOf, listMigrationFiles, runMigrations } from '../src/db/migrator';
import { pool } from './helpers';

const quiet = { log: () => undefined };

describe('migration runner', () => {
  it('applies every file in lexical order and records them in schema_migrations', async () => {
    const files = listMigrationFiles().map((f) => f.filename);
    expect(files[0]).toBe('000_base.sql');
    expect([...files].sort()).toEqual(files);

    const r = await pool.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
    expect(r.rows.map((x) => x.filename)).toEqual(files);
    for (const row of r.rows) expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is idempotent: a second run applies nothing and dry-run reports no pending files', async () => {
    const again = await runMigrations(pool, quiet);
    expect(again.applied).toEqual([]);
    const dry = await runMigrations(pool, { ...quiet, dryRun: true });
    expect(dry.pending).toEqual([]);
  });

  it('re-running 000_base.sql on the migrated schema is a no-op', async () => {
    const res = await runMigrations(pool, { ...quiet, only: '000_base.sql' });
    expect(res.applied).toEqual(['000_base.sql']);
    const badges = await pool.query('SELECT COUNT(*)::int AS n FROM badges');
    expect(badges.rows[0].n).toBe(12);
  });

  it('dry-run lists new files, then a real run applies them; changed files are reported', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-mig-'));
    const table = `mig_test_${Date.now()}`;
    try {
      fs.writeFileSync(path.join(dir, '900_test.sql'), `CREATE TABLE ${table} (id int);`);
      fs.writeFileSync(path.join(dir, 'README.md'), 'ignored');

      const dry = await runMigrations(pool, { ...quiet, dir, dryRun: true });
      expect(dry.pending).toEqual(['900_test.sql']);
      expect((await pool.query(`SELECT to_regclass($1) AS t`, [table])).rows[0].t).toBeNull();

      const real = await runMigrations(pool, { ...quiet, dir });
      expect(real.applied).toEqual(['900_test.sql']);
      expect((await pool.query(`SELECT to_regclass($1) AS t`, [table])).rows[0].t).not.toBeNull();

      fs.writeFileSync(path.join(dir, '900_test.sql'), `CREATE TABLE ${table} (id int, x int);`);
      const changed = await runMigrations(pool, { ...quiet, dir });
      expect(changed.applied).toEqual([]);
      expect(changed.changed).toEqual(['900_test.sql']);
    } finally {
      await pool.query(`DELETE FROM schema_migrations WHERE filename = '900_test.sql'`);
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rolls back a failing migration completely', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-mig-'));
    const table = `mig_fail_${Date.now()}`;
    try {
      fs.writeFileSync(path.join(dir, '901_fail.sql'), `CREATE TABLE ${table} (id int); SELECT * FROM does_not_exist;`);
      await expect(runMigrations(pool, { ...quiet, dir })).rejects.toThrow(/901_fail\.sql/);
      expect((await pool.query(`SELECT to_regclass($1) AS t`, [table])).rows[0].t).toBeNull();
      const rec = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = '901_fail.sql'`);
      expect(rec.rows.length).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('upgrades a legacy schema_migrations(name, applied_at) table and skips files it lists', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { Pool } = await import('pg');
    const { startPgliteServer } = await import('../src/dev/pgliteServer');
    const db = await PGlite.create();
    const server = await startPgliteServer({ db, port: 0 });
    const legacyPool = new Pool({ connectionString: server.url(), max: 2 });
    try {
      await runMigrations(legacyPool, { ...quiet, only: '000_base.sql' });
      await runMigrations(legacyPool, { ...quiet, only: '001_hardening.sql' });
      // Eski runner'ın tablosunu taklit et
      await legacyPool.query(`
        DROP TABLE schema_migrations;
        CREATE TABLE schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO schema_migrations (name) VALUES ('001_hardening.sql');
      `);
      const res = await runMigrations(legacyPool, quiet);
      // 000 kayıtlı değildi → (idempotent olduğu için güvenle) uygulanır; 001 atlanır
      expect(res.applied).toContain('000_base.sql');
      expect(res.applied).not.toContain('001_hardening.sql');
      const cols = await legacyPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'schema_migrations' ORDER BY column_name`
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual(['applied_at', 'checksum', 'filename']);
      const legacy = await legacyPool.query(`SELECT checksum FROM schema_migrations WHERE filename = '001_hardening.sql'`);
      expect(legacy.rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await legacyPool.end();
      await server.stop();
      await db.close();
    }
  });

  it('checksum ignores CRLF vs LF', () => {
    expect(checksumOf('a\r\nb\r\n')).toBe(checksumOf('a\nb\n'));
  });
});
