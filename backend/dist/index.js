"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const email_1 = __importDefault(require("./routes/email"));
const stocks_1 = __importDefault(require("./routes/stocks"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const admin_1 = __importDefault(require("./routes/admin"));
const badges_1 = __importDefault(require("./routes/badges"));
const activityLogs_1 = __importDefault(require("./routes/activityLogs"));
const cryptos_1 = __importDefault(require("./routes/cryptos"));
const commodities_1 = __importDefault(require("./routes/commodities"));
const currencies_1 = __importDefault(require("./routes/currencies"));
const stopLoss_1 = __importDefault(require("./routes/stopLoss"));
const news_1 = __importDefault(require("./routes/news"));
const marketCache_1 = require("./services/marketCache");
const stopLoss_2 = require("./services/stopLoss");
const currency_1 = require("./services/currency");
const portfolio_2 = require("./services/portfolio");
const node_cron_1 = __importDefault(require("node-cron"));
// Environment variables
dotenv_1.default.config();
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
const app = (0, express_1.default)();
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
const corsOptions = {
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
        }
        else {
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
app.use((0, cors_1.default)(corsOptions));
// Preflight request'ler için ek güvence - CORS middleware zaten handle ediyor ama ekstra kontrol
app.options('*', (0, cors_1.default)(corsOptions));
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
    res.send = function (body) {
        const statusCode = res.statusCode;
        const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' :
            statusCode >= 400 && statusCode < 500 ? '⚠️' :
                statusCode >= 500 ? '❌' : 'ℹ️';
        console.log(`📤 [${timestamp}] ${method} ${url} - ${statusEmoji} ${statusCode}`);
        return originalSend.call(this, body);
    };
    next();
});
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Root endpoint - API bilgileri (hem / hem de /api için)
const rootHandler = (_req, res) => {
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
            currencies: '/api/currencies',
            news: '/api/news'
        },
        timestamp: new Date().toISOString()
    });
};
app.get('/', rootHandler);
app.get('/api', rootHandler);
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/email', email_1.default);
app.use('/api/stocks', stocks_1.default);
app.use('/api/transactions', transactions_1.default);
app.use('/api/portfolio', portfolio_1.default);
app.use('/api/leaderboard', leaderboard_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/badges', badges_1.default);
app.use('/api/activity-logs', activityLogs_1.default);
app.use('/api/cryptos', cryptos_1.default);
app.use('/api/commodities', commodities_1.default);
app.use('/api/currencies', currencies_1.default);
app.use('/api/stop-loss', stopLoss_1.default);
app.use('/api/news', news_1.default);
// Proxy /api prefix'i siliyorsa: /currencies, /commodities, /news için fallback
app.use('/commodities', commodities_1.default);
app.use('/currencies', currencies_1.default);
app.use('/news', news_1.default);
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
app.use((err, req, res, next) => {
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
marketCache_1.MarketCacheService.refreshCache(true)
    .then(() => {
    // Cache dolduktan sonra portföy fiyatlarını güncelle
    return portfolio_2.PortfolioService.updateAllPortfolioPrices();
})
    .catch(err => {
    console.error('Initial cache/portfolio refresh error:', err);
});
// Döviz kurlarını başlangıçta çek (DB boşsa doldurur)
currency_1.CurrencyService.fetchAndSaveToDb().catch(err => {
    console.error('Initial currency fetch error:', err);
});
// Her 2 dakikada bir cache'i güncelle (10 hisse - hızlı güncelleme)
// Şu anlık sadece 10 hisseye odaklanıyoruz, bu yüzden daha sık güncelleyebiliriz
node_cron_1.default.schedule('*/2 * * * *', async () => {
    console.log('⏰ Scheduled cache refresh başlatılıyor (2 dakika)...');
    try {
        // Güncelleme (10 hisse)
        await marketCache_1.MarketCacheService.refreshCache(false);
        console.log('✅ Scheduled cache refresh tamamlandı');
    }
    catch (error) {
        console.error('❌ Scheduled cache refresh hatası:', error);
    }
});
// Her 30 dakikada bir tam cache refresh (10 hisse)
node_cron_1.default.schedule('*/30 * * * *', async () => {
    console.log('⏰ Full cache refresh başlatılıyor (30 dakika)...');
    try {
        // Tam güncelleme (10 hisse)
        await marketCache_1.MarketCacheService.refreshCache(true);
        console.log('✅ Full cache refresh tamamlandı');
    }
    catch (error) {
        console.error('❌ Full cache refresh hatası:', error);
    }
});
// Her 1 dakikada bir stop-loss emirlerini kontrol et
node_cron_1.default.schedule('* * * * *', async () => {
    try {
        await stopLoss_2.StopLossService.checkAndTriggerStopLosses();
    }
    catch (error) {
        console.error('❌ Stop-loss kontrolü hatası:', error);
    }
});
// Her 2 dakikada bir tüm portföy fiyatlarını cache'den güncelle
node_cron_1.default.schedule('*/2 * * * *', async () => {
    console.log('⏰ Portföy fiyatları güncelleniyor...');
    try {
        await portfolio_2.PortfolioService.updateAllPortfolioPrices();
    }
    catch (error) {
        console.error('❌ Portföy fiyat güncelleme hatası:', error);
    }
});
// Her 12 saatte bir döviz kurlarını güncelle
node_cron_1.default.schedule('0 */12 * * *', async () => {
    console.log('⏰ Döviz kurları güncelleniyor (12 saat)...');
    try {
        await currency_1.CurrencyService.fetchAndSaveToDb();
        console.log('✅ Döviz kurları güncellendi (12 saatlik)');
    }
    catch (error) {
        console.error('❌ Döviz kurları güncelleme hatası:', error);
    }
});
// Cache durumunu göster
setInterval(async () => {
    const status = await marketCache_1.MarketCacheService.getCacheStatus();
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
//# sourceMappingURL=index.js.map