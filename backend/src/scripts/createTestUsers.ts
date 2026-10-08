import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../config/database';

/**
 * YEREL GELİŞTİRME için test kullanıcıları oluşturur.
 *
 * - Email adresleri @example.com (gerçek adres yok).
 * - Şifre: TEST_USER_PASSWORD env değişkeni verilmişse (en az 12 karakter) o kullanılır,
 *   yoksa her kullanıcı için rastgele güçlü bir şifre üretilir ve SADECE BİR KEZ ekrana yazılır.
 * - NODE_ENV=production iken çalışmayı reddeder.
 * - Örnek portföy verisi eklenmez (fiyatlar sunucu tarafından belirlenir).
 */

const TEST_USERS = [
  { username: 'testuser1', email: 'test1@example.com' },
  { username: 'testuser2', email: 'test2@example.com' },
  { username: 'trader1', email: 'trader1@example.com' },
  { username: 'investor1', email: 'investor1@example.com' },
];

function randomPassword(): string {
  return crypto.randomBytes(12).toString('base64url'); // 16 karakter
}

async function createTestUsers() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Bu script production ortamında çalıştırılamaz.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const sharedPassword = process.env.TEST_USER_PASSWORD;
  if (sharedPassword !== undefined && sharedPassword.length < 12) {
    console.error('❌ TEST_USER_PASSWORD en az 12 karakter olmalı.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const created: { email: string; password: string }[] = [];

  try {
    for (const user of TEST_USERS) {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 OR LOWER(username) = LOWER($2)', [
        user.email,
        user.username,
      ]);
      if (existing.rows.length > 0) {
        console.log(`⚠️  Zaten mevcut, atlandı: ${user.email}`);
        continue;
      }

      const password = sharedPassword || randomPassword();
      const passwordHash = await bcrypt.hash(password, 10);

      await pool.query(
        `INSERT INTO users (
            username, email, password_hash, email_verified, balance,
            week_baseline_equity, week_baseline_iso_key
          )
         VALUES (
            $1, $2, $3, TRUE, 100000.00, 100000.00,
            to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IYYY')
              || '-' ||
            to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IW')
          )`,
        [user.username, user.email, passwordHash]
      );
      created.push({ email: user.email, password });
    }

    if (created.length > 0) {
      console.log('\n📋 Oluşturulan test kullanıcıları (şifreler bir daha gösterilmeyecek):');
      for (const c of created) {
        console.log(`   ${c.email}  |  ${sharedPassword ? '(TEST_USER_PASSWORD)' : c.password}`);
      }
    } else {
      console.log('Yeni kullanıcı oluşturulmadı.');
    }
  } catch (error: any) {
    console.error('❌ Hata:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createTestUsers();
