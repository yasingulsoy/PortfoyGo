'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  CurrencyDollarIcon, 
  TrophyIcon, 
  UserIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import TradeModal from '@/components/TradeModal';
import MarketTabs from '@/components/MarketTabs';
import { useStocks, useCryptos } from '@/hooks/useMarketData';
import { CryptoCoin } from '@/services/crypto';

export default function Home() {
  const { state } = usePortfolio();
  const { stocks } = useStocks();
  const { cryptos } = useCryptos();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);


  // Giriş kontrolü kaldırıldı - herkes içeri bakabilir

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            {user ? `Hoş geldin, ${user.username}!` : 'Sanal Yatırım Platformu'}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            {user ? 'Piyasa verilerini takip edin ve yatırım kararlarınızı alın' : 'Gerçek zamanlı piyasa verileri ile sanal yatırım yapın'}
          </p>
          {!user && (
            <div className="mt-4 flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Giriş Yap
              </Link>
              <Link
                href="/register"
                className="px-6 py-2 bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border border-indigo-600 dark:border-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Kayıt Ol
              </Link>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        {user && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 rounded-xl">
                  <CurrencyDollarIcon className="h-6 w-6 sm:h-7 sm:w-7 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-4">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Portföy Değeri</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">₺{state.totalValue.toLocaleString('tr-TR')}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className={`p-3 rounded-xl ${state.totalProfitLoss >= 0 ? 'bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40' : 'bg-gradient-to-br from-red-100 to-pink-100 dark:from-red-900/40 dark:to-pink-900/40'}`}>
                  {state.totalProfitLoss >= 0 ? (
                    <ArrowUpIcon className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <ArrowDownIcon className="h-6 w-6 sm:h-7 sm:w-7 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="ml-4">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Kâr/Zarar</p>
                  <p className={`text-xl sm:text-2xl font-bold ${state.totalProfitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {state.totalProfitLoss >= 0 ? '+' : ''}₺{state.totalProfitLoss.toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 rounded-xl">
                  <TrophyIcon className="h-6 w-6 sm:h-7 sm:w-7 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-4">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Sıralama</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">#{user?.rank || '-'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/40 dark:to-blue-900/40 rounded-xl">
                  <UserIcon className="h-6 w-6 sm:h-7 sm:w-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="ml-4">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Hisse</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{state.portfolioItems.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Market Grid - Modern Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* Hisse Senetleri Grid */}
          <div className="lg:col-span-1 xl:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Hisse Senetleri</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{stocks.length} hisse</span>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                  {stocks.map((stock) => (
                    <div key={stock.id} className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all hover:scale-[1.02]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 rounded-xl flex items-center justify-center shadow-sm">
                            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{stock.symbol.slice(0,1)}</span>
                          </div>
                          <div>
                            <Link href={`/asset/${stock.symbol}?type=stock`} className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                              {stock.name}
                            </Link>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{stock.symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900 dark:text-white">${stock.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">₺{(stock.price * 32.5).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                          <div className={`text-sm inline-flex items-center font-medium mt-1 ${stock.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {stock.change >= 0 ? <ArrowUpIcon className="h-4 w-4 mr-1" /> : <ArrowDownIcon className="h-4 w-4 mr-1" />}
                            {stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                          </div>
                        </div>
                      </div>
                      {user && (
                        <div className="flex gap-2 mt-3">
                          <button 
                            onClick={() => onBuy(stock.symbol, 'stock')} 
                            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm hover:shadow-md"
                          >
                            Al
                          </button>
                          <button 
                            onClick={() => onSell(stock.symbol, 'stock')} 
                            className="flex-1 bg-gradient-to-r from-red-500 to-pink-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:from-red-600 hover:to-pink-700 transition-all shadow-sm hover:shadow-md"
                          >
                            Sat
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Kripto Paralar Grid */}
          <div className="lg:col-span-1 xl:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Kripto Paralar</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{cryptos.length} kripto</span>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  {cryptos.slice(0, 6).map((crypto) => {
                    const USD_TO_TRY = 32.5;
                    const changePct = crypto.price_change_percentage_24h ?? 0;
                    return (
                      <div key={crypto.id} className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all hover:scale-[1.02]">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Image src={crypto.image} alt={crypto.name} width={40} height={40} className="rounded-full ring-2 ring-indigo-200 dark:ring-indigo-800" />
                            </div>
                            <div>
                              <Link href={`/asset/${crypto.symbol.toUpperCase()}?type=crypto&id=${crypto.id}`} className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                {crypto.name}
                              </Link>
                              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">{crypto.symbol}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900 dark:text-white">${crypto.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">₺{(crypto.current_price * USD_TO_TRY).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                            <div className={`text-sm inline-flex items-center font-medium mt-1 ${changePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {changePct >= 0 ? <ArrowUpIcon className="h-4 w-4 mr-1" /> : <ArrowDownIcon className="h-4 w-4 mr-1" />}
                              {changePct.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                        {user && (
                          <div className="flex gap-2 mt-3">
                            <button 
                              onClick={() => onBuy(crypto.symbol.toUpperCase(), 'crypto')} 
                              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm hover:shadow-md"
                            >
                              Al
                            </button>
                            <button 
                              onClick={() => onSell(crypto.symbol.toUpperCase(), 'crypto')} 
                              className="flex-1 bg-gradient-to-r from-red-500 to-pink-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:from-red-600 hover:to-pink-700 transition-all shadow-sm hover:shadow-md"
                            >
                              Sat
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions & Market Summary */}
        {user && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Hızlı İşlemler</h3>
              <div className="space-y-3">
                <Link href="/portfolio" className="block w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm hover:shadow-md text-center font-medium">
                  Portföyümü Görüntüle
                </Link>
                <Link href="/transactions" className="block w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white py-3 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-center font-medium">
                  Geçmiş İşlemler
                </Link>
                <Link href="/leaderboard" className="block w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-4 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-sm hover:shadow-md text-center font-medium">
                  Liderlik Tablosu
                </Link>
              </div>
            </div>

            {/* Market Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Piyasa Özeti</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Toplam Hisse</span>
                  <span className="font-medium text-gray-900 dark:text-white">{stocks.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Toplam Kripto</span>
                  <span className="font-medium text-gray-900 dark:text-white">{cryptos.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Komisyon Oranı</span>
                  <span className="font-medium text-green-600 dark:text-green-400">%0.25</span>
                </div>
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <ClientOnlyTime />
                </div>
              </div>
            </div>

            {/* Market Status */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Piyasa Durumu</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Hisse Senetleri</span>
                  <span className="text-green-600 dark:text-green-400 text-sm font-medium flex items-center gap-1">
                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
                    Açık
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Kripto Paralar</span>
                  <span className="text-green-600 dark:text-green-400 text-sm font-medium flex items-center gap-1">
                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
                    24/7
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">API Durumu</span>
                  <span className="text-green-600 dark:text-green-400 text-sm font-medium flex items-center gap-1">
                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
                    Çalışıyor
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mini Leaderboard */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">En İyi Performans</h3>
            <Link href="/leaderboard" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs sm:text-sm font-medium transition-colors">
              Tümünü Gör →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-base sm:text-lg">🥇</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Ahmet Yılmaz</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">1. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">+₺2,450</div>
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">+24.5%</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-700/50 dark:to-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-base sm:text-lg">🥈</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Ayşe Demir</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">2. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">+₺1,890</div>
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">+18.9%</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg border border-orange-200 dark:border-orange-800 sm:col-span-2 lg:col-span-1 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-base sm:text-lg">🥉</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Mehmet Kaya</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">3. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">+₺1,230</div>
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">+12.3%</div>
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

function ClientOnlyTime() {
  const [timeText, setTimeText] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setTimeText(new Date().toLocaleTimeString('tr-TR'));
    update();
    const intervalId = setInterval(update, 60000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="text-xs text-gray-400  text-center">
      Son güncelleme: {timeText ?? '—'}
    </div>
  );
}
