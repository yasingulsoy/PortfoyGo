import { validateServerEnv, envList, isProduction } from './config/env';

// Zorunlu ortam değişkenleri yoksa (ör. JWT_SECRET) burada açık bir mesajla çıkılır
validateServerEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import authRoutes from './routes/auth';
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
import newsRoutes from './routes/news';
import marketRoutes from './routes/market';
import { globalApiLimiter } from './middleware/rateLimits';
import { errorHandler, notFoundHandler } from './utils/errors';
import { MarketCacheService } from './services/marketCache';
import { StopLossService } from './services/stopLoss';
import { CurrencyService } from './services/currency';
import { PortfolioService } from './services/portfolio';
import { LeaderboardService } from './services/leaderboard';

const app = express();
const PORT = parseInt(process.env.PORT || '5001', 10);

// Reverse proxy arkasında gerçek istemci IP'si için (rate limit). Sadece açıkça istenirse.
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const allowedOrigins = (envList('ALLOWED_ORIGINS').length > 0 ? envList('ALLOWED_ORIGINS') : ['http://localhost:3000']).filter(
  (origin) => {
    if (!/^https?:\/\//.test(origin)) {
      console.warn(`[cors] Geçersiz origin formatı yok sayıldı: ${origin}`);
      return false;
    }
    if (isProduction() && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin)) {
      return false;
    }
    return true;
  }
);

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
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

// Kısa istek logu (sadece production dışı)
if (!isProduction()) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });
}

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

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

app.use('/api', globalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/activity-logs', activityLogsRoutes);
app.use('/api/cryptos', cryptosRoutes);
app.use('/api/commodities', commoditiesRoutes);
app.use('/api/currencies', currenciesRoutes);
app.use('/api/stop-loss', stopLossRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/market', marketRoutes);

// Proxy /api önekini siliyorsa: /currencies, /commodities, /news için geriye dönük uyumluluk
app.use(['/commodities', '/currencies', '/news'], globalApiLimiter);
app.use('/commodities', commoditiesRoutes);
app.use('/currencies', currenciesRoutes);
app.use('/news', newsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Zamanlanmış işler — her iş için çakışma koruması (bir önceki çalışma bitmeden yenisi başlamaz)
// ---------------------------------------------------------------------------
const CRON_TZ = 'Europe/Istanbul';
const running = new Set<string>();

async function runGuarded(name: string, fn: () => Promise<unknown>): Promise<void> {
  if (running.has(name)) {
    if (!isProduction()) console.warn(`[cron] ${name} hâlâ çalışıyor; bu tur atlandı`);
    return;
  }
  running.add(name);
  try {
    await fn();
  } catch (error: any) {
    console.error(`[cron] ${name} hatası:`, error?.message || error);
  } finally {
    running.delete(name);
  }
}

const schedule = (expr: string, name: string, fn: () => Promise<unknown>) =>
  cron.schedule(expr, () => void runGuarded(name, fn), { timezone: CRON_TZ });

// Piyasa cache'i (hisse + kripto): 2 dakikada bir
schedule('*/2 * * * *', 'market-cache', () => MarketCacheService.refreshCache());

// Portföy fiyatları: 2 dakikada bir (cache yenilemesinden 1 dk sonra)
// (node-cron 3 "a-b/n" adımını yanlış çevirdiği için tek dakikalar açıkça listelenir)
const ODD_MINUTES = Array.from({ length: 30 }, (_, i) => i * 2 + 1).join(',');
schedule(`${ODD_MINUTES} * * * *`, 'portfolio-prices', () => PortfolioService.updateAllPortfolioPrices());

// Stop-loss kontrolü: her dakika
schedule('* * * * *', 'stop-loss', () => StopLossService.checkAndTriggerStopLosses());

// Döviz kurları: 12 saatte bir
schedule('0 */12 * * *', 'currency-rates', () => CurrencyService.fetchAndSaveToDb());

// Kümülatif sıralama (users.rank): 5 dakikada bir
schedule('*/5 * * * *', 'ranks', () => LeaderboardService.updateRanks());

// Haftalık liderlik referansı: Pazartesi 00:05 (İstanbul) + saatlik güvenlik kontrolü
schedule('5 0 * * 1', 'week-baseline', () => LeaderboardService.tryResetWeekBaselinesIfNeeded());
schedule('17 * * * *', 'week-baseline-check', () => LeaderboardService.tryResetWeekBaselinesIfNeeded());

// Açılışta ilk doldurma
void runGuarded('startup-currency', () => CurrencyService.fetchAndSaveToDb());
void runGuarded('market-cache', async () => {
  await MarketCacheService.refreshCache();
  await runGuarded('portfolio-prices', () => PortfolioService.updateAllPortfolioPrices());
});
void runGuarded('week-baseline', () => LeaderboardService.tryResetWeekBaselinesIfNeeded());
void runGuarded('ranks', () => LeaderboardService.updateRanks());

app.listen(PORT, () => {
  console.log(`[server] API ${PORT} portunda çalışıyor (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  console.log(`[server] CORS izinli origin sayısı: ${allowedOrigins.length}`);
});
