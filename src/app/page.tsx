'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  CurrencyDollarIcon, 
  TrophyIcon, 
  UserIcon,
  ArrowUpIcon,
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Kullanıcı giriş yapmamışsa loading ekranı göster (yönlendirme sırasında)
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Giriş sayfasına yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

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
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">₺{state.totalValue.toLocaleString('tr-TR')}</p>
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
                  {state.totalProfitLoss >= 0 ? '+' : ''}₺{state.totalProfitLoss.toLocaleString('tr-TR')}
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

        {/* Market Overview & Actions */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          {/* Market Tabs - Takes 2/3 width on XL screens */}
          <div className="xl:col-span-2">
            <MarketTabs
              stocks={stocks}
              cryptos={cryptos}
              onBuy={onBuy}
              onSell={onSell}
            />
          </div>

          {/* Quick Actions Panel */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Hızlı İşlemler</h3>
              <div className="space-y-3">
                <Link href="/portfolio" className="block w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors text-center font-medium">
                  Portföyümü Görüntüle
                </Link>
                <Link href="/transactions" className="block w-full bg-gray-100 dark:bg-gray-800 dark:text-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-center font-medium">
                  Geçmiş İşlemler
                </Link>
                <Link href="/leaderboard" className="block w-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 py-3 px-4 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors text-center font-medium">
                  Liderlik Tablosu
                </Link>
              </div>
            </div>

            {/* Market Summary */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Piyasa Özeti</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Toplam Hisse</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{stocks.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Toplam Kripto</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{cryptos.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Komisyon Oranı</span>
                  <span className="font-medium text-green-600">%0.25</span>
                </div>
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <ClientOnlyTime />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mini Leaderboard */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">En İyi Performans</h3>
            <Link href="/leaderboard" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm font-medium">
              Tümünü Gör →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">🥇</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Ahmet Yılmaz</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">1. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">+₺2,450</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">+24.5%</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-gray-400 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">🥈</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Ayşe Demir</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">2. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">+₺1,890</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">+18.9%</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">🥉</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Mehmet Kaya</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">3. Sıra</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">+₺1,230</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">+12.3%</div>
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
    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
      Son güncelleme: {timeText ?? '—'}
    </div>
  );
}
