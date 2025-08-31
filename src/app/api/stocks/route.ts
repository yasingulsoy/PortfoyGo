import { NextResponse } from 'next/server';
import { getMarketData } from '@/services/api';

export async function GET() {
  const data = await getMarketData();
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
