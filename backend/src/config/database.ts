import './env';
import { Pool, PoolConfig } from 'pg';

/**
 * PostgreSQL bağlantı havuzu.
 *
 * SSL davranışı:
 *  - DB_SSL=true  → SSL açık. Sertifika doğrulaması varsayılan olarak AÇIK
 *                   (DB_SSL_REJECT_UNAUTHORIZED=false ile kapatılabilir).
 *                   İsteğe bağlı DB_SSL_CA ile özel CA (PEM) verilebilir.
 *                   Bu durumda DATABASE_URL içindeki sslmode parametresi yerine
 *                   bu ayarlar geçerli olur.
 *  - DB_SSL=false → SSL config'ten kapatılır; ancak DATABASE_URL içinde
 *                   sslmode belirtilmişse o değer (pg tarafından) geçerli olur.
 *  - Tanımsız     → DATABASE_URL olduğu gibi kullanılır (sslmode varsa uygulanır).
 */

const sslEnv = process.env.DB_SSL?.trim().toLowerCase();
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== 'false';

function buildSslConfig(): PoolConfig['ssl'] | undefined {
  if (sslEnv === 'true') {
    const ca = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
    return { rejectUnauthorized, ...(ca ? { ca } : {}) };
  }
  if (sslEnv === 'false') {
    return false;
  }
  return undefined;
}

const ssl = buildSslConfig();

const poolConfig: PoolConfig = {
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
};

if (process.env.DATABASE_URL) {
  let connectionString = process.env.DATABASE_URL;
  if (sslEnv === 'true') {
    // Açık SSL yapılandırması verildiğinde URL'deki sslmode'un onu ezmesini engelle
    // (SSL kapatılmıyor; yalnızca env'deki daha kesin ayarlar uygulanıyor).
    connectionString = connectionString
      .replace(/([?&])sslmode=[^&]*&?/gi, '$1')
      .replace(/([?&])ssl=[^&]*&?/gi, '$1')
      .replace(/[?&]$/, '');
  }
  poolConfig.connectionString = connectionString;
} else {
  poolConfig.host = process.env.DB_HOST || 'localhost';
  poolConfig.port = parseInt(process.env.DB_PORT || '5432', 10);
  poolConfig.database = process.env.DB_NAME || 'trading_platform';
  poolConfig.user = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD;
  if (dbPassword !== undefined && dbPassword.trim() !== '') {
    poolConfig.password = dbPassword;
  }
}

if (ssl !== undefined) {
  poolConfig.ssl = ssl;
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Boştaki bir istemcide oluşan beklenmedik hata (ör. bağlantı koptu)
  console.error('[db] Idle client error:', err.message, (err as any).code || '');
});

export default pool;
