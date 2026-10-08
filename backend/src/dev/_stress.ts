import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { startPgliteServer } from './pgliteServer';
import { runMigrations } from '../db/migrator';
(async () => {
  const db = await PGlite.create();
  const srv = await startPgliteServer({ db, port: 0 });
  const pool = new Pool({ connectionString: srv.url(), max: 10 });
  const t0 = Date.now();
  const r = await runMigrations(pool, { log: (m) => console.log(m) });
  console.log('migrated', r.applied, Date.now() - t0, 'ms');
  // concurrent parameterized queries
  const res = await Promise.all(Array.from({ length: 200 }, (_, i) => pool.query('SELECT $1::int AS v, $2::text AS s', [i, 'x' + i])));
  console.log('concurrent ok', res.every((x, i) => x.rows[0].v === i && x.rows[0].s === 'x' + i));
  // concurrent transactions incrementing counter
  await pool.query('CREATE TABLE ctr (id int primary key, n int)');
  await pool.query('INSERT INTO ctr VALUES (1, 0)');
  await Promise.all(Array.from({ length: 50 }, async () => {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const { rows } = await c.query('SELECT n FROM ctr WHERE id=$1 FOR UPDATE', [1]); await new Promise(r => setTimeout(r, 2)); await c.query('UPDATE ctr SET n=$1 WHERE id=1', [rows[0].n + 1]); await c.query('COMMIT'); } finally { c.release(); }
  }));
  console.log('counter', (await pool.query('SELECT n FROM ctr')).rows[0].n);
  // piggyback: tx holding client, inner pool.query
  const c = await pool.connect();
  await c.query('BEGIN'); await c.query('UPDATE ctr SET n = n + 1 WHERE id = 1');
  const inner = await pool.query('SELECT count(*)::int AS c FROM badges WHERE name = $1', ['Milyoner']);
  await c.query('COMMIT'); c.release();
  console.log('piggyback ok', inner.rows[0].c, (await pool.query('SELECT n FROM ctr')).rows[0].n);
  // error inside piggyback should not abort owner tx
  const c2 = await pool.connect();
  await c2.query('BEGIN'); await c2.query('UPDATE ctr SET n = n + 1 WHERE id = 1');
  await pool.query('SELECT * FROM nope').catch((e) => console.log('expected err:', e.message));
  await c2.query('COMMIT'); c2.release();
  console.log('after piggyback err', (await pool.query('SELECT n FROM ctr')).rows[0].n);
  // error in tx then rollback
  const c3 = await pool.connect();
  await c3.query('BEGIN'); await c3.query('SELECT 1/0').catch(e => console.log('expected', e.message)); await c3.query('ROLLBACK'); c3.release();
  console.log(await runMigrations(pool, { dryRun: true }));
  await pool.end(); await srv.stop(); await db.close();
  console.log('done', Date.now() - t0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
