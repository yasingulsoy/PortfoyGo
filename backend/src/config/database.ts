import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Connection string oluştur
function getConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Ayrı ayrı değişkenlerden oluştur
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'trading_platform';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  // Şifre varsa ekle, yoksa boş bırak (iki nokta üst üste olmamalı)
  if (password && password.trim() !== '') {
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  } else {
    // Şifre yoksa iki nokta üst üste olmadan
    return `postgresql://${user}@${host}:${port}/${database}`;
  }
}

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default pool;
