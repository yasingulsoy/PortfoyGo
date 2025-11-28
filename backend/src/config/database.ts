import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const shouldUseSSL = process.env.DB_SSL === 'true';

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
  poolConfig.connectionString = process.env.DATABASE_URL;
  // connectionString kullanıldığında diğer parametreleri kaldır
  delete poolConfig.host;
  delete poolConfig.port;
  delete poolConfig.database;
  delete poolConfig.user;
  delete poolConfig.password;
  poolConfig.ssl = shouldUseSSL ? { rejectUnauthorized: false } : false;
}

const pool = new Pool(poolConfig);

export default pool;
