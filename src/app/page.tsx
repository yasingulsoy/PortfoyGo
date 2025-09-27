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


  // Kullanıcı giriş yapmamışsa login sayfasına yönlendir
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

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


  // Loading durumunda loading ekranı göster
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50  flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-400 ">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Kullanıcı giriş yapmamışsa loading ekranı göster (yönlendirme sırasında)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50  flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-400 ">Giriş sayfasına yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Hoş geldin, {user?.username}!
          </h1>
          <p className="text-gray-400">
            Piyasa verilerini takip edin ve yatırım kararlarınızı alın
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="bg-gray-800  rounded-xl shadow-sm p-4 sm:p-6 border border-gray-700 ">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                <CurrencyDollarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-400 ">Portföy Değeri</p>
                <p className="text-lg sm:text-2xl font-bold text-white ">₺{state.totalValue.toLocaleString('tr-TR')}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800  rounded-xl shadow-sm p-4 sm:p-6 border border-gray-700 ">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <ArrowUpIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-400 ">Toplam Kâr/Zarar</p>
                <p className={`text-lg sm:text-2xl font-bold ${state.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {state.totalProfitLoss >= 0 ? '+' : ''}₺{state.totalProfitLoss.toLocaleString('tr-TR')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800  rounded-xl shadow-sm p-4 sm:p-6 border border-gray-700 ">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                <TrophyIcon className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-400 ">Sıralama</p>
                <p className="text-lg sm:text-2xl font-bold text-white ">#{user?.rank || 42}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800  rounded-xl shadow-sm p-4 sm:p-6 border border-gray-700 ">
            <div className="flex items-center">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                <UserIcon className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-400 ">Toplam Hisse</p>
                <p className="text-lg sm:text-2xl font-bold text-white ">{state.portfolioItems.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Market Grid - Modern Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* Hisse Senetleri Grid */}
          <div className="lg:col-span-1 xl:col-span-2">
            <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold text-white">Hisse Senetleri</h2>
                <span className="text-sm text-gray-400">{stocks.length} hisse</span>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                  {stocks.map((stock) => (
                    <div key={stock.id} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center">
                            <span className="text-lg font-bold text-indigo-600">{stock.symbol.slice(0,1)}</span>
                          </div>
                          <div>
                            <Link href={`/asset/${stock.symbol}?type=stock`} className="text-sm font-semibold text-white hover:text-indigo-400">
                              {stock.name}
                            </Link>
                            <div className="text-xs text-gray-400">{stock.symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-white">₺{stock.price.toLocaleString('tr-TR')}</div>
                          <div className={`text-sm inline-flex items-center ${stock.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {stock.change >= 0 ? <ArrowUpIcon className="h-4 w-4 mr-1" /> : <ArrowDownIcon className="h-4 w-4 mr-1" />}
                            {stock.change >= 0 ? '+' : ''}{stock.change.toLocaleString('tr-TR')} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%)
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => onBuy(stock.symbol, 'stock')} 
                          className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          Al
                        </button>
                        <button 
                          onClick={() => onSell(stock.symbol, 'stock')} 
                          className="flex-1 bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
                          Sat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Kripto Paralar Grid */}
          <div className="lg:col-span-1 xl:col-span-1">
            <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold text-white">Kripto Paralar</h2>
                <span className="text-sm text-gray-400">{cryptos.length} kripto</span>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  {cryptos.slice(0, 6).map((crypto) => {
                    const USD_TO_TRY = 32.5;
                    const changePct = crypto.price_change_percentage_24h ?? 0;
                    return (
                      <div key={crypto.id} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Image src={crypto.image} alt={crypto.name} width={32} height={32} className="rounded-full" />
                            <div>
                              <Link href={`/asset/${crypto.symbol.toUpperCase()}?type=crypto&id=${crypto.id}`} className="text-sm font-semibold text-white hover:text-indigo-400">
                                {crypto.name}
                              </Link>
                              <div className="text-xs text-gray-400 uppercase">{crypto.symbol}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">₺{(crypto.current_price * USD_TO_TRY).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                            <div className={`text-sm inline-flex items-center ${changePct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {changePct >= 0 ? <ArrowUpIcon className="h-4 w-4 mr-1" /> : <ArrowDownIcon className="h-4 w-4 mr-1" />}
                              {changePct.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => onBuy(crypto.symbol.toUpperCase(), 'crypto')} 
                            className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                          >
                            Al
                          </button>
                          <button 
                            onClick={() => onSell(crypto.symbol.toUpperCase(), 'crypto')} 
                            className="flex-1 bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                          >
                            Sat
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions & Market Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Hızlı İşlemler</h3>
            <div className="space-y-3">
              <Link href="/portfolio" className="block w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors text-center font-medium">
                Portföyümü Görüntüle
              </Link>
              <Link href="/transactions" className="block w-full bg-gray-700 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors text-center font-medium">
                Geçmiş İşlemler
              </Link>
              <Link href="/leaderboard" className="block w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors text-center font-medium">
                Liderlik Tablosu
              </Link>
            </div>
          </div>

          {/* Market Summary */}
          <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Piyasa Özeti</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Toplam Hisse</span>
                <span className="font-medium text-white">{stocks.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Toplam Kripto</span>
                <span className="font-medium text-white">{cryptos.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Komisyon Oranı</span>
                <span className="font-medium text-green-500">%0.25</span>
              </div>
              <div className="pt-3 border-t border-gray-700">
                <ClientOnlyTime />
              </div>
            </div>
          </div>

          {/* Market Status */}
          <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Piyasa Durumu</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Hisse Senetleri</span>
                <span className="text-green-500 text-sm font-medium">Açık</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Kripto Paralar</span>
                <span className="text-green-500 text-sm font-medium">24/7</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">API Durumu</span>
                <span className="text-green-500 text-sm font-medium">Çalışıyor</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mini Leaderboard */}
        <div className="bg-gray-800  rounded-xl shadow-sm border border-gray-700  p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-semibold text-white ">En İyi Performans</h3>
            <Link href="/leaderboard" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs sm:text-sm font-medium">
              Tümünü Gör →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm sm:text-base">🥇</span>
                </div>
                <div>
                  <div className="font-semibold text-white  text-sm sm:text-base">Ahmet Yılmaz</div>
                  <div className="text-xs sm:text-sm text-gray-400 ">1. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-lg font-bold text-green-600">+₺2,450</div>
                <div className="text-xs sm:text-sm text-gray-400 ">+24.5%</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 rounded-lg border border-gray-700 ">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 bg-gray-400 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm sm:text-base">🥈</span>
                </div>
                <div>
                  <div className="font-semibold text-white  text-sm sm:text-base">Ayşe Demir</div>
                  <div className="text-xs sm:text-sm text-gray-400 ">2. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-lg font-bold text-green-600">+₺1,890</div>
                <div className="text-xs sm:text-sm text-gray-400 ">+18.9%</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg border border-orange-200 dark:border-orange-800 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm sm:text-base">🥉</span>
                </div>
                <div>
                  <div className="font-semibold text-white  text-sm sm:text-base">Mehmet Kaya</div>
                  <div className="text-xs sm:text-sm text-gray-400 ">3. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-lg font-bold text-green-600">+₺1,230</div>
                <div className="text-xs sm:text-sm text-gray-400 ">+12.3%</div>
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
