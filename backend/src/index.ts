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
import { MarketCacheService } from './services/marketCache';
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
// Her satırı ayrı ayrı işle ve temizle
const allowedOrigins = allowedOriginsRaw
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => {
    // Geçerli URL formatını kontrol et
    const isValid = origin.startsWith('http://') || origin.startsWith('https://');
    if (!isValid && origin) {
      console.warn(`⚠️  Geçersiz origin formatı: ${origin}`);
    }
    return isValid && origin.length > 0;
  });

// Debug için log (production'da da görmek için)
console.log('🌐 CORS Allowed Origins:', allowedOrigins);
console.log('🔧 NODE_ENV:', process.env.NODE_ENV);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Origin yoksa (same-origin request veya mobile app) izin ver
    if (!origin) {
      return callback(null, true);
    }
    
    // Allowed origins listesinde var mı kontrol et
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      console.log('📋 Allowed origins:', allowedOrigins);
      callback(new Error('CORS policy tarafından izin verilmedi'));
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

app.use(cors(corsOptions));
// Tüm OPTIONS request'leri için CORS header'larını gönder
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

// Root endpoint (plain OK text)
app.get('/', (_req, res) => {
  res.type('text/plain').send('OK');
});

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
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı'
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
MarketCacheService.refreshCache(true).catch(err => {
  console.error('Initial cache refresh error:', err);
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
