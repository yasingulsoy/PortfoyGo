import { NextResponse } from 'next/server';
import { Stock, MarketData } from '@/types';
import { simulatePriceUpdates } from '@/services/api';

const SYMBOLS: Record<string, string> = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  GOOGL: 'Alphabet Inc.',
  TSLA: 'Tesla Inc.',
  AMZN: 'Amazon.com Inc.',
  NVDA: 'NVIDIA Corporation',
  META: 'Meta Platforms Inc.',
  NFLX: 'Netflix Inc.'
};

const symbolList = Object.keys(SYMBOLS);

let lastCache: { data: MarketData; ts: number } | null = null;
const CACHE_MS = 20_000; // 20 saniye

export async function GET() {
  const now = Date.now();
  if (lastCache && now - lastCache.ts < CACHE_MS) {
    return NextResponse.json(lastCache.data, { headers: { 'Cache-Control': 'no-store' } });
  }

  const token = process.env.FINNHUB_API_KEY;
  try {
    if (!token) throw new Error('Missing FINNHUB_API_KEY');

    const results = await Promise.all(
      symbolList.map(async (symbol) => {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Finnhub error');
        const q = await res.json();
        const stock: Stock = {
          id: symbol,
          symbol,
          name: SYMBOLS[symbol] || symbol,
          price: q.c ?? 0,
          change: q.d ?? 0,
          changePercent: q.dp ?? 0,
          volume: 0,
          marketCap: 0,
          previousClose: q.pc ?? 0,
          open: q.o ?? 0,
          high: q.h ?? 0,
          low: q.l ?? 0,
        };
        return stock;
      })
    );

    const data: MarketData = { stocks: results, lastUpdated: new Date() };
    lastCache = { data, ts: now };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // Fallback: hafif simülasyonlu mock
    const mock = symbolList.map((s, i) => ({
      id: s,
      symbol: s,
      name: SYMBOLS[s] || s,
      price: 100 + i * 10,
      change: (Math.random() - 0.5) * 2,
      changePercent: (Math.random() - 0.5) * 2,
      volume: 0,
      marketCap: 0,
      previousClose: 100 + i * 10,
      open: 100 + i * 10,
      high: 100 + i * 10 + 2,
      low: 100 + i * 10 - 2,
    })) as Stock[];
    const simulated = simulatePriceUpdates(mock);
    const data: MarketData = { stocks: simulated, lastUpdated: new Date() };
    lastCache = { data, ts: now };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  }
}
