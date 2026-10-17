import { GOLD_API_LIVE_CODES } from '../providers/adapters/goldApiSymbols';

/**
 * Yerel geliştirme ortam değişkenleri (npm run dev:local ve dev:worker:local ortak kullanır).
 *
 * backend/.env dosyasındaki değerler (canlı DATABASE_URL, API anahtarları, SMTP, Redis, Sentry) aşağıdaki
 * açık değerlerle EZİLİR: dotenv, ortamda zaten tanımlı (boş bile olsa) değişkenlerin üzerine yazmaz.
 *
 * Not: Bu dosya saf kalmalı (veritabanı / ağ modülü içe aktarmaz); yerel veritabanı süreci de kullanır.
 */

/** Yerel canlı fiyat ayarı (LOCAL_LIVE_PRICES); bkz. localLivePrices */
export interface LocalLivePrices {
  /** LOCAL_LIVE_PRICES=1 */
  enabled: boolean;
  /** Kripto: CoinGecko genel (anahtarsız) uç, 2 dk'da bir */
  crypto: boolean;
  /** Döviz: TCMB günlük kurları (LOCAL_FX_PROVIDER=frankfurter ile ECB), 12 sa'te bir + açılışta */
  fx: boolean;
  fxProvider: 'tcmb' | 'frankfurter';
  /** Değerli metaller: gold-api.com (anahtarsız); petrol vb. son bilinen fiyatta kalır */
  metals: boolean;
  /** Hisse: yalnızca LOCAL_FINNHUB_API_KEY verilirse (Finnhub ücretsiz katmanı da anahtar ister) */
  stocks: boolean;
  /** Canlı kaynaktan beslenen emtia kodları: yerel fiyat simülasyonu (tickMarket) bunlara dokunmaz */
  liveCommodityCodes: readonly string[];
}

const isOn = (v: string | undefined) => ['1', 'true', 'yes', 'on'].includes((v || '').trim().toLowerCase());

/**
 * LOCAL_LIVE_PRICES=1 → yerelde YALNIZCA ücretsiz ve anahtarsız kaynaklardan canlı fiyat: kripto (CoinGecko genel uç),
 * döviz (TCMB / Frankfurter günlük), değerli metaller (gold-api.com). Hisse yalnızca LOCAL_FINNHUB_API_KEY ile.
 * Varsayılan KAPALI: yerel geliştirme hiçbir kota harcamaz, fiyatlar tohum + simülasyondan gelir.
 * backend/.env'deki gerçek anahtarlar hiçbir durumda okunmaz/kullanılmaz.
 */
export function localLivePrices(env: NodeJS.ProcessEnv = process.env): LocalLivePrices {
  const enabled = isOn(env.LOCAL_LIVE_PRICES);
  const finnhubKey = (env.LOCAL_FINNHUB_API_KEY || '').trim();
  return {
    enabled,
    crypto: enabled,
    fx: enabled,
    fxProvider: (env.LOCAL_FX_PROVIDER || '').trim().toLowerCase() === 'frankfurter' ? 'frankfurter' : 'tcmb',
    metals: enabled,
    stocks: enabled && finnhubKey.length > 0,
    liveCommodityCodes: enabled ? GOLD_API_LIVE_CODES : [],
  };
}

export function localDevEnv(db: { url: string; port: number }, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const live = localLivePrices(process.env);
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
    // --- Dış servisler varsayılan kapalı: piyasa verisi tohumlanmış cache'ten gelir ---
    // LOCAL_LIVE_PRICES=1 → piyasa cache işi açılır ama YALNIZCA anahtarsız kaynaklarla (aşağıdaki seçiciler)
    DISABLE_MARKET_REFRESH: live.enabled ? '0' : '1',
    // SMTP yok: doğrulama/sıfırlama kodları konsola yazılır
    EMAIL_DEV_LOG: '1',
    ENABLE_BACKGROUND_STOCK_REFRESH: 'false',
    // Gerçek anahtarlar (backend/.env) hiçbir zaman kullanılmaz; Finnhub yalnızca LOCAL_FINNHUB_API_KEY ile
    FINNHUB_API_KEY: live.stocks ? (process.env.LOCAL_FINNHUB_API_KEY || '').trim() : '',
    FINNHUB_API_KEYS: '',
    COINGECKO_API_KEY: '',
    NEXT_PUBLIC_COINGECKO_API_KEY: '',
    DOVIZ: '',
    EMTIA: '',
    DEFAULT_USD_TRY: '',
    // --- Veri sağlayıcı seçicileri (backend/.env'deki seçimler de ezilir) ---
    STOCK_PROVIDER: 'finnhub',
    // CoinGecko anahtarsız genel uç (COINGECKO_API_KEY boş); yalnızca piyasa cache işi açıkken çağrılır
    CRYPTO_PROVIDER: 'coingecko',
    // Kapalıyken nosyapi (anahtar boş → yalnızca veritabanındaki tohum kurlar); açıkken TCMB / Frankfurter
    FX_PROVIDER: live.fx ? live.fxProvider : 'nosyapi',
    // Emtia: son bilinen fiyatlar (price_history; yerel simülasyon besler) — açıkken metaller gold-api.com'dan canlı
    COMMODITY_PROVIDER: live.metals ? 'goldapi' : 'pricehistory',
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
