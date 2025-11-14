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
        return <ArrowTrendingUpIcon className="h-5 w-5 text-green-500" />;
      case 'sell':
        return <ArrowTrendingDownIcon className="h-5 w-5 text-red-500" />;
      case 'login':
        return <UserIcon className="h-5 w-5 text-blue-500" />;
      case 'logout':
        return <UserIcon className="h-5 w-5 text-gray-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'buy':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'sell':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'login':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'logout':
        return 'bg-gray-50 border-gray-200 text-gray-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Yükleniyor...</p>
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Kullanıcı Bilgileri Kartı */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-8">
            <div className="flex items-center space-x-6">
              <div className="h-24 w-24 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 text-white">
                <h1 className="text-3xl font-bold mb-2">{user.username}</h1>
                <p className="text-indigo-100 mb-4">{user.email}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                    <TrophyIcon className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Sıra: #{user.rank || '-'}</span>
                  </div>
                  <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                    <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                    <span className="font-semibold">₺{user.balance?.toLocaleString('tr-TR') || '0'}</span>
                  </div>
                  <div className="flex items-center bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    <span>{new Date(user.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sol Kolon - Rozetler */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                  <TrophyIcon className="h-6 w-6 mr-2 text-yellow-500" />
                  Rozetlerim ({badges.length})
                </h2>
              </div>

              {error ? (
                <div className="p-6 text-center">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                  <button
                    onClick={loadBadges}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Tekrar Dene
                  </button>
                </div>
              ) : badges.length === 0 ? (
                <div className="p-12 text-center">
                  <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Henüz rozet yok</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    İşlem yaparak rozetler kazanmaya başlayın!
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  {Object.entries(groupedBadges).map(([category, categoryBadges]) => (
                    <div key={category} className="mb-6">
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">
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
                            className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-700 dark:to-gray-600 rounded-lg p-4 border border-indigo-200 dark:border-gray-600 hover:shadow-md transition-shadow"
                          >
                            <div className="text-3xl text-center mb-2">{badge.icon}</div>
                            <div className="text-xs font-semibold text-gray-900 dark:text-white text-center mb-1">
                              {badge.name}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                  <ClockIcon className="h-6 w-6 mr-2 text-indigo-500" />
                  Aktivite Logları ({totalLogs})
                </h2>
                {activityTypes.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <FunnelIcon className="h-5 w-5 text-gray-400" />
                    <select
                      value={selectedType}
                      onChange={(e) => {
                        setSelectedType(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Yükleniyor...</p>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Henüz aktivite yok</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      İşlem yaptıkça aktivite logları burada görünecek.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {activityLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-start space-x-4 p-4 rounded-lg border ${getActivityColor(log.activity_type)} transition-all hover:shadow-md`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {getActivityIcon(log.activity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{log.description}</p>
                            {log.metadata && (
                              <div className="mt-1 text-xs opacity-75">
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
                            <p className="text-xs mt-1 opacity-60">{formatDate(log.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="mt-6 flex items-center justify-between">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Önceki
                        </button>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Sayfa {page} / {totalPages}
                        </span>
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
