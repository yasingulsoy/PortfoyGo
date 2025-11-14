'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PriceChart from '@/components/PriceChart';
import TradeModal from '@/components/TradeModal';
import useSWR from 'swr';
import { Stock } from '@/types';
import { useStocks, useCryptos } from '@/hooks/useMarketData';
import { 
  ArrowUpIcon, 
  ArrowDownIcon,
  ChartBarIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

const USD_TO_TRY = 32.5;
const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export default function AssetDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const [symbol, setSymbol] = useState<string>('');
  const { stocks } = useStocks();
  const { cryptos } = useCryptos();
  
  // params'ı async olarak çöz
  useEffect(() => {
    params.then(p => setSymbol(p.symbol.toUpperCase()));
  }, [params]);

  const sp = useSearchParams();
  const type = (sp.get('type') as 'stock' | 'crypto') || 'stock';
  const id = sp.get('id') || undefined;
  const symbolUpper = symbol.toUpperCase();

  const { data } = useSWR(() => symbolUpper && (type === 'stock'
    ? `/api/asset/history?type=stock&symbol=${symbolUpper}&days=30`
    : `/api/asset/history?type=crypto&id=${id}&days=30`), fetcher, { refreshInterval: 60000 });

  // Güncel fiyat bilgisini al
  const currentAsset = useMemo(() => {
    if (type === 'crypto') {
      return cryptos.find(c => c.symbol.toUpperCase() === symbolUpper || c.id === id);
    } else {
      return stocks.find(s => s.symbol === symbolUpper);
    }
  }, [type, symbolUpper, id, stocks, cryptos]);

  const lastPrice = useMemo(() => {
    const arr = data?.series as { time: number, value: number }[] | undefined;
    return arr && arr.length ? arr[arr.length - 1].value : (currentAsset?.price || 0);
  }, [data, currentAsset]);

  const priceUSD = type === 'crypto' 
    ? (currentAsset as any)?.current_price || (lastPrice / USD_TO_TRY)
    : (currentAsset as any)?.price || (lastPrice / USD_TO_TRY);
  
  const priceTRY = priceUSD * USD_TO_TRY;
  const changePercent = type === 'crypto' 
    ? (currentAsset as any)?.price_change_percentage_24h || 0
    : (currentAsset as any)?.changePercent || 0;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');

  const stockLike: Stock = {
    id: id || symbolUpper,
    symbol: symbolUpper,
    name: currentAsset?.name || symbolUpper,
    price: priceUSD,
    change: (changePercent / 100) * priceUSD,
    changePercent,
    volume: (currentAsset as any)?.volume || 0,
    marketCap: (currentAsset as any)?.marketCap || 0,
    previousClose: priceUSD,
    open: priceUSD,
    high: priceUSD,
    low: priceUSD,
  };

  if (!symbol) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  const isProfit = changePercent >= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link href="/" className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              ← Geri
            </Link>
            <ChartBarIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{currentAsset?.name || symbolUpper}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{symbolUpper} • {type === 'crypto' ? 'Kripto Para' : 'Hisse Senedi'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Price Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Güncel Fiyat</p>
              <div className="flex items-baseline space-x-3">
                <div className="text-4xl font-bold text-gray-900 dark:text-white">
                  ${priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
                <div className="text-xl text-gray-500 dark:text-gray-400">
                  ₺{priceTRY.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center px-4 py-2 rounded-lg ${
                isProfit 
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400' 
                  : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400'
              }`}>
                {isProfit ? (
                  <ArrowUpIcon className="h-5 w-5 mr-2" />
                ) : (
                  <ArrowDownIcon className="h-5 w-5 mr-2" />
                )}
                <span className="text-lg font-semibold">
                  {isProfit ? '+' : ''}{changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Fiyat Grafiği (30 Gün)</h2>
          <PriceChart type={type} symbol={symbolUpper} id={id} days={30} />
        </div>

        {/* Trade Buttons */}
        <div className="flex gap-4">
          <button 
            onClick={() => { setMode('buy'); setOpen(true); }} 
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center"
          >
            <CurrencyDollarIcon className="h-5 w-5 mr-2" />
            Al
          </button>
          <button 
            onClick={() => { setMode('sell'); setOpen(true); }} 
            className="flex-1 bg-gradient-to-r from-red-500 to-pink-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-red-600 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center"
          >
            <CurrencyDollarIcon className="h-5 w-5 mr-2" />
            Sat
          </button>
        </div>

        <TradeModal isOpen={open} onClose={() => setOpen(false)} stock={stockLike} type={mode} />
      </div>
    </div>
  );
}
