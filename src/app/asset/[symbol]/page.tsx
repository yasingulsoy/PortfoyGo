'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PriceChart from '@/components/PriceChart';
import TradeModal from '@/components/TradeModal';
import useSWR from 'swr';
import { Stock } from '@/types';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export default function AssetDetailPage({ params }: { params: { symbol: string } }) {
  const sp = useSearchParams();
  const type = (sp.get('type') as 'stock' | 'crypto') || 'stock';
  const id = sp.get('id') || undefined;
  const symbol = params.symbol.toUpperCase();

  const { data } = useSWR(() => type === 'stock'
    ? `/api/asset/history?type=stock&symbol=${symbol}&days=30`
    : `/api/asset/history?type=crypto&id=${id}&days=30`, fetcher, { refreshInterval: 60000 });

  const lastPrice = useMemo(() => {
    const arr = data?.series as { time: number, value: number }[] | undefined;
    return arr && arr.length ? arr[arr.length - 1].value : 0;
  }, [data]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');

  const stockLike: Stock = {
    id: id || symbol,
    symbol,
    name: symbol,
    price: lastPrice,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: 0,
    previousClose: lastPrice,
    open: lastPrice,
    high: lastPrice,
    low: lastPrice,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{symbol} Detay</h1>
          <p className="text-sm text-gray-500">Son fiyat: {lastPrice ? `₺${lastPrice.toLocaleString()}` : '—'}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <PriceChart type={type} symbol={symbol} id={id} days={30} />
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={() => { setMode('buy'); setOpen(true); }} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">Al</button>
          <button onClick={() => { setMode('sell'); setOpen(true); }} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">Sat</button>
        </div>

        <TradeModal isOpen={open} onClose={() => setOpen(false)} stock={stockLike} type={mode} />
      </div>
    </div>
  );
}
