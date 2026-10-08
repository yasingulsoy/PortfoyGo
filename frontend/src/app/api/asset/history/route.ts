import { NextResponse } from 'next/server';

// Fiyat geçmişi (grafik) için sunucu tarafı vekil.
// Not: Sahte/rastgele veri üretilmez; veri yoksa boş seri ve `unavailable: true` döner.

const SYMBOL_RE = /^[A-Z0-9.\-]{1,15}$/;
const COIN_ID_RE = /^[a-z0-9\-]{1,64}$/;

type Point = { time: number; value: number };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const symbol = (searchParams.get('symbol') || '').toUpperCase();
  const id = (searchParams.get('id') || '').toLowerCase();
  const daysRaw = Number(searchParams.get('days') || '30');
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, Math.round(daysRaw))) : 30;

  try {
    let series: Point[] = [];

    if (type === 'stock') {
      const token = process.env.FINNHUB_API_KEY;
      if (!token || !SYMBOL_RE.test(symbol)) return unavailable();
      const to = Math.floor(Date.now() / 1000);
      const from = to - days * 86400;
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { next: { revalidate: 900 } });
      if (!res.ok) return unavailable();
      const data = await res.json();
      if (data.s !== 'ok' || !Array.isArray(data.t)) return unavailable();
      series = (data.t as number[]).map((t, i) => ({ time: t, value: Number(data.c[i]) }));
    } else if (type === 'crypto') {
      if (!COIN_ID_RE.test(id)) return unavailable();
      const headers: Record<string, string> = {};
      if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
      const res = await fetch(url, { headers, next: { revalidate: 300 } });
      if (!res.ok) return unavailable();
      const data = await res.json();
      series = Array.isArray(data.prices)
        ? (data.prices as [number, number][]).map(([ms, price]) => ({ time: Math.floor(ms / 1000), value: price }))
        : [];
    } else {
      return unavailable();
    }

    // lightweight-charts artan ve tekil zaman damgası ister
    const dedup = new Map<number, number>();
    for (const p of series) if (Number.isFinite(p.value)) dedup.set(p.time, p.value);
    const clean = [...dedup.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));

    return NextResponse.json({ series: clean, currency: 'USD' });
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return NextResponse.json({ series: [], unavailable: true });
}
