'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/backendApi';
import { 
  ChartBarIcon, 
  UsersIcon, 
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  BoltIcon,
  NoSymbolIcon,
  CheckBadgeIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalPortfolioValue: number;
  topUsers: Array<{
    id: string;
    username: string;
    email: string;
    balance: number;
    portfolio_value: number;
    total_profit_loss: number;
    rank: number;
  }>;
}

interface User {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  balance: number;
  portfolio_value: number;
  total_profit_loss: number;
  rank: number;
  created_at: string;
  last_login?: string;
  is_banned?: boolean;
  is_admin?: boolean;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [cacheRefreshing, setCacheRefreshing] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<{ stocks: number; cryptos: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
  const limit = 20;

  useEffect(() => {
    if (!authLoading) {
      if (user && user.is_admin) {
        loadStats();
        loadAllUsers();
        loadCacheStatus();
      } else {
        setLoading(false);
      }
    }
  }, [user, authLoading, page]);

  const loadCacheStatus = async () => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${API_BASE_URL}/stocks/cache-status`);
      const data = await res.json();
      if (data.success && data.data) {
        setCacheStatus({
          stocks: data.data.currentStocks || data.data.stocks || 0,
          cryptos: data.data.cryptos || 0
        });
      }
    } catch (err) {
      console.error('Cache status load error:', err);
    }
  };

  const handleRefreshCache = async () => {
    try {
      setCacheRefreshing(true);
      setError('');
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${API_BASE_URL}/stocks/refresh-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setError('');
        await loadCacheStatus();
      } else {
        setError(data.message || 'Cache yenileme başarısız');
      }
    } catch (err: any) {
      setError(err.message || 'Cache yenileme hatası');
    } finally {
      setCacheRefreshing(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await adminApi.getStats();
      if (result.success && result.stats) {
        setStats(result.stats);
      } else {
        setError('İstatistikler yüklenemedi');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Bir hata oluştu';
      setError(errorMessage);
      if (errorMessage.includes('admin yetkisi')) {
        window.location.href = '/';
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      setUsersLoading(true);
      setError('');
      const offset = (page - 1) * limit;
      const result = await adminApi.getUsers(limit, offset);
      if (result.success && result.users) {
        setAllUsers(result.users);
        setTotalUsers(result.total || 0);
      } else {
        setError('Kullanıcılar yüklenemedi');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Bir hata oluştu';
      setError(errorMessage);
      if (errorMessage.includes('admin yetkisi')) {
        window.location.href = '/';
      }
    } finally {
      setUsersLoading(false);
    }
  };

  const handleToggleBan = async (userId: string, currentBanStatus: boolean) => {
    try {
      const result = await adminApi.toggleUserBan(userId, !currentBanStatus);
      if (result.success) {
        setAllUsers(prevUsers =>
          prevUsers.map(u =>
            u.id === userId ? { ...u, is_banned: !currentBanStatus } : u
          )
        );
        setError('');
      } else {
        setError(result.message || 'İşlem başarısız');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    }
  };

  const filteredUsers = allUsers.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(totalUsers / limit);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#2b3139]" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#0ecb81] animate-spin" />
          </div>
          <p className="text-[#848e9c] text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!user.is_admin) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#f6465d]/10 flex items-center justify-center">
            <ShieldCheckIcon className="h-10 w-10 text-[#f6465d]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Erişim Reddedildi</h1>
          <p className="text-[#848e9c] mb-8">Bu sayfaya erişmek için admin yetkisi gereklidir.</p>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-xl transition-all font-semibold"
          >
            Ana Sayfaya Dön
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e11]">
      {/* Header */}
      <div className="border-b border-[#1e2329]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0ecb81] to-[#0ecb81]/60 flex items-center justify-center">
                <ShieldCheckIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Admin Paneli</h1>
                <p className="text-xs text-[#848e9c]">Sistem yönetimi</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {cacheStatus && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#1e2329] rounded-lg border border-[#2b3139]">
                  <BoltIcon className="h-4 w-4 text-[#f0b90b]" />
                  <span className="text-xs text-[#848e9c]">
                    <span className="text-white font-medium">{cacheStatus.stocks}</span> hisse
                    <span className="mx-1 text-[#2b3139]">|</span>
                    <span className="text-white font-medium">{cacheStatus.cryptos}</span> kripto
                  </span>
                </div>
              )}
              <button
                onClick={handleRefreshCache}
                disabled={cacheRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-[#1e2329] hover:bg-[#2b3139] border border-[#2b3139] text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-4 w-4 ${cacheRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{cacheRefreshing ? 'Yenileniyor...' : 'Cache Yenile'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-xl">
            <ExclamationTriangleIcon className="h-5 w-5 text-[#f6465d] flex-shrink-0" />
            <p className="text-sm text-[#f6465d] flex-1">{error}</p>
            <button onClick={loadStats} className="text-xs text-white bg-[#f6465d] hover:bg-[#f6465d]/80 px-3 py-1.5 rounded-lg transition-colors font-medium">
              Tekrar Dene
            </button>
          </div>
        )}

        {stats && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-[#1e2329] rounded-2xl p-5 border border-[#2b3139] hover:border-[#3b82f6]/30 transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/10 flex items-center justify-center group-hover:bg-[#3b82f6]/20 transition-colors">
                    <UsersIcon className="h-5 w-5 text-[#3b82f6]" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{stats.totalUsers}</p>
                <p className="text-xs text-[#848e9c] mt-1">Toplam Kullanıcı</p>
              </div>

              <div className="bg-[#1e2329] rounded-2xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0ecb81]/10 flex items-center justify-center group-hover:bg-[#0ecb81]/20 transition-colors">
                    <UsersIcon className="h-5 w-5 text-[#0ecb81]" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{stats.activeUsers}</p>
                <p className="text-xs text-[#848e9c] mt-1">Aktif Kullanıcı</p>
              </div>

              <div className="bg-[#1e2329] rounded-2xl p-5 border border-[#2b3139] hover:border-[#a855f7]/30 transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 flex items-center justify-center group-hover:bg-[#a855f7]/20 transition-colors">
                    <ChartBarIcon className="h-5 w-5 text-[#a855f7]" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{stats.totalTransactions.toLocaleString('tr-TR')}</p>
                <p className="text-xs text-[#848e9c] mt-1">Toplam İşlem</p>
              </div>

              <div className="bg-[#1e2329] rounded-2xl p-5 border border-[#2b3139] hover:border-[#f0b90b]/30 transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#f0b90b]/10 flex items-center justify-center group-hover:bg-[#f0b90b]/20 transition-colors">
                    <CurrencyDollarIcon className="h-5 w-5 text-[#f0b90b]" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">₺{stats.totalPortfolioValue.toLocaleString('tr-TR')}</p>
                <p className="text-xs text-[#848e9c] mt-1">Toplam Portföy</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 mb-6 bg-[#1e2329] p-1 rounded-xl border border-[#2b3139] w-fit">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'overview'
                    ? 'bg-[#2b3139] text-white'
                    : 'text-[#848e9c] hover:text-white'
                }`}
              >
                En İyi Kullanıcılar
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'users'
                    ? 'bg-[#2b3139] text-white'
                    : 'text-[#848e9c] hover:text-white'
                }`}
              >
                Tüm Kullanıcılar ({totalUsers})
              </button>
            </div>

            {/* Top Users Tab */}
            {activeTab === 'overview' && (
              <div className="bg-[#1e2329] rounded-2xl border border-[#2b3139] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#2b3139] bg-[#161a1e]">
                  <h2 className="text-base font-semibold text-white">En İyi 10 Kullanıcı</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-[#2b3139]">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Sıra</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kullanıcı</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Bakiye</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Portföy</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kâr/Zarar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topUsers.map((u) => {
                        const isProfit = u.total_profit_loss >= 0;
                        return (
                          <tr key={u.id} className="border-b border-[#2b3139]/50 hover:bg-[#161a1e] transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              {u.rank <= 3 ? (
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                                  u.rank === 1 ? 'bg-[#f0b90b]/10 text-[#f0b90b]' :
                                  u.rank === 2 ? 'bg-[#848e9c]/10 text-[#848e9c]' :
                                  'bg-[#cd7f32]/10 text-[#cd7f32]'
                                }`}>
                                  {u.rank}
                                </div>
                              ) : (
                                <span className="text-sm text-[#848e9c] font-medium pl-2">#{u.rank}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#0ecb81]/20 to-[#0ecb81]/5 flex items-center justify-center">
                                  <span className="text-sm font-bold text-[#0ecb81]">{u.username.charAt(0).toUpperCase()}</span>
                                </div>
                                <span className="text-sm font-medium text-white">{u.username}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[#848e9c]">{u.email}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-white">
                              ₺{u.balance.toLocaleString('tr-TR')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-white">
                              ₺{u.portfolio_value.toLocaleString('tr-TR')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <span className={`inline-flex items-center gap-1 text-sm font-semibold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                {isProfit ? <ArrowTrendingUpIcon className="h-4 w-4" /> : <ArrowTrendingDownIcon className="h-4 w-4" />}
                                {isProfit ? '+' : ''}₺{u.total_profit_loss.toLocaleString('tr-TR')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* All Users Tab */}
            {activeTab === 'users' && (
              <div className="bg-[#1e2329] rounded-2xl border border-[#2b3139] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#2b3139] bg-[#161a1e] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h2 className="text-base font-semibold text-white">Tüm Kullanıcılar</h2>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#848e9c]" />
                    <input
                      type="text"
                      placeholder="Kullanıcı ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 w-full sm:w-64 bg-[#0b0e11] border border-[#2b3139] rounded-xl text-white text-sm placeholder:text-[#848e9c] focus:outline-none focus:border-[#0ecb81] transition-colors"
                    />
                  </div>
                </div>

                {usersLoading ? (
                  <div className="p-16 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-[#0ecb81] animate-spin" />
                      <p className="text-sm text-[#848e9c]">Yükleniyor...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-[#2b3139]">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kullanıcı</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Durum</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Sıra</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Bakiye</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Portföy</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kâr/Zarar</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-[#848e9c] uppercase tracking-wider">Kayıt</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-[#848e9c] uppercase tracking-wider">İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-6 py-16 text-center">
                                <UsersIcon className="h-10 w-10 text-[#2b3139] mx-auto mb-3" />
                                <p className="text-[#848e9c] text-sm">Kullanıcı bulunamadı</p>
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((u) => {
                              const isProfit = u.total_profit_loss >= 0;
                              const isBanned = u.is_banned || false;
                              const isAdminUser = u.is_admin || false;
                              return (
                                <tr key={u.id} className={`border-b border-[#2b3139]/50 hover:bg-[#161a1e] transition-colors ${isBanned ? 'opacity-50' : ''}`}>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                                        isAdminUser 
                                          ? 'bg-gradient-to-br from-[#a855f7]/20 to-[#a855f7]/5' 
                                          : 'bg-gradient-to-br from-[#3b82f6]/20 to-[#3b82f6]/5'
                                      }`}>
                                        <span className={`text-sm font-bold ${isAdminUser ? 'text-[#a855f7]' : 'text-[#3b82f6]'}`}>
                                          {u.username.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-white">{u.username}</p>
                                        <p className="text-xs text-[#848e9c]">{u.email}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-1.5">
                                      {isAdminUser && (
                                        <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#a855f7]/10 text-[#a855f7]">
                                          <ShieldCheckIcon className="h-3 w-3" /> Admin
                                        </span>
                                      )}
                                      {u.email_verified ? (
                                        <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#0ecb81]/10 text-[#0ecb81]">
                                          <CheckBadgeIcon className="h-3 w-3" /> Doğrulanmış
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#f0b90b]/10 text-[#f0b90b]">
                                          <ClockIcon className="h-3 w-3" /> Beklemede
                                        </span>
                                      )}
                                      {isBanned && (
                                        <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#f6465d]/10 text-[#f6465d]">
                                          <NoSymbolIcon className="h-3 w-3" /> Yasaklı
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-[#848e9c]">
                                    #{u.rank || '-'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-white">
                                    ₺{u.balance.toLocaleString('tr-TR')}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-white">
                                    ₺{u.portfolio_value.toLocaleString('tr-TR')}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                      {isProfit ? <ArrowTrendingUpIcon className="h-3.5 w-3.5" /> : <ArrowTrendingDownIcon className="h-3.5 w-3.5" />}
                                      {isProfit ? '+' : ''}₺{u.total_profit_loss.toLocaleString('tr-TR')}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#848e9c]">
                                    {new Date(u.created_at).toLocaleDateString('tr-TR')}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {!isAdminUser && (
                                      <button
                                        onClick={() => handleToggleBan(u.id, isBanned)}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                          isBanned
                                            ? 'bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20'
                                            : 'bg-[#f6465d]/10 text-[#f6465d] hover:bg-[#f6465d]/20'
                                        }`}
                                      >
                                        {isBanned ? 'Yasağı Kaldır' : 'Yasakla'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="px-6 py-4 border-t border-[#2b3139] flex items-center justify-between">
                        <span className="text-sm text-[#848e9c]">
                          Sayfa <span className="text-white font-medium">{page}</span> / {totalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-[#0b0e11] border border-[#2b3139] text-white rounded-lg hover:bg-[#2b3139] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeftIcon className="h-4 w-4" />
                            Önceki
                          </button>
                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1 px-4 py-2 text-sm font-medium bg-[#0b0e11] border border-[#2b3139] text-white rounded-lg hover:bg-[#2b3139] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            Sonraki
                            <ChevronRightIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
