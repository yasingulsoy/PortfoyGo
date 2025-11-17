'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { badgesApi, activityLogsApi } from '@/services/backendApi';
import { 
  TrophyIcon,
  UserIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ShoppingCartIcon,
  BanknotesIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: Date;
}

interface ActivityLog {
  id: string;
  activity_type: string;
  description: string;
  metadata?: any;
  created_at: string;
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (!authLoading && user) {
      loadBadges();
      loadActivityTypes();
      loadActivityLogs();
    }
  }, [user, authLoading, selectedType, page]);

  const loadBadges = async () => {
    try {
      const result = await badgesApi.getMyBadges();
      if (result.success && result.badges) {
        setBadges(result.badges.map((b: any) => ({
          ...b.badge,
          earned_at: new Date(b.earned_at)
        })));
        setError('');
      } else {
        setError('Rozetler yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const loadActivityTypes = async () => {
    try {
      const result = await activityLogsApi.getTypes();
      if (result.success && result.types) {
        setActivityTypes(result.types);
      }
    } catch (err) {
      console.error('Activity types error:', err);
    }
  };

  const loadActivityLogs = async () => {
    try {
      setLogsLoading(true);
      const offset = (page - 1) * limit;
      const result = await activityLogsApi.getLogs(limit, offset, selectedType || undefined);
      if (result.success) {
        setActivityLogs(result.logs);
        setTotalLogs(result.total);
      }
    } catch (err: any) {
      console.error('Activity logs error:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'buy':
        return <ArrowTrendingUpIcon className="h-5 w-5 text-[#0ecb81]" />;
      case 'sell':
        return <ArrowTrendingDownIcon className="h-5 w-5 text-[#f6465d]" />;
      case 'login':
        return <UserIcon className="h-5 w-5 text-[#0ecb81]" />;
      case 'logout':
        return <UserIcon className="h-5 w-5 text-[#848e9c]" />;
      default:
        return <ClockIcon className="h-5 w-5 text-[#848e9c]" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#181a20] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0ecb81]"></div>
          <p className="mt-4 text-[#848e9c]">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const groupedBadges = badges.reduce((acc: { [key: string]: Badge[] }, badge) => {
    if (!acc[badge.category]) {
      acc[badge.category] = [];
    }
    acc[badge.category].push(badge);
    return acc;
  }, {});

  const totalPages = Math.ceil(totalLogs / limit);

  return (
    <div className="min-h-screen bg-[#181a20]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Kullanıcı Bilgileri Kartı */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] mb-8 overflow-hidden">
          <div className="bg-[#0ecb81]/10 px-6 py-8 border-b border-[#2b3139]">
            <div className="flex items-center space-x-6">
              <div className="h-24 w-24 bg-[#0ecb81]/20 rounded-full flex items-center justify-center border-2 border-[#0ecb81]">
                <span className="text-4xl font-bold text-[#0ecb81]">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 text-white">
                <h1 className="text-3xl font-bold mb-2">{user.username}</h1>
                <p className="text-[#848e9c] mb-4">{user.email}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center bg-[#2b3139] rounded-lg px-4 py-2">
                    <TrophyIcon className="h-5 w-5 mr-2 text-[#f0b90b]" />
                    <span className="font-semibold text-white">Sıra: #{user.rank || '-'}</span>
                  </div>
                  <div className="flex items-center bg-[#2b3139] rounded-lg px-4 py-2">
                    <CurrencyDollarIcon className="h-5 w-5 mr-2 text-[#0ecb81]" />
                    <span className="font-semibold text-white">₺{user.balance?.toLocaleString('tr-TR') || '0'}</span>
                  </div>
                  <div className="flex items-center bg-[#2b3139] rounded-lg px-4 py-2">
                    <CalendarIcon className="h-5 w-5 mr-2 text-[#848e9c]" />
                    <span className="text-white">{new Date(user.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Kolon - Rozetler */}
          <div className="lg:col-span-1">
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139]">
              <div className="px-6 py-4 border-b border-[#2b3139] bg-[#161a1e]">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <TrophyIcon className="h-6 w-6 mr-2 text-[#f0b90b]" />
                  Rozetlerim ({badges.length})
                </h2>
              </div>

              {error ? (
                <div className="p-6 text-center">
                  <p className="text-[#f6465d]">{error}</p>
                  <button
                    onClick={loadBadges}
                    className="mt-4 px-4 py-2 bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-lg transition-colors font-semibold"
                  >
                    Tekrar Dene
                  </button>
                </div>
              ) : badges.length === 0 ? (
                <div className="p-12 text-center">
                  <TrophyIcon className="mx-auto h-12 w-12 text-[#848e9c]" />
                  <h3 className="mt-2 text-sm font-semibold text-white">Henüz rozet yok</h3>
                  <p className="mt-1 text-sm text-[#848e9c]">
                    İşlem yaparak rozetler kazanmaya başlayın!
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  {Object.entries(groupedBadges).map(([category, categoryBadges]) => (
                    <div key={category} className="mb-6">
                      <h3 className="text-xs font-semibold text-[#848e9c] uppercase mb-3">
                        {category === 'transaction' ? 'İşlem Rozetleri' :
                         category === 'profit' ? 'Kâr Rozetleri' :
                         category === 'portfolio' ? 'Portföy Rozetleri' :
                         category === 'daily' ? 'Günlük Rozetler' :
                         category === 'risk' ? 'Risk Rozetleri' :
                         category === 'patience' ? 'Sabır Rozetleri' :
                         category === 'diversity' ? 'Çeşitlilik Rozetleri' :
                         category}
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {categoryBadges.map((badge) => (
                          <div
                            key={badge.id}
                            className="bg-[#161a1e] rounded-lg p-4 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all"
                          >
                            <div className="text-3xl text-center mb-2">{badge.icon}</div>
                            <div className="text-xs font-semibold text-white text-center mb-1">
                              {badge.name}
                            </div>
                            <div className="text-xs text-[#848e9c] text-center">
                              {badge.earned_at.toLocaleDateString('tr-TR')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sağ Kolon - Aktivite Logları */}
          <div className="lg:col-span-2">
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139]">
              <div className="px-6 py-4 border-b border-[#2b3139] bg-[#161a1e] flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <ClockIcon className="h-6 w-6 mr-2 text-[#0ecb81]" />
                  Aktivite Logları ({totalLogs})
                </h2>
                {activityTypes.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <FunnelIcon className="h-5 w-5 text-[#848e9c]" />
                    <select
                      value={selectedType}
                      onChange={(e) => {
                        setSelectedType(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 text-sm border border-[#2b3139] rounded-lg bg-[#1e2329] text-white focus:outline-none focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] transition-colors"
                    >
                      <option value="">Tümü</option>
                      {activityTypes.map((type) => (
                        <option key={type} value={type}>
                          {type === 'buy' ? 'Alış' :
                           type === 'sell' ? 'Satış' :
                           type === 'login' ? 'Giriş' :
                           type === 'logout' ? 'Çıkış' :
                           type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-6">
                {logsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0ecb81]"></div>
                    <p className="mt-4 text-[#848e9c]">Yükleniyor...</p>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <ClockIcon className="mx-auto h-12 w-12 text-[#848e9c]" />
                    <h3 className="mt-2 text-sm font-semibold text-white">Henüz aktivite yok</h3>
                    <p className="mt-1 text-sm text-[#848e9c]">
                      İşlem yaptıkça aktivite logları burada görünecek.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {activityLogs.map((log) => {
                        const activityColors = {
                          buy: 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]',
                          sell: 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]',
                          login: 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]',
                          logout: 'bg-[#2b3139] border-[#2b3139] text-[#848e9c]'
                        };
                        return (
                          <div
                            key={log.id}
                            className={`flex items-start space-x-4 p-4 rounded-lg border ${activityColors[log.activity_type as keyof typeof activityColors] || 'bg-[#2b3139] border-[#2b3139] text-[#848e9c]'} transition-all hover:bg-[#161a1e]`}
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              {getActivityIcon(log.activity_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white">{log.description}</p>
                              {log.metadata && (
                                <div className="mt-1 text-xs text-[#848e9c]">
                                  {log.metadata.symbol && (
                                    <span className="mr-2">Sembol: {log.metadata.symbol}</span>
                                  )}
                                  {log.metadata.quantity && (
                                    <span className="mr-2">Miktar: {log.metadata.quantity}</span>
                                  )}
                                  {log.metadata.price && (
                                    <span>Fiyat: ₺{log.metadata.price.toLocaleString('tr-TR')}</span>
                                  )}
                                </div>
                              )}
                              <p className="text-xs mt-1 text-[#848e9c]">{formatDate(log.created_at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="mt-6 flex items-center justify-between">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-4 py-2 text-sm font-semibold text-white bg-[#2b3139] border border-[#2b3139] rounded-lg hover:bg-[#3a4149] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Önceki
                        </button>
                        <span className="text-sm text-[#848e9c]">
                          Sayfa {page} / {totalPages}
                        </span>
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="px-4 py-2 text-sm font-semibold text-white bg-[#2b3139] border border-[#2b3139] rounded-lg hover:bg-[#3a4149] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Sonraki
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
