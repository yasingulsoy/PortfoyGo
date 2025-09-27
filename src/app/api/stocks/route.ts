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

  try {
    // Backend API'sinden veri al
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const res = await fetch(`${backendUrl}/api/stocks`, { 
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) throw new Error('Backend API error');
    
    const backendData = await res.json();
    
    if (!backendData.success) {
      throw new Error(backendData.message || 'Backend API error');
    }

    // Backend'den gelen veriyi frontend formatına çevir
    const results: Stock[] = backendData.data.map((stock: any) => ({
      id: stock.symbol,
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
      volume: 0, // Backend'de volume yok
      marketCap: stock.marketCap,
      previousClose: stock.previousClose,
      open: stock.open,
      high: stock.high,
      low: stock.low,
    }));

    const data: MarketData = { stocks: results, lastUpdated: new Date() };
    lastCache = { data, ts: now };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Backend API error, falling back to mock data:', error);
    
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
