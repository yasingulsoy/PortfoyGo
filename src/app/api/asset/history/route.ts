import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'stock' | 'crypto'
  const symbol = searchParams.get('symbol') || '';
  const id = searchParams.get('id') || '';
  const days = Number(searchParams.get('days') || '30');

  try {
    if (type === 'stock') {
      const token = process.env.FINNHUB_API_KEY;
      if (!token) throw new Error('Missing FINNHUB_API_KEY');
      const now = Math.floor(Date.now() / 1000);
      const from = now - days * 24 * 60 * 60;
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${now}&token=${token}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Finnhub candle error');
      const data = await res.json();
      if (data.s !== 'ok') throw new Error('Finnhub candle bad status');
      const series = (data.t as number[]).map((t: number, idx: number) => ({
        time: t,
        value: data.c[idx] as number,
      }));
      return NextResponse.json({ series });
    }

    if (type === 'crypto') {
      const coinId = id;
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('CoinGecko error');
      const data = await res.json();
      const series = (data.prices as [number, number][])?.map(([ms, price]) => ({
        time: Math.floor(ms / 1000),
        value: price,
      })) || [];
      return NextResponse.json({ series });
    }

    return NextResponse.json({ series: [] });
  } catch {
    // Basit random walk fallback
    const now = Math.floor(Date.now() / 1000);
    const series = Array.from({ length: days }, (_, i) => {
      const t = now - (days - i) * 86400;
      const value = 100 + i + Math.sin(i / 3) * 2 + (Math.random() - 0.5);
      return { time: t, value };
    });
    return NextResponse.json({ series });
  }
}
