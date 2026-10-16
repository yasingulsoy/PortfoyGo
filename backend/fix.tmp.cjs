const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54329/postgres', max: 1 });
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const u = await c.query(`SELECT id, totp_enabled_at, token_version FROM users WHERE username = 'can_hisse'`);
    const id = u.rows[0].id;
    console.log('before', { enabled: u.rows[0].totp_enabled_at, tv: u.rows[0].token_version });
    await c.query(`UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_pending_enc = NULL, totp_pending_at = NULL,
                   totp_last_step = NULL, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = $1`, [id]);
    const rc = await c.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [id]);
    const n = await c.query(`DELETE FROM notifications WHERE user_id = $1 AND type LIKE 'security.2fa_%' AND created_at > now() - interval '30 minutes'`, [id]);
    const a = await c.query(`DELETE FROM activity_logs WHERE user_id = $1 AND activity_type IN ('two_factor_enabled','two_factor_disabled','data_export') AND created_at > now() - interval '30 minutes'`, [id]);
    await c.query('COMMIT');
    console.log('removed recovery codes', rc.rowCount, 'notifications', n.rowCount, 'activity', a.rowCount);
    const after = await pool.query(`SELECT username, totp_enabled_at, totp_secret_enc FROM users WHERE username IN ('can_hisse','kvkk_tfa','demo','aylin_trader','mert_kripto','zeynep_uzun')`);
    console.log(after.rows);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); await pool.end(); }
})();
