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
    <div className="min-h-screen bg-[#181a20]">
      <div className="bg-[#1e2329] border-b border-[#2b3139]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div className="p-2 bg-[#f0b90b]/10 rounded-lg mr-3">
              <TrophyIcon className="h-6 w-6 text-[#f0b90b]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Liderlik Tablosu</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139]">
          {/* Header */}
          <div className="border-b border-[#2b3139] px-4 sm:px-6 py-4 bg-[#161a1e]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Genel Liderlik Tablosu</h2>
              <button
                onClick={loadLeaderboard}
                disabled={loading}
                className="text-sm text-[#0ecb81] hover:text-[#0bb975] disabled:text-[#848e9c] px-3 py-1 rounded-lg hover:bg-[#0ecb81]/10 transition-colors font-semibold"
              >
                {loading ? 'Yenileniyor...' : '🔄 Yenile'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="p-4 sm:p-6 overflow-x-auto">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0ecb81]"></div>
                <p className="mt-4 text-sm text-[#848e9c]">Yükleniyor...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-[#f6465d]">{error}</p>
                <button
                  onClick={loadLeaderboard}
                  className="mt-4 px-4 py-2 bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-lg transition-colors font-semibold"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : leaders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#848e9c]">Henüz lider yok</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-[#2b3139]">
                <thead className="bg-[#161a1e]">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Sıra</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kullanıcı</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kâr/Zarar</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Portföy Değeri</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Toplam Varlık</th>
                  </tr>
                </thead>
                <tbody className="bg-[#1e2329] divide-y divide-[#2b3139]">
                  {leaders.map((leader) => {
                    const totalAssets = leader.balance + leader.portfolio_value;
                    const isProfit = leader.profit_loss_percent >= 0;
                    return (
                      <tr key={leader.rank} className="hover:bg-[#161a1e] transition-colors">
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-white">
                          {leader.rank <= 3 ? (
                            <span className="text-2xl">
                              {leader.rank === 1 ? '🥇' : leader.rank === 2 ? '🥈' : '🥉'}
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-[#2b3139] rounded text-white">#{leader.rank}</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-white">{leader.username}</td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                          <span className={`inline-flex items-center font-semibold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                            {isProfit ? (
                              <ArrowUpIcon className="h-4 w-4 mr-1" />
                            ) : (
                              <ArrowDownIcon className="h-4 w-4 mr-1" />
                            )}
                            {leader.profit_loss_percent.toFixed(2)}%
                          </span>
                          <div className={`text-xs ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                            {isProfit ? '+' : ''}₺{leader.total_profit_loss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-white">
                          ₺{leader.portfolio_value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-[#0ecb81]">
                          ₺{totalAssets.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
