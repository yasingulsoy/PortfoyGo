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
  ArrowPathIcon
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
    <div className="min-h-screen bg-[#181a20]">
      {/* Header */}
      <div className="bg-[#1e2329] border-b border-[#2b3139]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="p-2 bg-[#0ecb81]/10 rounded-lg mr-3">
                <ChartBarIcon className="h-6 w-6 text-[#0ecb81]" />
              </div>
              <h1 className="text-2xl font-bold text-white">Portföyüm</h1>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-lg disabled:opacity-50 transition-colors font-semibold"
            >
              <ArrowPathIcon className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Portfolio Summary */}
        {user && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Toplam Değer</p>
                  <p className="text-2xl font-bold text-white">₺{getTotalCurrentValue().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-[#848e9c]">${(getTotalCurrentValue() / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="p-3 bg-[#0ecb81]/10 rounded-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-[#0ecb81]" />
                </div>
              </div>
            </div>

            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Toplam Kâr/Zarar</p>
                  <p className={`text-2xl font-bold ${getTotalProfitLoss() >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {getTotalProfitLoss() >= 0 ? '+' : ''}₺{getTotalProfitLoss().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className={`text-xs ${getTotalProfitLoss() >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {getTotalInvestment() > 0 ? `${((getTotalProfitLoss() / getTotalInvestment()) * 100).toFixed(2)}%` : '0%'}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${getTotalProfitLoss() >= 0 ? 'bg-[#0ecb81]/10' : 'bg-[#f6465d]/10'}`}>
                  {getTotalProfitLoss() >= 0 ? (
                    <ArrowUpIcon className={`h-6 w-6 text-[#0ecb81]`} />
                  ) : (
                    <ArrowDownIcon className={`h-6 w-6 text-[#f6465d]`} />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Toplam Yatırım</p>
                  <p className="text-2xl font-bold text-white">₺{getTotalInvestment().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-[#848e9c]">${(getTotalInvestment() / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="p-3 bg-[#0ecb81]/10 rounded-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-[#0ecb81]" />
                </div>
              </div>
            </div>

            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Nakit Bakiye</p>
                  <p className="text-2xl font-bold text-white">₺{state.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-[#848e9c]">${(state.balance / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="p-3 bg-[#0ecb81]/10 rounded-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-[#0ecb81]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] mb-8">
          <div className="border-b border-[#2b3139]">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
                  activeTab === 'overview'
                    ? 'border-[#0ecb81] text-[#0ecb81]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
                }`}
              >
                Portföy Genel Bakış
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
                  activeTab === 'transactions'
                    ? 'border-[#0ecb81] text-[#0ecb81]'
                    : 'border-transparent text-[#848e9c] hover:text-white'
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
        <ChartBarIcon className="mx-auto h-12 w-12 text-[#848e9c]" />
        <h3 className="mt-2 text-sm font-semibold text-white">Henüz portföy yok</h3>
        <p className="mt-1 text-sm text-[#848e9c]">İlk hisse alımınızı yaptığınızda burada görünecek.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[#2b3139]">
        <thead className="bg-[#161a1e]">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Varlık
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Miktar
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Alış Fiyatı
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Güncel Fiyat
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Toplam Değer
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Kâr/Zarar
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Değişim %
            </th>
          </tr>
        </thead>
        <tbody className="bg-[#1e2329] divide-y divide-[#2b3139]">
          {portfolioItems.map((item) => {
            const isProfit = item.profitLoss >= 0;
            const priceChange = item.averagePrice > 0 ? ((item.currentPrice - item.averagePrice) / item.averagePrice) * 100 : 0;
            
            return (
              <tr key={item.symbol} className="hover:bg-[#161a1e] transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-[#0ecb81]/10 rounded-lg flex items-center justify-center">
                      <span className="text-sm font-bold text-[#0ecb81]">{item.symbol.slice(0,1)}</span>
                    </div>
                    <div>
                      <Link 
                        href={`/asset/${item.symbol}?type=${item.symbol.length <= 4 ? 'crypto' : 'stock'}`}
                        className="text-sm font-semibold text-white hover:text-[#0ecb81] transition-colors"
                      >
                        {item.name}
                      </Link>
                      <div className="text-xs text-[#848e9c]">{item.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-white">
                  {item.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 8 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-white">
                  <div>₺{item.averagePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-[#848e9c]">${(item.averagePrice / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-white">
                  <div className="font-semibold">₺{item.currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-[#848e9c]">
                    ${item.currentPriceUSD ? item.currentPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (item.currentPrice / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-white">
                  <div>₺{item.totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-[#848e9c]">${(item.totalValue / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className={`flex items-center justify-end ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {isProfit ? (
                      <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                    ) : (
                      <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                    )}
                    <span className="text-sm font-semibold">
                      {isProfit ? '+' : ''}₺{item.profitLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className={`text-xs ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {isProfit ? '+' : ''}${(item.profitLoss / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    isProfit 
                      ? 'bg-[#0ecb81]/10 text-[#0ecb81]' 
                      : 'bg-[#f6465d]/10 text-[#f6465d]'
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
        <ClockIcon className="mx-auto h-12 w-12 text-[#848e9c]" />
        <h3 className="mt-2 text-sm font-semibold text-white">Henüz işlem yok</h3>
        <p className="mt-1 text-sm text-[#848e9c]">İlk alım veya satım işleminizi yaptığınızda burada görünecek.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[#2b3139]">
        <thead className="bg-[#161a1e]">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Tarih
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              İşlem
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Varlık
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Miktar
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Fiyat
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Toplam
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
              Komisyon
            </th>
          </tr>
        </thead>
        <tbody className="bg-[#1e2329] divide-y divide-[#2b3139]">
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-[#161a1e] transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                {formatDate(transaction.timestamp)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                  transaction.type === 'buy' 
                    ? 'bg-[#0ecb81]/10 text-[#0ecb81]' 
                    : 'bg-[#f6465d]/10 text-[#f6465d]'
                }`}>
                  {transaction.type === 'buy' ? 'Alım' : 'Satım'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <div className="text-sm font-semibold text-white">{transaction.name}</div>
                  <div className="text-sm text-[#848e9c]">{transaction.symbol}</div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-white">
                {transaction.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 8 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-white">
                <div>₺{transaction.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-xs text-[#848e9c]">${(transaction.price / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-white">
                <div>₺{transaction.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-xs text-[#848e9c]">${(transaction.totalAmount / USD_TO_TRY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-[#848e9c]">
                ₺{transaction.commission.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
