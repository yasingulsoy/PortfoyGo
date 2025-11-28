"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 2 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
    .map(function (origin) { return origin.trim(); }) // Boşlukları temizle
    .filter(function (origin) {
    // Boş string'leri filtrele
    if (!origin || origin.length === 0) {
        return false;
    }
    // Geçerli URL formatını kontrol et
    var isValid = origin.startsWith('http://') || origin.startsWith('https://');
    if (!isValid) {
        console.warn("⚠️  Geçersiz origin formatı: " + origin);
        return false;
    }
    // Production'da localhost'u filtrele (güvenlik için)
    if (process.env.NODE_ENV === 'production') {
        var isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0');
        if (isLocalhost) {
            console.warn("⚠️  Production'da localhost origin filtrelendi: " + origin);
            return false;
        }
    }
    return true;
});
// Debug için log (production'da da görmek için)
console.log('🌐 CORS Allowed Origins (parsed):', JSON.stringify(allowedOrigins, null, 2));
console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
console.log('📊 Total allowed origins:', allowedOrigins.length);
var corsOptions = {
    origin: function (origin, callback) {
        // Origin yoksa (same-origin request veya mobile app) izin ver
        if (!origin) {
            console.log('✅ CORS: No origin header (same-origin or mobile app) - allowing');
            return callback(null, true);
        }
        console.log("🔍 CORS check - Request origin: " + origin);
        console.log("📋 Checking against " + allowedOrigins.length + " allowed origins");
        // Allowed origins listesinde var mı kontrol et
        if (allowedOrigins.includes(origin)) {
            console.log("✅ CORS: Origin " + origin + " is allowed");
            callback(null, true);
        }
        else {
            console.warn("❌ CORS blocked origin: " + origin);
            console.log('📋 Allowed origins:', allowedOrigins);
            console.log('🔍 Exact match check:', allowedOrigins.map(function (o) { return "\"" + o + "\""; }).join(', '));
            // CORS hatası için Error döndür
            callback(new Error("CORS: Origin " + origin + " is not allowed"));
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
app.use(function (req, res, next) {
    var timestamp = new Date().toISOString();
    var method = req.method;
    var url = req.url;
    var origin = req.headers.origin || 'No Origin';
    var userAgent = req.headers['user-agent'] || 'No User-Agent';
    console.log("\n📥 [" + timestamp + "] " + method + " " + url);
    console.log("   Origin: " + origin);
    console.log("   User-Agent: " + userAgent.substring(0, 80) + "...");
    // Response tamamlandığında log
    var originalSend = res.send;
    res.send = function (body) {
        var statusCode = res.statusCode;
        var statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' :
            statusCode >= 400 && statusCode < 500 ? '⚠️' :
                statusCode >= 500 ? '❌' : 'ℹ️';
        console.log("📤 [" + timestamp + "] " + method + " " + url + " - " + statusEmoji + " " + statusCode);
        return originalSend.call(this, body);
    };
    next();
});
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Root endpoint - API bilgileri (hem / hem de /api için) - Route'lardan ÖNCE tanımlanmalı
var rootHandler = function (_req, res) {
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
            cryptos: '/api/cryptos'
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
// Health check
app.get('/api/health', function (req, res) {
    res.json({
        success: true,
        message: 'Trading Platform API çalışıyor',
        timestamp: new Date().toISOString()
    });
});
// 404 handler
app.use(function (req, res) {
    var timestamp = new Date().toISOString();
    console.warn('\n⚠️  404 - ENDPOINT NOT FOUND');
    console.warn('═══════════════════════════════════════════════════════');
    console.warn("Timestamp: " + timestamp);
    console.warn("Method: " + req.method);
    console.warn("URL: " + req.url);
    console.warn("Path: " + req.path);
    console.warn("Original URL: " + req.originalUrl);
    console.warn("Base URL: " + req.baseUrl);
    console.warn('Headers:', {
        host: req.headers.host,
        origin: req.headers.origin,
        'user-agent': req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 80) : undefined
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
            'GET /api/leaderboard'
        ]
    });
});
// Error handler
app.use(function (err, req, res, next) {
    var timestamp = new Date().toISOString();
    console.error('\n❌ ERROR HANDLER');
    console.error('═══════════════════════════════════════════════════════');
    console.error("Timestamp: " + timestamp);
    console.error("Method: " + req.method);
    console.error("URL: " + req.url);
    console.error("Origin: " + (req.headers.origin || 'No Origin'));
    console.error("Error Message: " + (err.message || 'Unknown error'));
    console.error('Error Stack:', err.stack);
    console.error('═══════════════════════════════════════════════════════\n');
    res.status(500).json({
        success: false,
        message: 'Sunucu hatası',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
// Cache'i başlangıçta doldur (ilk yükleme - daha fazla hisse çek)
marketCache_1.MarketCacheService.refreshCache(true).catch(function (err) {
    console.error('Initial cache refresh error:', err);
});
// Her 2 dakikada bir cache'i güncelle (10 hisse - hızlı güncelleme)
// Şu anlık sadece 10 hisseye odaklanıyoruz, bu yüzden daha sık güncelleyebiliriz
node_cron_1.default.schedule('*/2 * * * *', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('⏰ Scheduled cache refresh başlatılıyor (2 dakika)...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, marketCache_1.MarketCacheService.refreshCache(false)];
            case 2:
                _a.sent();
                console.log('✅ Scheduled cache refresh tamamlandı');
                return [3 /*break*/, 4];
            case 3:
                error = _a.sent();
                console.error('❌ Scheduled cache refresh hatası:', error);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Her 30 dakikada bir tam cache refresh (10 hisse)
node_cron_1.default.schedule('*/30 * * * *', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('⏰ Full cache refresh başlatılıyor (30 dakika)...');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, marketCache_1.MarketCacheService.refreshCache(true)];
            case 2:
                _a.sent();
                console.log('✅ Full cache refresh tamamlandı');
                return [3 /*break*/, 4];
            case 3:
                error = _a.sent();
                console.error('❌ Full cache refresh hatası:', error);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
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
app.listen(PORT, function () {
    console.log("🚀 Server running on port " + PORT);
    console.log("📊 Trading Platform API ready!");
    console.log("🌐 Health check: http://localhost:" + PORT + "/api/health");
    console.log("🔄 Cache otomatik güncelleme: Her 2 dakikada bir (10 hisse)");
});
//# sourceMappingURL=index.js.map