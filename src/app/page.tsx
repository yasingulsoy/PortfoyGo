'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChartBarIcon, 
  CurrencyDollarIcon, 
  TrophyIcon, 
  UserIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  HomeIcon,
  BriefcaseIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';
import TradeModal from '@/components/TradeModal';
import { getMarketData, simulatePriceUpdates } from '@/services/api';

const mockStocks: Stock[] = [
  { id: '1', name: 'Apple Inc.', symbol: 'AAPL', price: 150.25, change: 2.15, changePercent: 1.45, volume: 45678900, marketCap: 2400000000000, previousClose: 148.10, open: 149.50, high: 151.80, low: 148.90 },
  { id: '2', name: 'Microsoft Corp.', symbol: 'MSFT', price: 320.80, change: -1.20, changePercent: -0.37, volume: 23456700, marketCap: 2400000000000, previousClose: 322.00, open: 321.50, high: 323.20, low: 319.80 },
  { id: '3', name: 'Tesla Inc.', symbol: 'TSLA', price: 245.60, change: 8.40, changePercent: 3.54, volume: 56789000, marketCap: 780000000000, previousClose: 237.20, open: 238.50, high: 246.80, low: 237.00 },
  { id: '4', name: 'Bitcoin', symbol: 'BTC', price: 45000, change: 1200, changePercent: 2.74, volume: 1234567, marketCap: 1100000000000, previousClose: 43800, open: 44000, high: 45200, low: 43800 },
  { id: '5', name: 'Ethereum', symbol: 'ETH', price: 2800, change: -50, changePercent: -1.75, volume: 2345678, marketCap: 700000000000, previousClose: 2850, open: 2840, high: 2860, low: 2780 },
];

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>(mockStocks);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const { state, updatePrices } = usePortfolio();

  // Fiyat güncellemelerini simüle et
  useEffect(() => {
    const interval = setInterval(() => {
      const updatedStocks = simulatePriceUpdates(stocks);
      setStocks(updatedStocks);
      updatePrices(updatedStocks);
    }, 10000); // Her 10 saniyede bir güncelle

    return () => clearInterval(interval);
  }, [stocks, updatePrices]);

  const handleTrade = (stock: Stock, type: 'buy' | 'sell') => {
    setSelectedStock(stock);
    setTradeType(type);
    setIsTradeModalOpen(true);
  };

  const closeTradeModal = () => {
    setIsTradeModalOpen(false);
    setSelectedStock(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <ChartBarIcon className="h-8 w-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Sanal Yatırım</h1>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2 text-gray-700 hover:text-indigo-600 transition-colors">
                <HomeIcon className="h-5 w-5" />
                <span>Ana Sayfa</span>
              </Link>
              <Link href="/portfolio" className="flex items-center space-x-2 text-gray-700 hover:text-indigo-600 transition-colors">
                <BriefcaseIcon className="h-5 w-5" />
                <span>Portföyüm</span>
              </Link>
              <Link href="/transactions" className="flex items-center space-x-2 text-gray-700 hover:text-indigo-600 transition-colors">
                <ClockIcon className="h-5 w-5" />
                <span>İşlemler</span>
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Bakiye</p>
                <p className="text-lg font-semibold text-gray-900">₺{state.balance.toLocaleString()}</p>
              </div>
              <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                Giriş Yap
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Portföy Değeri</p>
                <p className="text-2xl font-bold text-gray-900">₺{state.totalValue.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ArrowUpIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Toplam Kâr/Zarar</p>
                <p className={`text-2xl font-bold ${state.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {state.totalProfitLoss >= 0 ? '+' : ''}₺{state.totalProfitLoss.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrophyIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Sıralama</p>
                <p className="text-2xl font-bold text-gray-900">#42</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <UserIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Toplam Hisse</p>
                <p className="text-2xl font-bold text-gray-900">{state.portfolioItems.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Market Overview */}
        <div className="bg-white rounded-xl shadow-sm border mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Piyasa Genel Bakış</h2>
            <p className="text-sm text-gray-500 mt-1">Gerçek zamanlı fiyat güncellemeleri (10 saniyede bir)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Varlık
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sembol
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fiyat
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Değişim
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hacim
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stocks.map((stock) => (
                  <tr key={stock.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-600">
                            {stock.symbol.charAt(0)}
                          </span>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{stock.name}</div>
                          <div className="text-sm text-gray-500">{stock.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {stock.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      ₺{stock.price.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`flex items-center justify-end ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.change >= 0 ? (
                          <ArrowUpIcon className="h-4 w-4 mr-1" />
                        ) : (
                          <ArrowDownIcon className="h-4 w-4 mr-1" />
                        )}
                        <span className="text-sm font-medium">
                          {stock.change >= 0 ? '+' : ''}{stock.change.toLocaleString()} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%)
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                      {stock.volume.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleTrade(stock, 'buy')}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                        >
                          Al
                        </button>
                        <button 
                          onClick={() => handleTrade(stock, 'sell')}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
                        >
                          Sat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Hızlı İşlemler</h3>
            <div className="space-y-3">
              <Link href="/portfolio" className="block w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors text-center">
                Portföyümü Görüntüle
              </Link>
              <Link href="/transactions" className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors text-center">
                Geçmiş İşlemler
              </Link>
              <button className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors">
                Piyasa Analizi
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Liderlik Tablosu</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-yellow-600 font-bold">🥇</span>
                  <span className="font-medium">Ahmet Yılmaz</span>
                </div>
                <span className="text-green-600 font-semibold">+₺2,450</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-gray-600 font-bold">🥈</span>
                  <span className="font-medium">Ayşe Demir</span>
                </div>
                <span className="text-green-600 font-semibold">+₺1,890</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-orange-600 font-bold">🥉</span>
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
