import pool from '../config/database';

async function addAdminColumns() {
  try {
    console.log('🔧 Admin kolonları ekleniyor...\n');

    // is_admin kolonu ekle
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    `);
    console.log('✅ is_admin kolonu eklendi');

    // is_banned kolonu ekle
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
    `);
    console.log('✅ is_banned kolonu eklendi');

    console.log('\n✅ Tüm admin kolonları başarıyla eklendi!');
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addAdminColumns();

