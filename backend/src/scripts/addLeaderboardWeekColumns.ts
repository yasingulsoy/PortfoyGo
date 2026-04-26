import pool from '../config/database';

/**
 * Haftalık liderlik için hafta başı equity ve ISO hafta anahtarı.
 * Mevcut veritabanına bir kez çalıştırın: npm run add-leaderboard-week-columns
 */
async function addLeaderboardWeekColumns() {
  try {
    console.log('Haftalık liderlik kolonları ekleniyor...\n');

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS week_baseline_equity DECIMAL(15,2);
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS week_baseline_iso_key VARCHAR(12);
    `);

    // Mevcut kullanıcılar: mevcut toplam varlık = bu haftanın başı kabul (ilk kurulum)
    await pool.query(`
      UPDATE users u
      SET
        week_baseline_equity = e.total_eq,
        week_baseline_iso_key = w.k
      FROM (
        SELECT
          u2.id,
          u2.balance + COALESCE((
            SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u2.id
          ), 0) AS total_eq
        FROM users u2
      ) e
      CROSS JOIN LATERAL (
        SELECT
          to_char(
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
            'IYYY'
          ) || '-' || to_char(
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
            'IW'
          ) AS k
      ) w
      WHERE u.id = e.id
        AND (u.week_baseline_equity IS NULL OR u.week_baseline_iso_key IS NULL);
    `);

    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN week_baseline_equity SET DEFAULT 100000;
    `);

    await pool.query(`
      UPDATE users
      SET week_baseline_equity = 100000
      WHERE week_baseline_equity IS NULL;
    `);
    await pool.query(`
      UPDATE users
      SET week_baseline_iso_key = (
        SELECT
          to_char(
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
            'IYYY'
          ) || '-' || to_char(
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
            'IW'
          )
      )
      WHERE week_baseline_iso_key IS NULL;
    `);

    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN week_baseline_equity SET NOT NULL;
    `);

    console.log('✅ week_baseline_equity, week_baseline_iso_key eklendi ve dolduruldu');
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addLeaderboardWeekColumns();
