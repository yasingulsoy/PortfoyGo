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
      console.log('Leaderboard result:', result); // Debug için
      if (result.success && result.leaderboard) {
        setLeaders(result.leaderboard);
        setError('');
      } else {
        console.error('Leaderboard error:', result);
        setError(result.message || 'Liderlik tablosu yüklenemedi');
      }
    } catch (err: any) {
      console.error('Leaderboard fetch error:', err);
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div className="h-10 w-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center shadow-sm mr-3">
              <TrophyIcon className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Liderlik Tablosu</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Genel Liderlik Tablosu</h2>
              <button
                onClick={loadLeaderboard}
                disabled={loading}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:text-gray-400 dark:disabled:text-gray-600 px-3 py-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              >
                {loading ? 'Yenileniyor...' : '🔄 Yenile'}
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
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Sıra</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Kullanıcı</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Kâr/Zarar</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Portföy Değeri</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Toplam Varlık</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {leaders.map((leader) => {
                    const totalAssets = leader.balance + leader.portfolio_value;
                    const isProfit = leader.profit_loss_percent >= 0;
                    return (
                      <tr key={leader.rank} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {leader.rank <= 3 ? (
                            <span className="text-2xl">
                              {leader.rank === 1 ? '🥇' : leader.rank === 2 ? '🥈' : '🥉'}
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">#{leader.rank}</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{leader.username}</td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                          <span className={`inline-flex items-center font-medium ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isProfit ? (
                              <ArrowUpIcon className="h-4 w-4 mr-1" />
                            ) : (
                              <ArrowDownIcon className="h-4 w-4 mr-1" />
                            )}
                            {leader.profit_loss_percent.toFixed(2)}%
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {isProfit ? '+' : ''}₺{leader.total_profit_loss.toLocaleString('tr-TR')}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                          ₺{leader.portfolio_value.toLocaleString('tr-TR')}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-indigo-600 dark:text-indigo-400">
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
