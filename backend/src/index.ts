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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası'
  });
});

// Cache'i başlangıçta doldur
MarketCacheService.refreshCache().catch(err => {
  console.error('Initial cache refresh error:', err);
});

// Her 2 saatte bir cache'i güncelle (cron: 0 */2 * * *)
cron.schedule('0 */2 * * *', async () => {
  console.log('⏰ Scheduled cache refresh başlatılıyor...');
  try {
    await MarketCacheService.refreshCache();
    console.log('✅ Scheduled cache refresh tamamlandı');
  } catch (error) {
    console.error('❌ Scheduled cache refresh hatası:', error);
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
  console.log(`🔄 Cache otomatik güncelleme: Her 2 saatte bir`);
});
