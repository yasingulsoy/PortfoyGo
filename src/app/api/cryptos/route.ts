import { NextResponse } from 'next/server';
import type { CryptoCoin } from '@/services/crypto';

// Basit bellek içi cache
let lastCache: { key: string; data: CryptoCoin[]; ts: number } | null = null;
const CACHE_MS = 20_000; // 20 saniye

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

async function fetchWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, cache: 'no-store' });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchTopCryptosServer(vs: string, limit: number, apiKey?: string): Promise<CryptoCoin[]> {
  const headers: Record<string, string> = apiKey ? { 'X-CG-Pro-API-Key': apiKey } : {};
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${encodeURIComponent(vs)}&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`;

  // Basit retry: 3 deneme, artan gecikme
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers, timeoutMs: 8000 });
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
      const data = (await res.json()) as CryptoCoin[];
      if (Array.isArray(data) && data.length > 0) return data;
      throw new Error('Empty response from CoinGecko');
    } catch (err) {
      lastError = err;
      // Bekleme: 300ms, 700ms, 1200ms
      const backoff = [300, 700, 1200][attempt] ?? 1200;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('CoinGecko request failed');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vs = searchParams.get('vs') || 'usd';
  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10) || 25, 100);

  const cacheKey = `${vs}:${limit}`;
  const now = Date.now();
  if (lastCache && lastCache.key === cacheKey && now - lastCache.ts < CACHE_MS) {
    return NextResponse.json(lastCache.data, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const apiKey = process.env.NEXT_PUBLIC_COINGECKO_API_KEY || process.env.COINGECKO_API_KEY;
    const data = await fetchTopCryptosServer(vs, limit, apiKey);
    lastCache = { key: cacheKey, data, ts: now };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Son çare: basit bir mock seti dön
    const fallback: CryptoCoin[] = [
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: '', current_price: 43500, market_cap: 850000000000, price_change_percentage_24h: -2.3, total_volume: 15000000000 },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', image: '', current_price: 2650, market_cap: 320000000000, price_change_percentage_24h: 1.5, total_volume: 8000000000 },
      { id: 'tether', symbol: 'usdt', name: 'Tether', image: '', current_price: 1.0, market_cap: 95000000000, price_change_percentage_24h: 0.01, total_volume: 25000000000 },
      { id: 'solana', symbol: 'sol', name: 'Solana', image: '', current_price: 98, market_cap: 43000000000, price_change_percentage_24h: 3.2, total_volume: 1800000000 },
    ].slice(0, limit);
    lastCache = { key: cacheKey, data: fallback, ts: now };
    return NextResponse.json(fallback, { headers: { 'Cache-Control': 'no-store' } });
  }
}


