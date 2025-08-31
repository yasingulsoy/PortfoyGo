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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <ClockIcon className="h-8 w-8 text-indigo-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">İşlem Geçmişi</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Toplam İşlem</p>
              <p className="text-2xl font-bold text-gray-900">{state.transactions.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Toplam Alım</p>
              <p className="text-2xl font-bold text-green-600">₺{getTotalBuyAmount().toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Toplam Satım</p>
              <p className="text-2xl font-bold text-red-600">₺{getTotalSellAmount().toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Toplam Komisyon</p>
              <p className="text-2xl font-bold text-gray-900">₺{getTotalCommission().toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="bg-white rounded-xl shadow-sm border mb-8">
          <div className="p-6 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h2 className="text-lg font-semibold text-gray-900">İşlem Detayları</h2>
              
              <div className="flex items-center space-x-4">
                {/* Filter */}
                <div className="flex items-center space-x-2">
                  <FunnelIcon className="h-5 w-5 text-gray-400" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as 'all' | 'buy' | 'sell')}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="date">Tarihe Göre</option>
                    <option value="amount">Tutara Göre</option>
                    <option value="symbol">Sembole Göre</option>
                  </select>
                  
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>

                {/* Export */}
                <button
                  onClick={exportTransactions}
                  className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span className="text-sm">Dışa Aktar</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">İşlem bulunamadı</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {filterType === 'all' 
                    ? 'Henüz hiç işlem yapılmamış.' 
                    : `Bu filtrede işlem bulunamadı.`
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tarih
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        İşlem
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Hisse
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Miktar
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fiyat
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Toplam
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Komisyon
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {formatShortDate(transaction.timestamp)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(transaction.timestamp)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            transaction.type === 'buy' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {transaction.type === 'buy' ? 'Alım' : 'Satım'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{transaction.name}</div>
                            <div className="text-sm text-gray-500">{transaction.symbol}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {transaction.quantity.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ₺{transaction.price.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ₺{transaction.totalAmount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ₺{transaction.commission.toLocaleString()}
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
