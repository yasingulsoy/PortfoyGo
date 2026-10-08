import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { startPgliteServer } from './pgliteServer';
(async () => {
  const db = await PGlite.create();
  const srv = await startPgliteServer({ db, port: 0, debug: true });
  const pool = new Pool({ connectionString: srv.url(), max: 10 });
  await pool.query('CREATE TABLE ctr (id int primary key, n int)');
  await pool.query('INSERT INTO ctr VALUES (1, 0)');
  const c = await pool.connect();
  await c.query('BEGIN'); await c.query('UPDATE ctr SET n = n + 1 WHERE id = 1');
  const inner = await pool.query('SELECT n, $1::text AS t FROM ctr', ['a']);
  console.log('inner', inner.rows, inner.command, inner.rowCount);
  const inner2 = await pool.query('SELECT n FROM ctr');
  console.log('inner2', inner2.rows);
  await c.query('COMMIT'); c.release();
  await pool.end(); await srv.stop(); await db.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
