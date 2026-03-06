import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { MarketCacheService } from './services/marketCache';
import { StopLossService } from './services/stopLoss';
import { CurrencyService } from './services/currency';
import { PortfolioService } from './services/portfolio';
import cron from 'node-cron';

// Environment variables
dotenv.config();

// Environment variable logları (production'da da görmek için)
console.log('═══════════════════════════════════════════════════════');
console.log('🔧 ENVIRONMENT VARIABLES');
console.log('═══════════════════════════════════════════════════════');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT || 5001);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set (hidden)' : '❌ Not set');
console.log('DB_SSL:', process.env.DB_SSL || 'false');
console.log('DB_HOST:', process.env.DB_HOST || 'localhost');
console.log('DB_PORT:', process.env.DB_PORT || '5432');
console.log('DB_NAME:', process.env.DB_NAME || 'trading_platform');
console.log('DB_USER:', process.env.DB_USER || 'postgres');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set (hidden)' : '❌ Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set (hidden)' : '❌ Not set');
console.log('ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS || 'http://localhost:3000');
console.log('═══════════════════════════════════════════════════════');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware - CORS yapılandırması
const allowedOriginsRaw = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
console.log('📝 Raw ALLOWED_ORIGINS:', allowedOriginsRaw);

// Her satırı ayrı ayrı işle ve temizle - yeni satırları da temizle
const allowedOrigins = allowedOriginsRaw
  .split(/[,\n\r]+/) // Virgül, yeni satır veya carriage return ile ayır
  .map(origin => origin.trim()) // Boşlukları temizle
  .filter(origin => {
    // Boş string'leri filtrele
    if (!origin || origin.length === 0) {
      return false;
    }
    
    // Geçerli URL formatını kontrol et
    const isValid = origin.startsWith('http://') || origin.startsWith('https://');
    if (!isValid) {
      console.warn(`⚠️  Geçersiz origin formatı: ${origin}`);
      return false;
    }
    
    // Production'da localhost'u filtrele (güvenlik için)
    if (process.env.NODE_ENV === 'production') {
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0');
      if (isLocalhost) {
        console.warn(`⚠️  Production'da localhost origin filtrelendi: ${origin}`);
        return false;
      }
    }
    
    return true;
  });

// Debug için log (production'da da görmek için)
console.log('🌐 CORS Allowed Origins (parsed):', JSON.stringify(allowedOrigins, null, 2));
console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
console.log('📊 Total allowed origins:', allowedOrigins.length);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Origin yoksa (same-origin request veya mobile app) izin ver
    if (!origin) {
      console.log('✅ CORS: No origin header (same-origin or mobile app) - allowing');
      return callback(null, true);
    }
    
    console.log(`🔍 CORS check - Request origin: ${origin}`);
    console.log(`📋 Checking against ${allowedOrigins.length} allowed origins`);
    
    // Allowed origins listesinde var mı kontrol et
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Origin ${origin} is allowed`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      console.log('📋 Allowed origins:', allowedOrigins);
      console.log('🔍 Exact match check:', allowedOrigins.map(o => `"${o}"`).join(', '));
      // CORS hatası için false döndür (null yerine)
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// CORS middleware'i tüm route'lardan önce uygula
app.use(cors(corsOptions));

// Preflight request'ler için ek güvence - CORS middleware zaten handle ediyor ama ekstra kontrol
app.options('*', cors(corsOptions));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const origin = req.headers.origin || 'No Origin';
  const userAgent = req.headers['user-agent'] || 'No User-Agent';
  
  console.log(`\n📥 [${timestamp}] ${method} ${url}`);
  console.log(`   Origin: ${origin}`);
  console.log(`   User-Agent: ${userAgent.substring(0, 80)}...`);
  
  // Response tamamlandığında log
  const originalSend = res.send;
  res.send = function(body) {
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' : 
                       statusCode >= 400 && statusCode < 500 ? '⚠️' : 
                       statusCode >= 500 ? '❌' : 'ℹ️';
    console.log(`📤 [${timestamp}] ${method} ${url} - ${statusEmoji} ${statusCode}`);
    return originalSend.call(this, body);
  };
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint - API bilgileri (hem / hem de /api için)
const rootHandler = (_req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    message: 'Trading Platform API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      portfolio: '/api/portfolio',
      stocks: '/api/stocks',
      transactions: '/api/transactions',
      leaderboard: '/api/leaderboard',
      cryptos: '/api/cryptos',
      commodities: '/api/commodities',
      currencies: '/api/currencies'
    },
    timestamp: new Date().toISOString()
  });
};

app.get('/', rootHandler);
app.get('/api', rootHandler);

// Routes
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Trading Platform API çalışıyor',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  const timestamp = new Date().toISOString();
  console.warn('\n⚠️  404 - ENDPOINT NOT FOUND');
  console.warn('═══════════════════════════════════════════════════════');
  console.warn(`Timestamp: ${timestamp}`);
  console.warn(`Method: ${req.method}`);
  console.warn(`URL: ${req.url}`);
  console.warn(`Path: ${req.path}`);
  console.warn(`Original URL: ${req.originalUrl}`);
  console.warn(`Base URL: ${req.baseUrl}`);
  console.warn(`Headers:`, {
    host: req.headers.host,
    origin: req.headers.origin,
    'user-agent': req.headers['user-agent']?.substring(0, 80)
  });
  console.warn('═══════════════════════════════════════════════════════\n');
  
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/portfolio',
      'GET /api/stocks',
      'GET /api/cryptos',
      'GET /api/commodities',
      'GET /api/currencies',
      'GET /api/leaderboard'
    ]
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const timestamp = new Date().toISOString();
  console.error('\n❌ ERROR HANDLER');
  console.error('═══════════════════════════════════════════════════════');
  console.error(`Timestamp: ${timestamp}`);
  console.error(`Method: ${req.method}`);
  console.error(`URL: ${req.url}`);
  console.error(`Origin: ${req.headers.origin || 'No Origin'}`);
  console.error(`Error Message: ${err.message || 'Unknown error'}`);
  console.error(`Error Stack:`, err.stack);
  console.error('═══════════════════════════════════════════════════════\n');
  
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Cache'i başlangıçta doldur (ilk yükleme - daha fazla hisse çek)
MarketCacheService.refreshCache(true)
  .then(() => {
    // Cache dolduktan sonra portföy fiyatlarını güncelle
    return PortfolioService.updateAllPortfolioPrices();
  })
  .catch(err => {
    console.error('Initial cache/portfolio refresh error:', err);
  });

// Döviz kurlarını başlangıçta çek (DB boşsa doldurur)
CurrencyService.fetchAndSaveToDb().catch(err => {
  console.error('Initial currency fetch error:', err);
});

// Her 2 dakikada bir cache'i güncelle (10 hisse - hızlı güncelleme)
// Şu anlık sadece 10 hisseye odaklanıyoruz, bu yüzden daha sık güncelleyebiliriz
cron.schedule('*/2 * * * *', async () => {
  console.log('⏰ Scheduled cache refresh başlatılıyor (2 dakika)...');
  try {
    // Güncelleme (10 hisse)
    await MarketCacheService.refreshCache(false);
    console.log('✅ Scheduled cache refresh tamamlandı');
  } catch (error) {
    console.error('❌ Scheduled cache refresh hatası:', error);
  }
});

// Her 30 dakikada bir tam cache refresh (10 hisse)
cron.schedule('*/30 * * * *', async () => {
  console.log('⏰ Full cache refresh başlatılıyor (30 dakika)...');
  try {
    // Tam güncelleme (10 hisse)
    await MarketCacheService.refreshCache(true);
    console.log('✅ Full cache refresh tamamlandı');
  } catch (error) {
    console.error('❌ Full cache refresh hatası:', error);
  }
});

// Her 1 dakikada bir stop-loss emirlerini kontrol et
cron.schedule('* * * * *', async () => {
  try {
    await StopLossService.checkAndTriggerStopLosses();
  } catch (error) {
    console.error('❌ Stop-loss kontrolü hatası:', error);
  }
});

// Her 2 dakikada bir tüm portföy fiyatlarını cache'den güncelle
cron.schedule('*/2 * * * *', async () => {
  console.log('⏰ Portföy fiyatları güncelleniyor...');
  try {
    await PortfolioService.updateAllPortfolioPrices();
  } catch (error) {
    console.error('❌ Portföy fiyat güncelleme hatası:', error);
  }
});

// Her 12 saatte bir döviz kurlarını güncelle
cron.schedule('0 */12 * * *', async () => {
  console.log('⏰ Döviz kurları güncelleniyor (12 saat)...');
  try {
    await CurrencyService.fetchAndSaveToDb();
    console.log('✅ Döviz kurları güncellendi (12 saatlik)');
  } catch (error) {
    console.error('❌ Döviz kurları güncelleme hatası:', error);
  }
});

// Cache durumunu göster
setInterval(async () => {
  const status = await MarketCacheService.getCacheStatus();
  console.log('📊 Cache Durumu:', {
    stocks: status.stocks,
    cryptos: status.cryptos,
    oldest: status.oldestCache,
    newest: status.newestCache
  });
}, 3600000); // Her saatte bir

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Trading Platform API ready!`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔄 Cache otomatik güncelleme: Her 2 dakikada bir (10 hisse)`);
});
