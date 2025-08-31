'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  CurrencyDollarIcon, 
  TrophyIcon, 
  UserIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';
import TradeModal from '@/components/TradeModal';
import MarketTabs from '@/components/MarketTabs';
import { useStocks, useCryptos } from '@/hooks/useMarketData';
import { CryptoCoin } from '@/services/crypto';

export default function Home() {
  const { state } = usePortfolio();
  const { stocks } = useStocks();
  const { cryptos } = useCryptos();

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  const toStockFromCrypto = (c: CryptoCoin): Stock => {
    const price = c.current_price;
    const changePercent = c.price_change_percentage_24h ?? 0;
    const change = price * (changePercent / 100);
    return {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price,
      change,
      changePercent,
      volume: c.total_volume ?? 0,
      marketCap: c.market_cap ?? 0,
      previousClose: price - change,
      open: price,
      high: price,
      low: price,
    };
  };

  const openTrade = (asset: Stock) => {
    setSelectedStock(asset);
    setIsTradeModalOpen(true);
  };

  const onBuy = (symbol: string, type: 'stock' | 'crypto') => {
    if (type === 'stock') {
      const s = stocks.find(x => x.symbol === symbol);
      if (s) {
        setTradeType('buy');
        openTrade(s);
      }
    } else {
      const c = cryptos.find(x => x.symbol.toUpperCase() === symbol);
      if (c) {
        setTradeType('buy');
        openTrade(toStockFromCrypto(c));
      }
    }
  };

  const onSell = (symbol: string, type: 'stock' | 'crypto') => {
    if (type === 'stock') {
      const s = stocks.find(x => x.symbol === symbol);
      if (s) {
        setTradeType('sell');
        openTrade(s);
      }
    } else {
      const c = cryptos.find(x => x.symbol.toUpperCase() === symbol);
      if (c) {
        setTradeType('sell');
        openTrade(toStockFromCrypto(c));
      }
    }
  };

  const closeTradeModal = () => {
    setIsTradeModalOpen(false);
    setSelectedStock(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Portföy Değeri</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">₺{state.totalValue.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <ArrowUpIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Kâr/Zarar</p>
                <p className={`text-2xl font-bold ${state.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {state.totalProfitLoss >= 0 ? '+' : ''}₺{state.totalProfitLoss.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                <TrophyIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sıralama</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">#42</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                <UserIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Hisse</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{state.portfolioItems.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Market Tabs */}
        <div className="mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
            <MarketTabs
              stocks={stocks}
              cryptos={cryptos}
              onBuy={onBuy}
              onSell={onSell}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Hızlı İşlemler</h3>
            <div className="space-y-3">
              <Link href="/portfolio" className="block w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors text-center">
                Portföyümü Görüntüle
              </Link>
              <Link href="/transactions" className="block w-full bg-gray-100 dark:bg-gray-800 dark:text-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-center">
                Geçmiş İşlemler
              </Link>
              <button className="w-full bg-gray-100 dark:bg-gray-800 dark:text-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Piyasa Analizi
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Liderlik Tablosu</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-yellow-600">🥇</span>
                  <span className="font-medium">Ahmet Yılmaz</span>
                </div>
                <span className="text-green-600 font-semibold">+₺2,450</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-gray-600 dark:text-gray-300">🥈</span>
                  <span className="font-medium">Ayşe Demir</span>
                </div>
                <span className="text-green-600 font-semibold">+₺1,890</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-orange-600">🥉</span>
                  <span className="font-medium">Mehmet Kaya</span>
                </div>
                <span className="text-green-600 font-semibold">+₺1,230</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Trade Modal */}
      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={closeTradeModal}
        stock={selectedStock}
        type={tradeType}
      />
    </div>
  );
}
