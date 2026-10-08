import axios from 'axios';
import pool from '../config/database';
import { FinnhubService, StockData, describeHttpError } from './finnhub';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const getCoinGeckoKey = () => process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY || '';

// CoinGecko'dan kripto paraları çek
async function fetchTopCryptos(limit: number = 25): Promise<any[]> {
  try {
    const key = getCoinGeckoKey();
    const headers: Record<string, string> = key ? { 'X-CG-Pro-API-Key': key } : {};
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`;

    const response = await axios.get(url, { headers, timeout: 10000 });
    const data = response.data;
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`[coingecko] Kripto verisi alınamadı: ${describeHttpError(error)}`);
    return [];
  }
}

export interface CachedMarketData {
  id: string;
  asset_type: 'stock' | 'crypto';
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap: number;
  previous_close?: number;
  open_price?: number;
  high_price?: number;
  low_price?: number;
  metadata?: any;
  cached_at: Date;
  expires_at: Date;
}

type CacheInput = Omit<CachedMarketData, 'id' | 'cached_at' | 'expires_at'>;

const CACHE_DURATION_HOURS = 1;

const toStockCacheData = (stocks: StockData[]): CacheInput[] =>
  stocks.map((stock) => ({
    asset_type: 'stock' as const,
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    change: stock.change,
    change_percent: stock.changePercent,
    volume: 0,
    market_cap: Math.floor(Number(stock.marketCap) || 0),
    previous_close: stock.previousClose,
    open_price: stock.open,
    high_price: stock.high,
    low_price: stock.low,
    metadata: {
      symbol: stock.symbol,
      logo: stock.logo,
      industry: stock.industry,
    },
  }));

let refreshInFlight: Promise<void> | null = null;

export class MarketCacheService {
  // Cache'den veri al (süresi dolmamış kayıtlar)
  static async getFromCache(assetType: 'stock' | 'crypto', symbol?: string): Promise<CachedMarketData[]> {
    let query = `
      SELECT * FROM market_data_cache
      WHERE asset_type = $1 AND expires_at > CURRENT_TIMESTAMP
    `;
    const params: any[] = [assetType];

    if (symbol) {
      query += ` AND UPPER(symbol) = $2`;
      params.push(symbol.toUpperCase());
    }

    query += ` ORDER BY market_cap DESC NULLS LAST, cached_at DESC`;

    const result = await pool.query(query, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      asset_type: row.asset_type,
      symbol: row.symbol,
      name: row.name,
      price: parseFloat(row.price),
      change: parseFloat(row.change || 0),
      change_percent: parseFloat(row.change_percent || 0),
      volume: Number(row.volume || 0),
      market_cap: Number(row.market_cap || 0),
      previous_close: row.previous_close ? parseFloat(row.previous_close) : undefined,
      open_price: row.open_price ? parseFloat(row.open_price) : undefined,
      high_price: row.high_price ? parseFloat(row.high_price) : undefined,
      low_price: row.low_price ? parseFloat(row.low_price) : undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      cached_at: row.cached_at,
      expires_at: row.expires_at,
    }));
  }

  // Cache'e veri kaydet
  static async saveToCache(data: CacheInput[]): Promise<void> {
    if (data.length === 0) return;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const item of data) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS);

        await client.query(
          `INSERT INTO market_data_cache
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
             expires_at = EXCLUDED.expires_at`,
          [
            item.asset_type,
            item.symbol.toUpperCase(),
            item.name,
            item.price,
            item.change,
            item.change_percent,
            Math.floor(Number(item.volume) || 0), // BIGINT
            Math.floor(Number(item.market_cap) || 0), // BIGINT
            item.previous_close || null,
            item.open_price || null,
            item.high_price || null,
            item.low_price || null,
            item.metadata ? JSON.stringify(item.metadata) : null,
            expiresAt,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cache'i API'lerden yeniler (hisse: Finnhub, kripto: CoinGecko).
   * Eşzamanlı çağrılar tek bir yenilemede birleştirilir.
   */
  static refreshCache(): Promise<void> {
    if (!refreshInFlight) {
      refreshInFlight = this.doRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  private static async doRefresh(): Promise<void> {
    // Hisseler (anahtar yoksa atlanır; mevcut cache servis edilmeye devam eder)
    if (FinnhubService.isConfigured()) {
      try {
        const stocks = await FinnhubService.getPopularStocks();
        await this.saveToCache(toStockCacheData(stocks));
      } catch (error: any) {
        console.error('[market-cache] Hisse cache yenileme hatası:', error?.message);
      }
    }

    // Kriptolar
    try {
      const cryptos = await fetchTopCryptos(25);
      const cryptoCacheData: CacheInput[] = cryptos
        .filter((c) => c && typeof c.symbol === 'string' && Number(c.current_price) > 0)
        .map((crypto) => ({
          asset_type: 'crypto' as const,
          symbol: crypto.symbol.toUpperCase(),
          name: crypto.name,
          price: crypto.current_price,
          change: (crypto.current_price * (crypto.price_change_percentage_24h || 0)) / 100,
          change_percent: crypto.price_change_percentage_24h || 0,
          volume: Math.floor(Number(crypto.total_volume) || 0),
          market_cap: Math.floor(Number(crypto.market_cap) || 0),
          metadata: {
            id: crypto.id,
            image: crypto.image,
          },
        }));
      await this.saveToCache(cryptoCacheData);
    } catch (error: any) {
      console.error('[market-cache] Kripto cache yenileme hatası:', error?.message);
    }

    // Süresi çok önce dolmuş kayıtları temizle (son bilinen fiyatlar 1 gün tutulur)
    await pool.query(`DELETE FROM market_data_cache WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'`);
  }

  // Cache durumunu kontrol et
  static async getCacheStatus(): Promise<{ stocks: number; cryptos: number; oldestCache: Date | null; newestCache: Date | null }> {
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE asset_type = 'stock')  AS stocks,
         COUNT(*) FILTER (WHERE asset_type = 'crypto') AS cryptos,
         MIN(cached_at) AS oldest,
         MAX(cached_at) AS newest
       FROM market_data_cache
       WHERE expires_at > CURRENT_TIMESTAMP`
    );
    const row = r.rows[0] || {};
    return {
      stocks: parseInt(row.stocks || '0', 10),
      cryptos: parseInt(row.cryptos || '0', 10),
      oldestCache: row.oldest ?? null,
      newestCache: row.newest ?? null,
    };
  }
}
