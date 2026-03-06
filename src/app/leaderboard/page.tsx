'use client';

import { useState, useEffect } from 'react';
import {
  TrophyIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const result = await leaderboardApi.getLeaderboard(50);
      if (result.success && result.leaderboard) {
        setLeaders(result.leaderboard);
        setError('');
      } else {
        setError(result.message || 'Liderlik tablosu yuklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata olustu');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-[#f0b90b] animate-spin" />
      </div>
    );
  }

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { bg: 'bg-[#f0b90b]/10', border: 'border-[#f0b90b]/30', text: 'text-[#f0b90b]', ring: 'ring-[#f0b90b]/20' };
    if (rank === 2) return { bg: 'bg-[#848e9c]/10', border: 'border-[#848e9c]/30', text: 'text-[#c0c0c0]', ring: 'ring-[#848e9c]/20' };
    if (rank === 3) return { bg: 'bg-[#cd7f32]/10', border: 'border-[#cd7f32]/30', text: 'text-[#cd7f32]', ring: 'ring-[#cd7f32]/20' };
    return { bg: 'bg-[#1e2329]', border: 'border-[#2b3139]', text: 'text-[#848e9c]', ring: '' };
  };

  return (
    <div className="min-h-screen bg-[#0b0e11]">
      {/* Header */}
      <div className="border-b border-[#1e2329]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f0b90b] to-[#f0b90b]/60 flex items-center justify-center">
                <TrophyIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Liderlik Tablosu</h1>
                <p className="text-xs text-[#848e9c]">En iyi yatirimcilar</p>
              </div>
            </div>
            <button
              onClick={loadLeaderboard}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#1e2329] hover:bg-[#2b3139] border border-[#2b3139] text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && leaders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-full border-2 border-transparent border-t-[#f0b90b] animate-spin mb-4" />
            <p className="text-sm text-[#848e9c]">Yukleniyor...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-[#f6465d]/10 flex items-center justify-center mb-4">
              <TrophyIcon className="h-8 w-8 text-[#f6465d]" />
            </div>
            <p className="text-[#f6465d] text-sm mb-4">{error}</p>
            <button
              onClick={loadLeaderboard}
              className="px-6 py-2.5 bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-xl transition-all font-semibold text-sm"
            >
              Tekrar Dene
            </button>
          </div>
        ) : leaders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-[#f0b90b]/10 flex items-center justify-center mb-4">
              <TrophyIcon className="h-8 w-8 text-[#f0b90b]" />
            </div>
            <p className="text-[#848e9c]">Henuz lider yok</p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
              {[2, 1, 3].map((targetRank) => {
                const leader = leaders.find(l => l.rank === targetRank);
                if (!leader) return <div key={targetRank} />;
                const style = getRankStyle(leader.rank);
                const isProfit = leader.profit_loss_percent >= 0;
                const totalAssets = leader.balance + leader.portfolio_value;
                return (
                  <div
                    key={leader.rank}
                    className={`relative rounded-2xl border ${style.border} ${style.bg} p-4 sm:p-6 flex flex-col items-center text-center transition-all hover:scale-[1.02] ${
                      leader.rank === 1 ? 'sm:-mt-4' : ''
                    }`}
                  >
                    {/* Rank Badge */}
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${style.bg} border ${style.border} flex items-center justify-center mb-3`}>
                      <span className={`text-lg sm:text-xl font-bold ${style.text}`}>{leader.rank}</span>
                    </div>

                    {/* Avatar */}
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#2b3139] to-[#1e2329] flex items-center justify-center mb-3 ring-2 ${style.ring}`}>
                      <span className={`text-xl sm:text-2xl font-bold ${style.text}`}>
                        {leader.username.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <p className="text-sm sm:text-base font-bold text-white mb-1 truncate w-full">{leader.username}</p>

                    <span className={`inline-flex items-center gap-1 text-xs sm:text-sm font-semibold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {isProfit ? <ArrowTrendingUpIcon className="h-3.5 w-3.5" /> : <ArrowTrendingDownIcon className="h-3.5 w-3.5" />}
                      {isProfit ? '+' : ''}{leader.profit_loss_percent.toFixed(2)}%
                    </span>

                    <div className="mt-3 pt-3 border-t border-[#2b3139]/50 w-full space-y-1">
                      <div className="flex justify-between text-[10px] sm:text-xs">
                        <span className="text-[#848e9c]">Toplam</span>
                        <span className="text-white font-medium">
                          {totalAssets.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TL
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full Table */}
            <div className="bg-[#1e2329] rounded-2xl border border-[#2b3139] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#2b3139] bg-[#161a1e]">
                <h2 className="text-base font-semibold text-white">Genel Siralama</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-[#2b3139]">
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider w-16">Sira</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kullanici</th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kar/Zarar</th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider hidden sm:table-cell">Portfoy</th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Toplam Varlik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaders.map((leader) => {
                      const totalAssets = leader.balance + leader.portfolio_value;
                      const isProfit = leader.profit_loss_percent >= 0;
                      const style = getRankStyle(leader.rank);
                      return (
                        <tr key={leader.rank} className="border-b border-[#2b3139]/50 hover:bg-[#161a1e] transition-colors">
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            {leader.rank <= 3 ? (
                              <div className={`w-8 h-8 rounded-lg ${style.bg} border ${style.border} flex items-center justify-center`}>
                                <span className={`text-sm font-bold ${style.text}`}>{leader.rank}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-[#848e9c] font-medium pl-2">#{leader.rank}</span>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2b3139] to-[#1e2329] flex items-center justify-center">
                                <span className="text-sm font-bold text-[#0ecb81]">{leader.username.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="text-sm font-medium text-white">{leader.username}</span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className={`inline-flex items-center gap-1 text-sm font-semibold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                {isProfit ? <ArrowTrendingUpIcon className="h-3.5 w-3.5" /> : <ArrowTrendingDownIcon className="h-3.5 w-3.5" />}
                                {isProfit ? '+' : ''}{leader.profit_loss_percent.toFixed(2)}%
                              </span>
                              <span className={`text-xs ${isProfit ? 'text-[#0ecb81]/70' : 'text-[#f6465d]/70'}`}>
                                {isProfit ? '+' : ''}{leader.total_profit_loss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-white hidden sm:table-cell">
                            {leader.portfolio_value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-sm font-bold text-[#f0b90b]">
                              {totalAssets.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
