import { envList, isProduction } from './config/env';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import devLoginRoutes from './routes/devLogin';
import emailRoutes from './routes/email';
import stocksRoutes from './routes/stocks';
import transactionsRoutes from './routes/transactions';
import portfolioRoutes from './routes/portfolio';
import leaderboardRoutes from './routes/leaderboard';
import adminRoutes from './routes/admin';
import badgesRoutes from './routes/badges';
import activityLogsRoutes from './routes/activityLogs';
import cryptosRoutes from './routes/cryptos';
import commoditiesRoutes from './routes/commodities';
import currenciesRoutes from './routes/currencies';
import stopLossRoutes from './routes/stopLoss';
import ordersRoutes from './routes/orders';
import newsRoutes from './routes/news';
import marketRoutes from './routes/market';
import priceHistoryRoutes from './routes/priceHistory';
import watchlistRoutes from './routes/watchlist';
import seasonsRoutes from './routes/seasons';
import leaguesRoutes from './routes/leagues';
import notificationsRoutes from './routes/notifications';
import arenaRoutes from './routes/arena';
import arenaCoachRoutes from './routes/arenaCoach';
import adminScenariosRoutes, { SERIES_IMPORT_PATH, seriesImportBodyParser } from './routes/adminScenarios';
import advisorRoutes from './routes/advisor';
import gameRoutes from './routes/game';
import idleRoutes from './routes/idle';
import healthRoutes from './routes/health';
import { globalApiLimiter } from './middleware/rateLimits';
import { errorHandler, notFoundHandler } from './utils/errors';
import { httpLogger, logger } from './utils/logger';

/**
 * Express uygulamasını kurar (middleware + route'lar). Sunucuyu BAŞLATMAZ, cron kurmaz.
 *
 * - src/index.ts: createApp() + cron'lar + app.listen (gerçek sunucu)
 * - test/*.test.ts: createApp() + supertest (cron yok, port açılmaz)
 *
 * NOT (route ekleyenler için): Yeni route/middleware kayıtları ARTIK BURAYA eklenir,
 * index.ts'e değil. Zamanlanmış işler (cron) ise index.ts'te kalır.
 */
export function getAllowedOrigins(): string[] {
  return (envList('ALLOWED_ORIGINS').length > 0 ? envList('ALLOWED_ORIGINS') : ['http://localhost:3000']).filter(
    (origin) => {
      if (!/^https?:\/\//.test(origin)) {
        logger.warn(`[cors] Geçersiz origin formatı yok sayıldı: ${origin}`);
        return false;
      }
      // CORS_ALLOW_LOCALHOST=1: production derlemesini yerelde çalıştırırken (docker compose) localhost'a izin ver
      if (isProduction() && process.env.CORS_ALLOW_LOCALHOST !== '1' && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin)) {
        return false;
      }
      return true;
    }
  );
}

export function createApp(): express.Express {
  const app = express();

  // Reverse proxy arkasında gerçek istemci IP'si için (rate limit). Sadece açıkça istenirse.
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }
  app.disable('x-powered-by');

  // İstek kimliği (X-Request-Id) + yapılandırılmış istek logu (pino-http). Bkz. utils/logger.ts
  app.use(httpLogger);

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------
  const allowedOrigins = getAllowedOrigins();

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Origin başlığı yoksa (same-origin, sunucudan sunucuya, mobil) izin ver
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['Content-Length', 'Content-Type', 'RateLimit', 'RateLimit-Policy', 'Retry-After', 'X-Request-Id'],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  };

  app.use(
    helmet({
      // Sadece JSON API: farklı origin'deki frontend'in fetch ile okuyabilmesi için
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Senaryo serisi içe aktarma (yönetici, büyük CSV): önce yönetici doğrulaması, sonra 10 MB'a kadar JSON.
  // Genel 50 KB ayrıştırıcıdan ÖNCE olmalı (gövde bir kez ayrıştırılır).
  app.use(SERIES_IMPORT_PATH, ...seriesImportBodyParser);
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  // Oturum çerezi (pg_session) için. CORS credentials: true + ALLOWED_ORIGINS listesi (asla '*').
  app.use(cookieParser());

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  const rootHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      success: true,
      message: 'Trading Platform API',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/', rootHandler);
  app.get('/api', rootHandler);
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'Trading Platform API çalışıyor', timestamp: new Date().toISOString() });
  });

  // Sağlık uçları: /healthz (canlılık), /readyz (DB hazır mı) — rate limit dışında
  app.use(healthRoutes);

  app.use('/api', globalApiLimiter);
  // Yalnızca yerel geliştirme veritabanında etkin (bkz. routes/devLogin.ts); aksi halde 404
  app.use('/api/auth/dev-login', devLoginRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/email', emailRoutes);
  app.use('/api/stocks', stocksRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  // Senaryo modu yönetimi: /api/admin/arena/series*, /api/admin/arena/scenarios* (kendi authenticateToken + isAdmin'i)
  app.use('/api/admin/arena', adminScenariosRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/badges', badgesRoutes);
  app.use('/api/activity-logs', activityLogsRoutes);
  app.use('/api/cryptos', cryptosRoutes);
  app.use('/api/commodities', commoditiesRoutes);
  app.use('/api/currencies', currenciesRoutes);
  app.use('/api/stop-loss', stopLossRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/news', newsRoutes);
  app.use('/api/market', marketRoutes);
  // Fiyat geçmişi / performans / sparkline (herkese açık)
  app.use('/api/market', priceHistoryRoutes);
  app.use('/api/watchlist', watchlistRoutes);
  app.use('/api/seasons', seasonsRoutes);
  app.use('/api/leagues', leaguesRoutes);
  // Bildirimler (+ SSE akışı: /api/notifications/stream)
  app.use('/api/notifications', notificationsRoutes);
  // Arena: hızlı al/sat oyun modu (+ SSE: /api/arena/rounds/:id/stream)
  app.use('/api/arena', arenaRoutes);
  // Arena koçu (GET /rounds/:id/coach) + herkese açık senaryo listesi (GET /scenarios)
  app.use('/api/arena', arenaCoachRoutes);
  // Portföy danışmanı: risk profili anketi + önerilen dağılım (MPT + Monte Carlo)
  app.use('/api/advisor', advisorRoutes);
  // Oyun ekonomisi: jeton, XP/seviye, reyting, görevler, ücretsiz çark, kozmetikler, sorumlu oyun
  app.use('/api/game', gameRoutes);
  // Yatırım İmparatorluğu: idle / tycoon oyunu (gerçek piyasa hareketine bağlı binalar)
  app.use('/api/idle', idleRoutes);

  // Proxy /api önekini siliyorsa: /currencies, /commodities, /news için geriye dönük uyumluluk
  app.use(['/commodities', '/currencies', '/news'], globalApiLimiter);
  app.use('/commodities', commoditiesRoutes);
  app.use('/currencies', currenciesRoutes);
  app.use('/news', newsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
