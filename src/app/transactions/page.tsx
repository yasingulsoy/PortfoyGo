'use client';

import { useState } from 'react';
import { 
  ClockIcon,
  FunnelIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { usePortfolio } from '@/context/PortfolioContext';

export default function TransactionsPage() {
  const { state } = usePortfolio();
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'symbol'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatShortDate = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const filteredTransactions = state.transactions
    .filter(transaction => {
      if (filterType === 'all') return true;
      return transaction.type === filterType;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          break;
        case 'amount':
          comparison = b.totalAmount - a.totalAmount;
          break;
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
      }
      
      return sortOrder === 'asc' ? -comparison : comparison;
    });

  const getTotalBuyAmount = () => {
    return state.transactions
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + t.totalAmount, 0);
  };

  const getTotalSellAmount = () => {
    return state.transactions
      .filter(t => t.type === 'sell')
      .reduce((sum, t) => sum + t.totalAmount, 0);
  };

  const getTotalCommission = () => {
    return state.transactions.reduce((sum, t) => sum + t.commission, 0);
  };

  const exportTransactions = () => {
    const csvContent = [
      ['Tarih', 'İşlem', 'Hisse', 'Sembol', 'Miktar', 'Fiyat', 'Toplam', 'Komisyon'],
      ...filteredTransactions.map(t => [
        formatDate(t.timestamp),
        t.type === 'buy' ? 'Alım' : 'Satım',
        t.name,
        t.symbol,
        t.quantity.toString(),
        t.price.toString(),
        t.totalAmount.toString(),
        t.commission.toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `islem-gecmisi-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#181a20]">
      {/* Header */}
      <div className="bg-[#1e2329] border-b border-[#2b3139]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div className="p-2 bg-[#0ecb81]/10 rounded-lg mr-3">
              <ClockIcon className="h-6 w-6 text-[#0ecb81]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">İşlem Geçmişi</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
            <div className="text-center">
              <p className="text-xs text-[#848e9c] mb-1">Toplam İşlem</p>
              <p className="text-2xl font-bold text-white">{state.transactions.length}</p>
            </div>
          </div>

          <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
            <div className="text-center">
              <p className="text-xs text-[#848e9c] mb-1">Toplam Alım</p>
              <p className="text-2xl font-bold text-[#0ecb81]">₺{getTotalBuyAmount().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
            <div className="text-center">
              <p className="text-xs text-[#848e9c] mb-1">Toplam Satım</p>
              <p className="text-2xl font-bold text-[#f6465d]">₺{getTotalSellAmount().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
            <div className="text-center">
              <p className="text-xs text-[#848e9c] mb-1">Toplam Komisyon</p>
              <p className="text-2xl font-bold text-white">₺{getTotalCommission().toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] mb-8">
          <div className="p-6 border-b border-[#2b3139] bg-[#161a1e]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h2 className="text-lg font-bold text-white">İşlem Detayları</h2>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Filter */}
                <div className="flex items-center space-x-2">
                  <FunnelIcon className="h-5 w-5 text-[#848e9c]" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as 'all' | 'buy' | 'sell')}
                    className="border border-[#2b3139] bg-[#1e2329] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] transition-colors"
                  >
                    <option value="all">Tüm İşlemler</option>
                    <option value="buy">Sadece Alımlar</option>
                    <option value="sell">Sadece Satımlar</option>
                  </select>
                </div>

                {/* Sort */}
                <div className="flex items-center space-x-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'symbol')}
                    className="border border-[#2b3139] bg-[#1e2329] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] transition-colors"
                  >
                    <option value="date">Tarihe Göre</option>
                    <option value="amount">Tutara Göre</option>
                    <option value="symbol">Sembole Göre</option>
                  </select>
                  
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="p-2 border border-[#2b3139] bg-[#1e2329] text-white rounded-lg hover:bg-[#2b3139] transition-colors"
                    title={sortOrder === 'asc' ? 'Artan' : 'Azalan'}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>

                {/* Export */}
                <button
                  onClick={exportTransactions}
                  className="flex items-center space-x-2 bg-[#0ecb81] hover:bg-[#0bb975] text-white px-4 py-2 rounded-lg transition-all font-semibold"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span className="text-sm">Dışa Aktar</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-16">
                <div className="mx-auto h-16 w-16 bg-[#2b3139] rounded-full flex items-center justify-center mb-4">
                  <ClockIcon className="h-8 w-8 text-[#848e9c]" />
                </div>
                <h3 className="mt-2 text-base font-semibold text-white">İşlem bulunamadı</h3>
                <p className="mt-1 text-sm text-[#848e9c]">
                  {filterType === 'all' 
                    ? 'Henüz hiç işlem yapılmamış.' 
                    : `Bu filtrede işlem bulunamadı.`
                  }
                </p>
              </div>
            ) : (
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
                        Hisse
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
                        Miktar
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
                        Fiyat
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
                        Toplam
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">
                        Komisyon
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#1e2329] divide-y divide-[#2b3139]">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-[#161a1e] transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {formatShortDate(transaction.timestamp)}
                            </div>
                            <div className="text-xs text-[#848e9c]">
                              {formatDate(transaction.timestamp)}
                            </div>
                          </div>
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
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-[#0ecb81]/10 rounded-lg flex items-center justify-center">
                              <span className="text-xs font-bold text-[#0ecb81]">{transaction.symbol.slice(0,1)}</span>
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white">{transaction.name}</div>
                              <div className="text-xs text-[#848e9c]">{transaction.symbol}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-white">
                          {transaction.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 8 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          ₺{transaction.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-white">
                          ₺{transaction.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[#848e9c]">
                          ₺{transaction.commission.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
