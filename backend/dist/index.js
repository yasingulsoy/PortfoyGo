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
const marketCache_1 = require("./services/marketCache");
const node_cron_1 = __importDefault(require("node-cron"));
// Environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://yourdomain.com']
        : ['http://localhost:3000'],
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
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
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Sunucu hatası'
    });
});
// Cache'i başlangıçta doldur
marketCache_1.MarketCacheService.refreshCache().catch(err => {
    console.error('Initial cache refresh error:', err);
});
// Her 2 saatte bir cache'i güncelle (cron: 0 */2 * * *)
node_cron_1.default.schedule('0 */2 * * *', async () => {
    console.log('⏰ Scheduled cache refresh başlatılıyor...');
    try {
        await marketCache_1.MarketCacheService.refreshCache();
        console.log('✅ Scheduled cache refresh tamamlandı');
    }
    catch (error) {
        console.error('❌ Scheduled cache refresh hatası:', error);
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
    console.log(`🔄 Cache otomatik güncelleme: Her 2 saatte bir`);
});
//# sourceMappingURL=index.js.map