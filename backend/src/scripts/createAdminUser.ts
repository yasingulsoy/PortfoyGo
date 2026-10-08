import pool from '../config/database';
import bcrypt from 'bcryptjs';

/**
 * Admin kullanıcısı oluşturur veya MEVCUT bir kullanıcıyı (aynı email) admin yapar.
 *
 * Gerekli env değişkenleri:
 *   ADMIN_EMAIL     — admin email adresi
 *   ADMIN_USERNAME  — admin kullanıcı adı (3-20, [a-zA-Z0-9_])
 *   ADMIN_PASSWORD  — en az 12 karakter
 *
 * Kullanım: ADMIN_EMAIL=... ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run create-admin
 *
 * Güvenlik: Kullanıcı adı eşleşen ama email'i farklı olan bir hesap ASLA admin yapılmaz.
 */
async function createAdminUser() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const username = (process.env.ADMIN_USERNAME || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';

  const errors: string[] = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('ADMIN_EMAIL geçerli bir email olmalı');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) errors.push('ADMIN_USERNAME 3-20 karakter, sadece harf/rakam/alt çizgi olmalı');
  if (password.length < 12) errors.push('ADMIN_PASSWORD en az 12 karakter olmalı');
  if (password.length > 72) errors.push('ADMIN_PASSWORD en fazla 72 karakter olabilir');

  if (errors.length > 0) {
    errors.forEach((e) => console.error(`❌ ${e}`));
    process.exitCode = 1;
    await pool.end();
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const byEmail = await pool.query('SELECT id, username FROM users WHERE LOWER(email) = $1', [email]);
    const byUsername = await pool.query('SELECT id, email FROM users WHERE LOWER(username) = LOWER($1)', [username]);

    if (byEmail.rows.length > 0) {
      const user = byEmail.rows[0];
      await pool.query(
        `UPDATE users
            SET is_admin = TRUE,
                is_banned = FALSE,
                email_verified = TRUE,
                password_hash = $1
          WHERE id = $2`,
        [passwordHash, user.id]
      );
      console.log(`✅ Mevcut kullanıcı admin yapıldı: ${user.username} <${email}> (şifre ADMIN_PASSWORD ile güncellendi)`);
      return;
    }

    if (byUsername.rows.length > 0) {
      console.error(
        `❌ "${username}" kullanıcı adı başka bir email ile kayıtlı. Güvenlik nedeniyle bu hesap admin yapılmadı. ` +
          'Farklı bir ADMIN_USERNAME seçin veya o hesabın email adresini ADMIN_EMAIL olarak verin.'
      );
      process.exitCode = 1;
      return;
    }

    await pool.query(
      `INSERT INTO users (
          username, email, password_hash, email_verified, is_admin, is_banned, balance,
          week_baseline_equity, week_baseline_iso_key
        )
       VALUES ($1, $2, $3, TRUE, TRUE, FALSE, 100000.00, 100000.00,
          to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IYYY')
            || '-' ||
          to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IW')
       )`,
      [username, email, passwordHash]
    );
    console.log(`✅ Admin kullanıcısı oluşturuldu: ${username} <${email}>`);
  } catch (error: any) {
    console.error('❌ Hata:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdminUser();
