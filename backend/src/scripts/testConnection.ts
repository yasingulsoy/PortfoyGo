import pool from '../config/database';

async function testConnection() {
  try {
    console.log('Veritabanı bağlantısı test ediliyor...');
    console.log('Host:', process.env.DB_HOST || 'localhost');
    console.log('Port:', process.env.DB_PORT || '5432');
    console.log('Database:', process.env.DB_NAME || 'trading_platform');
    console.log('User:', process.env.DB_USER || 'postgres');
    console.log('Password:', process.env.DB_PASSWORD ? '***' : '(ayarlanmamış)');
    
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('\n✅ Veritabanı bağlantısı başarılı!');
    console.log('PostgreSQL Versiyonu:', result.rows[0].pg_version);
    console.log('Sunucu Zamanı:', result.rows[0].current_time);
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Veritabanı bağlantı hatası:');
    console.error('Hata Kodu:', error.code);
    console.error('Hata Mesajı:', error.message);
    
    if (error.code === '28P01') {
      console.error('\n💡 Çözüm:');
      console.error('PostgreSQL kimlik doğrulama hatası. .env dosyasındaki DB_PASSWORD değerini kontrol edin.');
      console.error('PostgreSQL şifresini değiştirmek için:');
      console.error('1. PostgreSQL\'e bağlanın (şifresiz veya mevcut şifre ile)');
      console.error('2. ALTER USER postgres WITH PASSWORD \'yeni_sifre\'; komutunu çalıştırın');
      console.error('3. .env dosyasındaki DB_PASSWORD değerini güncelleyin');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Çözüm:');
      console.error('PostgreSQL sunucusuna bağlanılamadı. PostgreSQL servisinin çalıştığından emin olun.');
    }
    
    process.exit(1);
  }
}

testConnection();

