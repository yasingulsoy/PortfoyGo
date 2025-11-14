'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  CurrencyDollarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  RefreshIcon
} from '@heroicons/react/24/outline';
import { usePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { PortfolioItem, Transaction } from '@/types';
import { useStocks, useCryptos } from '@/hooks/useMarketData';

const USD_TO_TRY = 32.5;

export default function PortfolioPage() {
  const { state, refreshPortfolio } = usePortfolio();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { stocks } = useStocks();
  const { cryptos } = useCryptos();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [portfolioWithPrices, setPortfolioWithPrices] = useState<PortfolioItem[]>([]);

  useEffect(() => {
    if (user) {
      refreshPortfolio();
    }
  }, [user]);

  // Portföy öğelerini güncel fiyatlarla güncelle
  useEffect(() => {
    if (state.portfolioItems.length > 0 && (stocks.length > 0 || cryptos.length > 0)) {
      const updated = state.portfolioItems.map(item => {
        // Hisse senedi mi kripto mu kontrol et
        const isCrypto = item.symbol.length <= 4;
        
        if (isCrypto) {
          const crypto = cryptos.find(c => c.symbol.toUpperCase() === item.symbol.toUpperCase());
          if (crypto) {
            const currentPriceUSD = crypto.current_price;
            const currentPriceTRY = currentPriceUSD * USD_TO_TRY;
            const averagePriceTRY = item.averagePrice;
            const profitLoss = (currentPriceTRY - averagePriceTRY) * item.quantity;
            const profitLossPercent = averagePriceTRY > 0 ? ((currentPriceTRY - averagePriceTRY) / averagePriceTRY) * 100 : 0;
            
            return {
              ...item,
              currentPrice: currentPriceTRY,
              currentPriceUSD: currentPriceUSD,
              totalValue: item.quantity * currentPriceTRY,
              profitLoss,
              profitLossPercent
            };
          }
        } else {
          const stock = stocks.find(s => s.symbol === item.symbol);
          if (stock) {
            const currentPriceUSD = stock.price;
            const currentPriceTRY = currentPriceUSD * USD_TO_TRY;
            const averagePriceTRY = item.averagePrice;
            const profitLoss = (currentPriceTRY - averagePriceTRY) * item.quantity;
            const profitLossPercent = averagePriceTRY > 0 ? ((currentPriceTRY - averagePriceTRY) / averagePriceTRY) * 100 : 0;
            
            return {
              ...item,
              currentPrice: currentPriceTRY,
              currentPriceUSD: currentPriceUSD,
              totalValue: item.quantity * currentPriceTRY,
              profitLoss,
              profitLossPercent
            };
          }
        }
        return item;
      });
      
      setPortfolioWithPrices(updated);
    } else {
      setPortfolioWithPrices(state.portfolioItems);
    }
  }, [state.portfolioItems, stocks, cryptos]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPortfolio();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getTotalInvestment = () => {
    return portfolioWithPrices.reduce((sum, item) => sum + (item.quantity * item.averagePrice), 0);
  };

  const getTotalCurrentValue = () => {
    return portfolioWithPrices.reduce((sum, item) => sum + item.totalValue, 0);
  };

  const getTotalProfitLoss = () => {
    return portfolioWithPrices.reduce((sum, item) => sum + item.profitLoss, 0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portföyüm</h1>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <RefreshIcon className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Portfolio Summary */}
        {user && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40 rounded-xl">
                  <CurrencyDollarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Değer</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">₺{getTotalCurrentValue().toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">${(getTotalCurrentValue() / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className={`p-3 rounded-xl ${getTotalProfitLoss() >= 0 ? 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40' : 'bg-gradient-to-br from-red-100 to-pink-100 dark:from-red-900/40 dark:to-pink-900/40'}`}>
                  {getTotalProfitLoss() >= 0 ? (
                    <ArrowUpIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <ArrowDownIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Kâr/Zarar</p>
                  <p className={`text-2xl font-bold ${getTotalProfitLoss() >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {getTotalProfitLoss() >= 0 ? '+' : ''}₺{getTotalProfitLoss().toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                  </p>
                  <p className={`text-xs ${getTotalProfitLoss() >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {getTotalInvestment() > 0 ? `${((getTotalProfitLoss() / getTotalInvestment()) * 100).toFixed(2)}%` : '0%'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 rounded-xl">
                  <CurrencyDollarIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Toplam Yatırım</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">₺{getTotalInvestment().toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">${(getTotalInvestment() / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/40 dark:to-blue-900/40 rounded-xl">
                  <CurrencyDollarIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nakit Bakiye</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">₺{state.balance.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">${(state.balance / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'overview'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                Portföy Genel Bakış
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'transactions'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                İşlem Geçmişi
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' ? (
              <PortfolioOverview portfolioItems={portfolioWithPrices} />
            ) : (
              <TransactionHistory transactions={state.transactions} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExtendedPortfolioItem extends PortfolioItem {
  currentPriceUSD?: number;
}

function PortfolioOverview({ portfolioItems }: { portfolioItems: ExtendedPortfolioItem[] }) {
  if (portfolioItems.length === 0) {
    return (
      <div className="text-center py-12">
        <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">Henüz portföy yok</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">İlk hisse alımınızı yaptığınızda burada görünecek.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Varlık
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Miktar
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Alış Fiyatı
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Güncel Fiyat
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Toplam Değer
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Kâr/Zarar
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Değişim %
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {portfolioItems.map((item) => {
            const isProfit = item.profitLoss >= 0;
            const priceChange = item.averagePrice > 0 ? ((item.currentPrice - item.averagePrice) / item.averagePrice) * 100 : 0;
            
            return (
              <tr key={item.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 rounded-lg flex items-center justify-center">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{item.symbol.slice(0,1)}</span>
                    </div>
                    <div>
                      <Link 
                        href={`/asset/${item.symbol}?type=${item.symbol.length <= 4 ? 'crypto' : 'stock'}`}
                        className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        {item.name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{item.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                  {item.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 8 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                  <div>₺{item.averagePrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">${(item.averagePrice / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                  <div className="font-semibold">₺{item.currentPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    ${item.currentPriceUSD ? item.currentPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 }) : (item.currentPrice / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                  <div>₺{item.totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">${(item.totalValue / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className={`flex items-center justify-end ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isProfit ? (
                      <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                    ) : (
                      <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                    )}
                    <span className="text-sm font-medium">
                      {isProfit ? '+' : ''}₺{item.profitLoss.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className={`text-xs ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isProfit ? '+' : ''}${(item.profitLoss / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    isProfit 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                  }`}>
                    {isProfit ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                    {isProfit ? '+' : ''}{priceChange.toFixed(2)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TransactionHistory({ transactions }: { transactions: Transaction[] }) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <ClockIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">Henüz işlem yok</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">İlk alım veya satım işleminizi yaptığınızda burada görünecek.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Tarih
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              İşlem
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Varlık
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Miktar
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Fiyat
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Toplam
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              Komisyon
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {formatDate(transaction.timestamp)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  transaction.type === 'buy' 
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' 
                    : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
                }`}>
                  {transaction.type === 'buy' ? 'Alım' : 'Satım'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{transaction.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{transaction.symbol}</div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                {transaction.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 8 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                <div>₺{transaction.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">${(transaction.price / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                <div>₺{transaction.totalAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">${(transaction.totalAmount / USD_TO_TRY).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                ₺{transaction.commission.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
