import bcrypt from 'bcryptjs';
import pool from '../config/database';

/**
 * Test kullanıcısı oluşturma scripti
 * 
 * Kullanım:
 * npm run create-user
 * 
 * Veya:
 * ts-node src/scripts/createUser.ts
 */

interface UserData {
  username: string;
  email: string;
  password: string;
  email_verified?: boolean;
  balance?: number;
}

async function createUser(userData: UserData) {
  try {
    console.log('🔧 Kullanıcı oluşturuluyor...\n');

    // Kullanıcı zaten var mı kontrol et
    const existingUser = await pool.query(
      'SELECT id, username, email FROM users WHERE username = $1 OR email = $2',
      [userData.username, userData.email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      console.log(`⚠️  Kullanıcı zaten mevcut:`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   ID: ${user.id}\n`);
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise<void>((resolve) => {
        readline.question('❓ Mevcut kullanıcıyı silip yeniden oluşturmak ister misiniz? (e/h): ', async (answer: string) => {
          readline.close();
          
          if (answer.toLowerCase() === 'e' || answer.toLowerCase() === 'evet') {
            await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
            console.log('🗑️  Mevcut kullanıcı silindi.\n');
            await createNewUser(userData);
          } else {
            console.log('❌ İşlem iptal edildi.');
          }
          resolve();
        });
      });
    } else {
      await createNewUser(userData);
    }
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    await pool.end();
  }
}

async function createNewUser(userData: UserData) {
  try {
    // Şifreyi hashle
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Kullanıcıyı oluştur
    const startBal = userData.balance ?? 100000.0;
    const result = await pool.query(
      `INSERT INTO users (
        username,
        email,
        password_hash,
        email_verified,
        balance,
        portfolio_value,
        total_profit_loss,
        rank,
        week_baseline_equity,
        week_baseline_iso_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $5,
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
      RETURNING id, username, email, email_verified, balance, created_at`,
      [
        userData.username,
        userData.email,
        passwordHash,
        userData.email_verified ?? true,
        startBal,
        0.0,
        0.0,
        0
      ]
    );

    const newUser = result.rows[0];
    
    console.log('✅ Kullanıcı başarıyla oluşturuldu!\n');
    console.log('📋 Kullanıcı Bilgileri:');
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Username: ${newUser.username}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Email Verified: ${newUser.email_verified}`);
    console.log(`   Balance: ₺${parseFloat(newUser.balance).toLocaleString('tr-TR')}`);
    console.log(`   Created At: ${newUser.created_at}\n`);
    console.log('🔑 Giriş Bilgileri:');
    console.log(`   Email: ${userData.email}`);
    console.log(`   Şifre: ${userData.password}\n`);
    console.log('💡 SQL Hash (eğer SQL ile eklemek isterseniz):');
    console.log(`   password_hash: ${passwordHash}\n`);
  } catch (error) {
    console.error('❌ Kullanıcı oluşturma hatası:', error);
    throw error;
  }
}

// Varsayılan kullanıcı bilgileri
const defaultUser: UserData = {
  username: 'trading_platform',
  email: 'trading@platform.com',
  password: 'trading123',
  email_verified: true,
  balance: 100000.00
};

// Komut satırından argümanları al
const args = process.argv.slice(2);

if (args.length >= 3) {
  // Özel kullanıcı bilgileri
  createUser({
    username: args[0],
    email: args[1],
    password: args[2],
    email_verified: args[3] === 'true' || args[3] === undefined,
    balance: args[4] ? parseFloat(args[4]) : 100000.00
  });
} else {
  // Varsayılan kullanıcı
  console.log('📝 Varsayılan kullanıcı oluşturuluyor...\n');
  console.log('💡 Özel kullanıcı için: npm run create-user <username> <email> <password> [verified] [balance]\n');
  createUser(defaultUser);
}

