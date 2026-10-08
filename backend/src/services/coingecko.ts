import axios from 'axios';
import { describeHttpError } from './finnhub';

// Not: Bu blok services/marketCache.ts içinden olduğu gibi taşındı (davranış değişmedi);
// providers/adapters/coingecko.ts tarafından CryptoProvider sözleşmesine bağlanır.

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const getCoinGeckoKey = () => process.env.COINGECKO_API_KEY || process.env.NEXT_PUBLIC_COINGECKO_API_KEY || '';

// CoinGecko'dan kripto paraları çek
export async function fetchTopCryptos(limit: number = 25): Promise<any[]> {
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
