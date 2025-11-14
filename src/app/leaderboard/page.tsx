'use client';

import { useState, useEffect } from 'react';
import { TrophyIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { leaderboardApi } from '@/services/backendApi';

interface Leader {
  rank: number;
  username: string;
  profit_loss_percent: number;
  portfolio_value: number;
  total_profit_loss: number;
  balance: number;
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLeaderboard();
    // Her 30 saniyede bir güncelle
    const interval = setInterval(loadLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const result = await leaderboardApi.getLeaderboard(10);
      if (result.success && result.leaderboard) {
        setLeaders(result.leaderboard);
        setError('');
      } else {
        setError('Liderlik tablosu yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <TrophyIcon className="h-8 w-8 text-purple-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">Liderlik Tablosu</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm border">
          {/* Header */}
          <div className="border-b px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Genel Liderlik Tablosu</h2>
              <button
                onClick={loadLeaderboard}
                disabled={loading}
                className="text-sm text-indigo-600 hover:text-indigo-700 disabled:text-gray-400"
              >
                {loading ? 'Yenileniyor...' : 'Yenile'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="p-4 sm:p-6 overflow-x-auto">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-4 text-sm text-gray-500">Yükleniyor...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600">{error}</p>
                <button
                  onClick={loadLeaderboard}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : leaders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Henüz lider yok</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Sıra</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Kullanıcı</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Kâr/Zarar</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Portföy Değeri</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam Varlık</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaders.map((leader) => {
                    const totalAssets = leader.balance + leader.portfolio_value;
                    const isProfit = leader.profit_loss_percent >= 0;
                    return (
                      <tr key={leader.rank} className="hover:bg-gray-50">
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {leader.rank <= 3 ? (
                            <span className="text-2xl">
                              {leader.rank === 1 ? '🥇' : leader.rank === 2 ? '🥈' : '🥉'}
                            </span>
                          ) : (
                            `#${leader.rank}`
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{leader.username}</td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                          <span className={`inline-flex items-center font-medium ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                            {isProfit ? (
                              <ArrowUpIcon className="h-4 w-4 mr-1" />
                            ) : (
                              <ArrowDownIcon className="h-4 w-4 mr-1" />
                            )}
                            {leader.profit_loss_percent.toFixed(2)}%
                          </span>
                          <div className="text-xs text-gray-500">
                            {isProfit ? '+' : ''}₺{leader.total_profit_loss.toLocaleString('tr-TR')}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          ₺{leader.portfolio_value.toLocaleString('tr-TR')}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-indigo-600">
                          ₺{totalAssets.toLocaleString('tr-TR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
