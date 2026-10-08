import { defineConfig } from 'vitest/config';

/**
 * Backend entegrasyon testleri.
 * test/globalSetup.ts bellek içi bir PGlite (gerçek PostgreSQL 18, WASM) başlatır, wire protokol
 * soketi açar, tüm migration'ları uygular ve DATABASE_URL'i ona yönlendirir. Harici veritabanı,
 * ağ erişimi veya API anahtarı gerekmez; backend/.env içindeki değerler aşağıda ezilir.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    environment: 'node',
    // Testler tek (paylaşılan) veritabanını kullanır; dosyalar sırayla çalışsın
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef0123456789abcdef',
      DB_SSL: 'false',
      DB_POOL_MAX: '10',
      DISABLE_MARKET_REFRESH: '1',
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
      ALLOWED_ORIGINS: 'http://localhost:3000',
      COOKIE_SECURE: 'false',
      COOKIE_DOMAIN: '',
    },
  },
});
