"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketCacheService = void 0;
const database_1 = __importDefault(require("../config/database"));
const finnhub_1 = require("./finnhub");
const axios_1 = __importDefault(require("axios"));
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY;
// CoinGecko'dan kripto paraları çek
async function fetchTopCryptos(limit = 25) {
    try {
        const headers = COINGECKO_API_KEY ? { 'X-CG-Pro-API-Key': COINGECKO_API_KEY } : {};
        const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`;
        const response = await axios_1.default.get(url, { headers, timeout: 10000 });
        const data = response.data;
        return Array.isArray(data) ? data : [];
    }
    catch (error) {
        console.error('CoinGecko API error:', error);
        return [];
    }
}
const CACHE_DURATION_HOURS = 1; // 1 saat (10 hisse olduğu için daha kısa süre yeterli)
class MarketCacheService {
    // Cache'den veri al
    static async getFromCache(assetType, symbol) {
        try {
            let query = `
        SELECT * FROM market_data_cache 
        WHERE asset_type = $1 AND expires_at > CURRENT_TIMESTAMP
      `;
            const params = [assetType];
            if (symbol) {
                query += ` AND symbol = $2`;
                params.push(symbol.toUpperCase());
            }
            query += ` ORDER BY cached_at DESC`;
            const result = await database_1.default.query(query, params);
            return result.rows.map((row) => ({
                id: row.id,
                asset_type: row.asset_type,
                symbol: row.symbol,
                name: row.name,
                price: parseFloat(row.price),
                change: parseFloat(row.change || 0),
                change_percent: parseFloat(row.change_percent || 0),
                volume: parseInt(row.volume || 0),
                market_cap: parseInt(row.market_cap || 0),
                previous_close: row.previous_close ? parseFloat(row.previous_close) : undefined,
                open_price: row.open_price ? parseFloat(row.open_price) : undefined,
                high_price: row.high_price ? parseFloat(row.high_price) : undefined,
                low_price: row.low_price ? parseFloat(row.low_price) : undefined,
                metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
                cached_at: row.cached_at,
                expires_at: row.expires_at
            }));
        }
        catch (error) {
            console.error('Get from cache error:', error);
            return [];
        }
    }
    // Cache'e veri kaydet
    static async saveToCache(data) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            for (const item of data) {
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS);
                await client.query(`INSERT INTO market_data_cache 
           (asset_type, symbol, name, price, change, change_percent, volume, market_cap, previous_close, open_price, high_price, low_price, metadata, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (asset_type, symbol) 
           DO UPDATE SET 
             name = EXCLUDED.name,
             price = EXCLUDED.price,
             change = EXCLUDED.change,
             change_percent = EXCLUDED.change_percent,
             volume = EXCLUDED.volume,
             market_cap = EXCLUDED.market_cap,
             previous_close = EXCLUDED.previous_close,
             open_price = EXCLUDED.open_price,
             high_price = EXCLUDED.high_price,
             low_price = EXCLUDED.low_price,
             metadata = EXCLUDED.metadata,
             cached_at = CURRENT_TIMESTAMP,
             expires_at = EXCLUDED.expires_at`, [
                    item.asset_type,
                    item.symbol.toUpperCase(),
                    item.name,
                    item.price,
                    item.change,
                    item.change_percent,
                    Math.floor(item.volume || 0), // BIGINT için tam sayıya çevir
                    Math.floor(item.market_cap || 0), // BIGINT için tam sayıya çevir
                    item.previous_close || null,
                    item.open_price || null,
                    item.high_price || null,
                    item.low_price || null,
                    item.metadata ? JSON.stringify(item.metadata) : null,
                    expiresAt
                ]);
            }
            await client.query('COMMIT');
            console.log(`✅ ${data.length} adet ${data[0]?.asset_type} verisi cache'e kaydedildi`);
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Save to cache error:', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    // Cache'i güncelle (API'den çekip kaydet)
    // Şu anlık sadece 10 hisseye odaklanıyoruz
    static async refreshCache(forceFullRefresh = false) {
        try {
            console.log('🔄 Market data cache güncelleniyor...');
            // Cache durumunu kontrol et
            const cacheStatus = await this.getCacheStatus();
            const hasEnoughCache = cacheStatus.stocks >= 10;
            // Şu anlık sadece 10 hisseye odaklanıyoruz
            const maxStocks = 10;
            const minMarketCap = 100000000; // 100 milyon $ üzeri (daha kaliteli hisse senetleri)
            // Hisse senetlerini çek ve cache'e kaydet
            try {
                console.log(`📊 ${maxStocks} adet aktif hisse senedi çekiliyor...`);
                const stocks = await (0, finnhub_1.getActiveStocks)('US', maxStocks, minMarketCap);
                if (stocks.length === 0) {
                    console.warn('⚠️  Aktif hisse senetleri çekilemedi, popüler hisse senetlerine dönülüyor...');
                    // Fallback: Popüler hisse senetleri
                    const popularStocks = await (0, finnhub_1.getPopularStocks)();
                    const stockCacheData = popularStocks.map(stock => ({
                        asset_type: 'stock',
                        symbol: stock.symbol,
                        name: stock.name,
                        price: stock.price,
                        change: stock.change,
                        change_percent: stock.changePercent,
                        volume: 0,
                        market_cap: stock.marketCap || 0,
                        previous_close: stock.previousClose,
                        open_price: stock.open,
                        high_price: stock.high,
                        low_price: stock.low,
                        metadata: {
                            symbol: stock.symbol
                        }
                    }));
                    await this.saveToCache(stockCacheData);
                }
                else {
                    const stockCacheData = stocks.map(stock => ({
                        asset_type: 'stock',
                        symbol: stock.symbol,
                        name: stock.name,
                        price: stock.price,
                        change: stock.change,
                        change_percent: stock.changePercent,
                        volume: 0,
                        market_cap: stock.marketCap || 0,
                        previous_close: stock.previousClose,
                        open_price: stock.open,
                        high_price: stock.high,
                        low_price: stock.low,
                        metadata: {
                            symbol: stock.symbol,
                            logo: stock.logo,
                            industry: stock.industry
                        }
                    }));
                    await this.saveToCache(stockCacheData);
                    console.log(`✅ ${stocks.length} adet hisse senedi cache'e kaydedildi`);
                }
            }
            catch (error) {
                console.error('Stocks cache refresh error:', error);
                // Hata durumunda popüler hisse senetlerine dön
                try {
                    const popularStocks = await (0, finnhub_1.getPopularStocks)();
                    const stockCacheData = popularStocks.map(stock => ({
                        asset_type: 'stock',
                        symbol: stock.symbol,
                        name: stock.name,
                        price: stock.price,
                        change: stock.change,
                        change_percent: stock.changePercent,
                        volume: 0,
                        market_cap: stock.marketCap || 0,
                        previous_close: stock.previousClose,
                        open_price: stock.open,
                        high_price: stock.high,
                        low_price: stock.low,
                        metadata: {
                            symbol: stock.symbol
                        }
                    }));
                    await this.saveToCache(stockCacheData);
                }
                catch (fallbackError) {
                    console.error('Fallback stocks cache error:', fallbackError);
                }
            }
            // Kripto paraları çek ve cache'e kaydet
            try {
                const cryptos = await fetchTopCryptos(25);
                const cryptoCacheData = cryptos.map(crypto => ({
                    asset_type: 'crypto',
                    symbol: crypto.symbol.toUpperCase(),
                    name: crypto.name,
                    price: crypto.current_price,
                    change: crypto.current_price * (crypto.price_change_percentage_24h || 0) / 100,
                    change_percent: crypto.price_change_percentage_24h || 0,
                    volume: crypto.total_volume || 0,
                    market_cap: crypto.market_cap || 0,
                    metadata: {
                        id: crypto.id,
                        image: crypto.image
                    }
                }));
                await this.saveToCache(cryptoCacheData);
            }
            catch (error) {
                console.error('Cryptos cache refresh error:', error);
            }
            // Eski cache kayıtlarını temizle
            await database_1.default.query('DELETE FROM market_data_cache WHERE expires_at < CURRENT_TIMESTAMP');
            console.log('✅ Market data cache güncellemesi tamamlandı');
        }
        catch (error) {
            console.error('Refresh cache error:', error);
            throw error;
        }
    }
    // Cache durumunu kontrol et
    static async getCacheStatus() {
        try {
            const stocksResult = await database_1.default.query('SELECT COUNT(*) as count FROM market_data_cache WHERE asset_type = $1 AND expires_at > CURRENT_TIMESTAMP', ['stock']);
            const cryptosResult = await database_1.default.query('SELECT COUNT(*) as count FROM market_data_cache WHERE asset_type = $1 AND expires_at > CURRENT_TIMESTAMP', ['crypto']);
            const oldestResult = await database_1.default.query('SELECT MIN(cached_at) as oldest FROM market_data_cache WHERE expires_at > CURRENT_TIMESTAMP');
            const newestResult = await database_1.default.query('SELECT MAX(cached_at) as newest FROM market_data_cache WHERE expires_at > CURRENT_TIMESTAMP');
            return {
                stocks: parseInt(stocksResult.rows[0].count),
                cryptos: parseInt(cryptosResult.rows[0].count),
                oldestCache: oldestResult.rows[0].oldest,
                newestCache: newestResult.rows[0].newest
            };
        }
        catch (error) {
            console.error('Get cache status error:', error);
            return { stocks: 0, cryptos: 0, oldestCache: null, newestCache: null };
        }
    }
}
exports.MarketCacheService = MarketCacheService;
//# sourceMappingURL=marketCache.js.map