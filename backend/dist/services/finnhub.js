"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testFinnhubAPI = exports.getExchangeStockCounts = exports.getStockCount = exports.getStockSymbols = exports.getActiveStocks = exports.getPopularStocks = exports.getStockData = exports.getStockProfile = exports.getStockQuote = exports.FinnhubService = void 0;
const axios_1 = __importDefault(require("axios"));
const rateLimiter_1 = require("./rateLimiter");
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
// Çoklu API key desteği
// FINNHUB_API_KEY veya FINNHUB_API_KEYS (virgülle ayrılmış) kullanılabilir
function getApiKeys() {
    const keysEnv = process.env.FINNHUB_API_KEYS;
    const singleKey = process.env.FINNHUB_API_KEY || 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';
    if (keysEnv) {
        // Virgülle ayrılmış key'leri al ve temizle
        return keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }
    return [singleKey];
}
class FinnhubService {
    /**
     * Kullanılabilir bir API key seç (round-robin, rate limit'e göre)
     */
    static getAvailableApiKey() {
        // Önce kullanılabilir key'leri bul
        const availableKeys = this.apiKeys.filter(key => {
            const status = rateLimiter_1.RateLimiter.getStatus(key);
            return status.isAvailable && status.remaining > 0;
        });
        if (availableKeys.length === 0) {
            // Hiç kullanılabilir key yoksa, en az kullanılan key'i seç
            let minUsed = Infinity;
            let bestKey = this.apiKeys[0];
            for (const key of this.apiKeys) {
                const status = rateLimiter_1.RateLimiter.getStatus(key);
                if (status.remaining > minUsed) {
                    minUsed = status.remaining;
                    bestKey = key;
                }
            }
            return bestKey;
        }
        // Round-robin ile sıradaki key'i seç
        const selectedKey = availableKeys[this.currentKeyIndex % availableKeys.length];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % availableKeys.length;
        return selectedKey;
    }
    static async makeRequest(endpoint, params = {}) {
        const apiKey = this.getAvailableApiKey();
        try {
            // Rate limit kontrolü - gerekirse beklet
            await rateLimiter_1.RateLimiter.waitIfNeeded(apiKey);
            const url = `${FINNHUB_BASE}${endpoint}`;
            const queryParams = new URLSearchParams({
                token: apiKey,
                ...params
            });
            const { data } = await axios_1.default.get(`${url}?${queryParams}`, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });
            // API çağrısını kaydet
            rateLimiter_1.RateLimiter.recordCall(apiKey, 1);
            if (data.error) {
                throw new Error(data.error);
            }
            return data;
        }
        catch (error) {
            // 429 hatası geldiğinde özel işlem yap
            if (error.response?.status === 429 || error.status === 429) {
                rateLimiter_1.RateLimiter.record429Error(apiKey);
                // 429 hatasında çağrıyı kaydetme (zaten limit aşıldı)
            }
            else {
                // Diğer hatalarda çağrıyı kaydet
                rateLimiter_1.RateLimiter.recordCall(apiKey, 1);
            }
            console.error(`Finnhub API error (key: ${apiKey.substring(0, 8)}...):`, error);
            throw error;
        }
    }
    // Hisse senedi fiyatı al
    static async getQuote(symbol) {
        return this.makeRequest('/quote', { symbol });
    }
    // Hisse senedi profili al
    static async getProfile(symbol) {
        return this.makeRequest('/stock/profile2', { symbol });
    }
    // Hisse senedi detaylı verisi al (fiyat + profil)
    static async getStockData(symbol) {
        try {
            const [quote, profile] = await Promise.all([
                this.getQuote(symbol),
                this.getProfile(symbol)
            ]);
            return {
                symbol: symbol.toUpperCase(),
                name: profile.name || symbol,
                price: quote.c,
                change: quote.d,
                changePercent: quote.dp,
                high: quote.h,
                low: quote.l,
                open: quote.o,
                previousClose: quote.pc,
                marketCap: profile.marketCapitalization || 0,
                logo: profile.logo || '',
                industry: profile.finnhubIndustry || ''
            };
        }
        catch (error) {
            console.error(`Error fetching stock data for ${symbol}:`, error);
            throw error;
        }
    }
    // Aktif/önemli hisse senetlerini filtrele
    static filterActiveStocks(symbols) {
        return symbols.filter(symbol => {
            // Sadece Common Stock olanları al (ETF, Warrant, vb. hariç)
            const type = symbol.type?.toUpperCase() || '';
            const isCommonStock = type === 'COMMON STOCK' || type === 'CS' || type === 'EQ';
            // Description'ı olanları al (boş olmayan)
            const hasDescription = symbol.description && symbol.description.trim().length > 0;
            // Symbol'ü olanları al
            const hasSymbol = symbol.symbol && symbol.symbol.trim().length > 0;
            // OTC, Pink Sheet gibi düşük kaliteli piyasaları filtrele (opsiyonel)
            const isNotOTC = !symbol.mic?.includes('OTC') && !symbol.mic?.includes('PINK');
            return isCommonStock && hasDescription && hasSymbol;
        });
    }
    // Concurrency limit ile paralel işlem yap (rate limit'i aşmamak için)
    static async processWithConcurrencyLimit(items, concurrency, processor) {
        const results = [];
        let index = 0;
        const processNext = async () => {
            while (index < items.length) {
                const currentIndex = index++;
                try {
                    const result = await processor(items[currentIndex]);
                    results[currentIndex] = result;
                }
                catch (error) {
                    results[currentIndex] = null;
                }
            }
        };
        // Concurrency kadar paralel işlem başlat
        const workers = Array(Math.min(concurrency, items.length))
            .fill(null)
            .map(() => processNext());
        await Promise.all(workers);
        return results.filter(r => r !== null);
    }
    // Aktif hisse senetlerini batch'ler halinde çek (rate limit'e uygun)
    static async fetchStocksInBatches(symbols, batchSize = 30, maxStocks = 500) {
        const limitedSymbols = symbols.slice(0, maxStocks);
        const stocks = [];
        const numKeys = this.apiKeys.length;
        console.log(`📊 ${limitedSymbols.length} adet hisse senedi çekiliyor (${numKeys} API key ile)...`);
        rateLimiter_1.RateLimiter.logStatus();
        // Her hisse senedi için 2 API çağrısı yapılıyor (quote + profile)
        // 2 key = 120 çağrı/dakika = 60 hisse/dakika potansiyel
        // Güvenli olması için: her key için aynı anda max 5 hisse (10 çağrı)
        // 2 key = aynı anda max 10 hisse (20 çağrı) - güvenli
        const concurrencyPerKey = 5; // Her key için aynı anda max 5 hisse
        const totalConcurrency = numKeys > 1 ? concurrencyPerKey * numKeys : concurrencyPerKey;
        const actualBatchSize = Math.min(batchSize, 30); // Batch size'ı küçük tut
        for (let i = 0; i < limitedSymbols.length; i += actualBatchSize) {
            const batch = limitedSymbols.slice(i, i + actualBatchSize);
            const batchNum = Math.floor(i / actualBatchSize) + 1;
            const totalBatches = Math.ceil(limitedSymbols.length / actualBatchSize);
            // Batch içinde concurrency limit ile işle
            const batchStocks = await this.processWithConcurrencyLimit(batch, totalConcurrency, async (symbol) => {
                try {
                    const stockData = await this.getStockData(symbol.symbol);
                    if (stockData && stockData.price > 0) {
                        return stockData;
                    }
                    return null;
                }
                catch (error) {
                    console.error(`Error fetching ${symbol.symbol}:`, error.message);
                    return null;
                }
            });
            stocks.push(...batchStocks.filter((s) => s !== null));
            console.log(`✅ Batch ${batchNum}/${totalBatches}: ${batchStocks.filter(s => s !== null).length}/${batch.length} başarılı`);
            rateLimiter_1.RateLimiter.logStatus();
            // Batch'ler arası bekleme - rate limit için
            if (i + actualBatchSize < limitedSymbols.length) {
                // Her batch'te ~30 hisse * 2 çağrı = 60 çağrı
                // Rate limiter her key için ayrı takip yapıyor, bu yüzden daha kısa bekleme yeterli
                // 2 key ile: her key için 30 çağrı = 30/60 = 0.5 dakika = 30 saniye
                // Güvenli olması için biraz daha fazla bekleyelim
                const waitTime = numKeys > 1 ? 20000 : 40000; // 2 key: 20s, 1 key: 40s
                console.log(`⏳ Rate limit için ${waitTime / 1000} saniye bekleniyor...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        console.log(`🎉 Toplam ${stocks.length} adet hisse senedi başarıyla çekildi`);
        return stocks;
    }
    // Aktif/önemli hisse senetlerini çek (API'den gerçek veriler)
    static async getActiveStocks(exchange = 'US', maxStocks = 500, minMarketCap = 0) {
        try {
            console.log(`🔍 ${exchange} borsasından aktif hisse senetleri çekiliyor...`);
            // 1. Tüm sembolleri çek
            const allSymbols = await this.getStockSymbols(exchange);
            console.log(`📋 Toplam ${allSymbols.length} sembol bulundu`);
            // 2. Aktif olanları filtrele
            const activeSymbols = this.filterActiveStocks(allSymbols);
            console.log(`✅ ${activeSymbols.length} aktif hisse senedi filtrelendi`);
            // 3. Detaylarını batch'ler halinde çek
            const stocks = await this.fetchStocksInBatches(activeSymbols, 50, maxStocks);
            // 4. Market cap'e göre filtrele ve sırala
            let filteredStocks = stocks;
            if (minMarketCap > 0) {
                filteredStocks = stocks.filter(stock => stock.marketCap >= minMarketCap);
            }
            // Market cap'e göre sırala (büyükten küçüğe)
            filteredStocks.sort((a, b) => b.marketCap - a.marketCap);
            console.log(`🎉 ${filteredStocks.length} adet aktif hisse senedi başarıyla çekildi`);
            return filteredStocks;
        }
        catch (error) {
            console.error('Error fetching active stocks:', error);
            throw error;
        }
    }
    // Popüler hisse senetleri listesi (eski metod - geriye dönük uyumluluk için)
    static async getPopularStocks() {
        // Önce aktif hisse senetlerini çekmeyi dene
        try {
            // Şu anlık sadece 10 hisseye odaklanıyoruz
            const activeStocks = await this.getActiveStocks('US', 10, 500000000); // 500 milyon $ üzeri, 10 hisse
            if (activeStocks.length > 0) {
                // En popüler 10 tanesini döndür
                return activeStocks.slice(0, 10);
            }
        }
        catch (error) {
            console.warn('Active stocks fetch failed, falling back to hardcoded list:', error);
        }
        // Fallback: Hardcoded liste (en popüler 10 hisse senedi)
        const popularSymbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD', 'INTC'
        ];
        try {
            const stockPromises = popularSymbols.map(symbol => this.getStockData(symbol).catch(error => {
                console.error(`Error fetching ${symbol}:`, error);
                return null;
            }));
            const stocks = await Promise.all(stockPromises);
            // Sadece ilk 10 tanesini döndür
            return stocks.filter(stock => stock !== null).slice(0, 10);
        }
        catch (error) {
            console.error('Error fetching popular stocks:', error);
            throw error;
        }
    }
    // Borsadaki tüm sembolleri al
    static async getStockSymbols(exchange = 'US') {
        return this.makeRequest('/stock/symbol', { exchange });
    }
    // Borsadaki toplam hisse senedi sayısını al
    static async getStockCount(exchange = 'US') {
        try {
            const symbols = await this.getStockSymbols(exchange);
            return symbols.length;
        }
        catch (error) {
            console.error(`Error getting stock count for ${exchange}:`, error);
            throw error;
        }
    }
    // Tüm borsaları ve her birindeki hisse senedi sayısını al
    static async getExchangeStockCounts() {
        const exchanges = ['US', 'NASDAQ', 'NYSE', 'AMEX', 'LSE', 'XETR', 'XPAR', 'XAMS', 'XBRU', 'XMIL', 'XSTO', 'XHEL', 'XCOP', 'XOSL', 'XWAR', 'XIST'];
        const results = [];
        for (const exchange of exchanges) {
            try {
                const count = await this.getStockCount(exchange);
                results.push({ exchange, count });
                // Rate limiting için kısa bir bekleme
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            catch (error) {
                console.error(`Error getting count for ${exchange}:`, error);
                results.push({ exchange, count: 0 });
            }
        }
        return results;
    }
    // API key testi
    static async testAPIKey() {
        try {
            await this.getQuote('AAPL');
            return true;
        }
        catch (error) {
            console.error('API Key test failed:', error);
            return false;
        }
    }
}
exports.FinnhubService = FinnhubService;
FinnhubService.apiKeys = getApiKeys();
FinnhubService.currentKeyIndex = 0;
// Kolay kullanım için export edilen fonksiyonlar
const getStockQuote = (symbol) => FinnhubService.getQuote(symbol);
exports.getStockQuote = getStockQuote;
const getStockProfile = (symbol) => FinnhubService.getProfile(symbol);
exports.getStockProfile = getStockProfile;
const getStockData = (symbol) => FinnhubService.getStockData(symbol);
exports.getStockData = getStockData;
const getPopularStocks = () => FinnhubService.getPopularStocks();
exports.getPopularStocks = getPopularStocks;
const getActiveStocks = (exchange, maxStocks, minMarketCap) => FinnhubService.getActiveStocks(exchange, maxStocks, minMarketCap);
exports.getActiveStocks = getActiveStocks;
const getStockSymbols = (exchange) => FinnhubService.getStockSymbols(exchange);
exports.getStockSymbols = getStockSymbols;
const getStockCount = (exchange) => FinnhubService.getStockCount(exchange);
exports.getStockCount = getStockCount;
const getExchangeStockCounts = () => FinnhubService.getExchangeStockCounts();
exports.getExchangeStockCounts = getExchangeStockCounts;
const testFinnhubAPI = () => FinnhubService.testAPIKey();
exports.testFinnhubAPI = testFinnhubAPI;
//# sourceMappingURL=finnhub.js.map