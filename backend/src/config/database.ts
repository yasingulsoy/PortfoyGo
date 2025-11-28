import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const shouldUseSSL = process.env.DB_SSL === 'true';

// Database configuration logging
console.log('\n🗄️  DATABASE CONFIGURATION');
console.log('═══════════════════════════════════════════════════════');
console.log('DB_SSL:', shouldUseSSL ? '✅ true (SSL enabled)' : '❌ false (SSL disabled)');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');

// Pool yapılandırması - connectionString yerine ayrı parametreler kullan
const poolConfig: any = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'trading_platform',
  user: process.env.DB_USER || 'postgres',
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
};

// Şifre varsa ekle (undefined, null veya boş string değilse)
const dbPassword = process.env.DB_PASSWORD;
if (dbPassword !== undefined && dbPassword !== null && dbPassword.trim() !== '') {
  poolConfig.password = dbPassword;
}

// Eğer DATABASE_URL varsa onu kullan
if (process.env.DATABASE_URL) {
  console.log('Using DATABASE_URL connection string');
  
  // DATABASE_URL'den SSL parametrelerini kaldır (database SSL desteklemiyorsa)
  let connectionString = process.env.DATABASE_URL;
  
  // SSL parametrelerini kaldır
  connectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');
  connectionString = connectionString.replace(/[?&]ssl=[^&]*/gi, '');
  
  poolConfig.connectionString = connectionString;
  
  // connectionString kullanıldığında diğer parametreleri kaldır
  delete poolConfig.host;
  delete poolConfig.port;
  delete poolConfig.database;
  delete poolConfig.user;
  delete poolConfig.password;
  
  // SSL'i kapat (database SSL desteklemiyor)
  poolConfig.ssl = false;
  console.log('SSL Configuration: Disabled (database does not support SSL)');
  console.log('Connection String (sanitized):', connectionString.replace(/:[^:@]+@/, ':****@'));
} else {
  console.log('Using individual database parameters');
  console.log('Host:', poolConfig.host);
  console.log('Port:', poolConfig.port);
  console.log('Database:', poolConfig.database);
  console.log('User:', poolConfig.user);
  console.log('Password:', poolConfig.password ? '✅ Set' : '❌ Not set');
  console.log('SSL Configuration:', poolConfig.ssl ? 'Enabled' : 'Disabled');
}

const pool = new Pool(poolConfig);

// Database connection event listeners
pool.on('connect', (client) => {
  console.log('✅ Database client connected');
});

pool.on('error', (err, client) => {
  console.error('\n❌ DATABASE CONNECTION ERROR');
  console.error('═══════════════════════════════════════════════════════');
  console.error('Error:', err.message);
  console.error('Code:', (err as any).code);
  console.error('Stack:', err.stack);
  console.error('═══════════════════════════════════════════════════════\n');
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('\n❌ DATABASE CONNECTION TEST FAILED');
    console.error('═══════════════════════════════════════════════════════');
    console.error('Error:', err.message);
    console.error('Code:', (err as any).code);
    console.error('Detail:', (err as any).detail);
    console.error('Hint:', (err as any).hint);
    console.error('═══════════════════════════════════════════════════════\n');
  } else {
    console.log('✅ Database connection test successful');
    console.log('Database time:', res.rows[0].now);
  }
  console.log('═══════════════════════════════════════════════════════\n');
});

export default pool;
