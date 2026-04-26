import pool from '../config/database';
import bcrypt from 'bcryptjs';

async function createAdminUser() {
  try {
    console.log('🔧 Admin kullanıcısı oluşturuluyor...\n');

    const username = 'admin';
    const email = 'admin@portfoygo.com';
    const password = 'admin';

    // Şifreyi hashle
    const passwordHash = await bcrypt.hash(password, 10);

    // Kullanıcı zaten var mı kontrol et
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      // Kullanıcı varsa admin yap
      await pool.query(
        `UPDATE users 
         SET is_admin = TRUE, 
             is_banned = FALSE,
             email_verified = TRUE,
             password_hash = $1
         WHERE username = $2 OR email = $3`,
        [passwordHash, username, email]
      );
      console.log('✅ Mevcut kullanıcı admin yapıldı!');
    } else {
      // Yeni admin kullanıcısı oluştur
      await pool.query(
        `INSERT INTO users (
            username, email, password_hash, email_verified, is_admin, is_banned, balance,
            week_baseline_equity, week_baseline_iso_key
          )
         VALUES ($1, $2, $3, TRUE, TRUE, FALSE, 1000000.00, 1000000.00,
            (SELECT
              to_char(
                (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
                'IYYY'
              ) || '-' || to_char(
                (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
                'IW'
              )
            )
         )
         ON CONFLICT (username) DO UPDATE SET
           is_admin = TRUE,
           is_banned = FALSE,
           email_verified = TRUE,
           password_hash = EXCLUDED.password_hash`,
        [username, email, passwordHash]
      );
      console.log('✅ Admin kullanıcısı oluşturuldu!');
    }

    console.log('\n📋 Admin Bilgileri:');
    console.log('   Username: admin');
    console.log('   Email: admin@portfoygo.com');
    console.log('   Password: admin');
    console.log('\n✅ İşlem tamamlandı!');
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createAdminUser();

