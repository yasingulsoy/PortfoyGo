/**
 * Yerel geliştirme ortam değişkenleri (npm run dev:local ve dev:worker:local ortak kullanır).
 *
 * backend/.env dosyasındaki değerler (canlı DATABASE_URL, API anahtarları, SMTP, Redis, Sentry) aşağıdaki
 * açık değerlerle EZİLİR: dotenv, ortamda zaten tanımlı (boş bile olsa) değişkenlerin üzerine yazmaz.
 */
export function localDevEnv(db: { url: string; port: number }, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'development',
    // concurrently altında stdout bir TTY değildir; okunabilir (pino-pretty) loglar için
    LOG_PRETTY: process.env.LOG_PRETTY || '1',
    // Genel PORT değişkeni (ör. frontend araçlarının ayarladığı 3000) devralınmasın diye ayrı değişken
    PORT: process.env.API_PORT || '5001',
    // --- Veritabanı: SADECE yerel PGlite ---
    DATABASE_URL: db.url,
    DB_SSL: 'false',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(db.port),
    JOB_LOCK_DATABASE_URL: '',
    // --- Kimlik doğrulama: sadece geliştirme için sabit anahtar ---
    JWT_SECRET: process.env.LOCAL_JWT_SECRET || 'dev-only-local-jwt-secret-do-not-use-in-production-000000',
    COOKIE_SECURE: 'false',
    COOKIE_DOMAIN: '',
    // 3002: 3000 portu başka bir uygulamaca kullanılıyorsa site geçici olarak 3002'de çalıştırılabilir
    // Çok sekme, canlı akışlar ve E2E aynı IP'den: genel sınır (canlıda 300/dk) yerelde yüksek
    API_RATE_LIMIT_PER_MIN: process.env.API_RATE_LIMIT_PER_MIN || '5000',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002',
    // --- Dış servisler kapalı: piyasa verisi tohumlanmış cache'ten gelir ---
    DISABLE_MARKET_REFRESH: '1',
    // SMTP yok: doğrulama/sıfırlama kodları konsola yazılır
    EMAIL_DEV_LOG: '1',
    ENABLE_BACKGROUND_STOCK_REFRESH: 'false',
    FINNHUB_API_KEY: '',
    FINNHUB_API_KEYS: '',
    COINGECKO_API_KEY: '',
    NEXT_PUBLIC_COINGECKO_API_KEY: '',
    DOVIZ: '',
    EMTIA: '',
    DEFAULT_USD_TRY: '',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: '',
    // --- Ölçeklenme / gözlemlenebilirlik: yerelde varsayılan kapalı (LOCAL_REDIS_URL ile Redis denenebilir) ---
    REDIS_URL: process.env.LOCAL_REDIS_URL || '',
    SENTRY_DSN: '',
    // RUN_JOBS tanımsız → API işleri çalıştırır (bugünkü davranış); LOCAL_RUN_JOBS=0 ile kapatılabilir
    RUN_JOBS: process.env.LOCAL_RUN_JOBS || '',
    METRICS_TOKEN: process.env.LOCAL_METRICS_TOKEN || '',
    ...extra,
  };
}
