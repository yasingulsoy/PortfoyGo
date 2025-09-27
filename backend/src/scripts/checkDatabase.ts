import pool from '../config/database';

async function checkDatabase() {
  try {
    console.log('🔍 Veritabanı şeması kontrol ediliyor...');

    // Users tablosunun yapısını kontrol et
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position;
    `);

    console.log('📋 Users tablosu kolonları:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    // Tablo var mı kontrol et
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `);

    console.log(`\n📊 Users tablosu mevcut mu: ${tableExists.rows[0].exists}`);

    // Eğer tablo yoksa oluştur
    if (!tableExists.rows[0].exists) {
      console.log('🔧 Users tablosu oluşturuluyor...');
      await createUsersTable();
    }

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    await pool.end();
  }
}

async function createUsersTable() {
  const createTableSQL = `
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email_verified BOOLEAN DEFAULT FALSE,
      verification_code VARCHAR(6),
      verification_code_expires_at TIMESTAMP,
      balance DECIMAL(15,2) DEFAULT 100000.00,
      portfolio_value DECIMAL(15,2) DEFAULT 0.00,
      total_profit_loss DECIMAL(15,2) DEFAULT 0.00,
      rank INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP
    );
  `;

  await pool.query(createTableSQL);
  console.log('✅ Users tablosu oluşturuldu!');
}

checkDatabase();
