'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { badgesApi } from '@/services/backendApi';
import { 
  TrophyIcon,
  UserIcon,
  CalendarIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: Date;
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user) {
      loadBadges();
    }
  }, [user, authLoading, router]);

  const loadBadges = async () => {
    try {
      setLoading(true);
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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Yükleniyor...</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <UserIcon className="h-8 w-8 text-indigo-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">Profilim</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Kullanıcı Bilgileri */}
        <div className="bg-white rounded-xl shadow-sm border mb-8">
          <div className="p-6">
            <div className="flex items-center space-x-6">
              <div className="h-20 w-20 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-3xl font-bold text-indigo-600">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900">{user.username}</h2>
                <p className="text-gray-500">{user.email}</p>
                <div className="flex items-center space-x-4 mt-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <TrophyIcon className="h-4 w-4 mr-1" />
                    Sıra: #{user.rank || '-'}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                    Bakiye: ₺{user.balance?.toLocaleString('tr-TR') || '0'}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {new Date(user.created_at).toLocaleDateString('tr-TR')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rozetler */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              Rozetlerim ({badges.length})
            </h2>
          </div>

          {error ? (
            <div className="p-6 text-center">
              <p className="text-red-600">{error}</p>
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
              <h3 className="mt-2 text-sm font-medium text-gray-900">Henüz rozet yok</h3>
              <p className="mt-1 text-sm text-gray-500">
                İşlem yaparak rozetler kazanmaya başlayın!
              </p>
            </div>
          ) : (
            <div className="p-6">
              {Object.entries(groupedBadges).map(([category, categoryBadges]) => (
                <div key={category} className="mb-8">
                  <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">
                    {category === 'transaction' ? 'İşlem Rozetleri' :
                     category === 'profit' ? 'Kâr Rozetleri' :
                     category === 'portfolio' ? 'Portföy Rozetleri' :
                     category === 'daily' ? 'Günlük Rozetler' :
                     category === 'risk' ? 'Risk Rozetleri' :
                     category === 'patience' ? 'Sabır Rozetleri' :
                     category === 'diversity' ? 'Çeşitlilik Rozetleri' :
                     category}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {categoryBadges.map((badge) => (
                      <div
                        key={badge.id}
                        className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200 hover:shadow-md transition-shadow"
                      >
                        <div className="text-4xl text-center mb-2">{badge.icon}</div>
                        <div className="text-sm font-semibold text-gray-900 text-center mb-1">
                          {badge.name}
                        </div>
                        <div className="text-xs text-gray-600 text-center mb-2">
                          {badge.description}
                        </div>
                        <div className="text-xs text-gray-400 text-center">
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
    </div>
  );
}

