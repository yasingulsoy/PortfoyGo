'use client';

import { useState } from 'react';
import { TrophyIcon, ArrowUpIcon } from '@heroicons/react/24/outline';

interface Leader {
  rank: number;
  username: string;
  profitPercent: number;
  portfolioValue: number;
}

const weeklyLeaders: Leader[] = [
  { rank: 1, username: 'Ahmet Yılmaz', profitPercent: 12.4, portfolioValue: 11240 },
  { rank: 2, username: 'Ayşe Demir', profitPercent: 9.8, portfolioValue: 10980 },
  { rank: 3, username: 'Mehmet Kaya', profitPercent: 7.1, portfolioValue: 10710 },
  { rank: 4, username: 'Zeynep Koç', profitPercent: 5.2, portfolioValue: 10520 },
  { rank: 5, username: 'Can Aydın', profitPercent: 4.7, portfolioValue: 10470 },
];

const monthlyLeaders: Leader[] = [
  { rank: 1, username: 'Elif Şimşek', profitPercent: 28.9, portfolioValue: 12890 },
  { rank: 2, username: 'Kemal Aras', profitPercent: 22.3, portfolioValue: 12230 },
  { rank: 3, username: 'Deniz Uçar', profitPercent: 18.6, portfolioValue: 11860 },
  { rank: 4, username: 'Bora Çetin', profitPercent: 16.1, portfolioValue: 11610 },
  { rank: 5, username: 'Ece Kaplan', profitPercent: 15.4, portfolioValue: 11540 },
];

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');
  const data = activeTab === 'weekly' ? weeklyLeaders : monthlyLeaders;

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
          {/* Tabs */}
          <div className="border-b px-4 sm:px-6">
            <nav className="flex space-x-6">
              <button
                onClick={() => setActiveTab('weekly')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'weekly'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Haftalık
              </button>
              <button
                onClick={() => setActiveTab('monthly')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'monthly'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Aylık
              </button>
            </nav>
          </div>

          {/* Table */}
          <div className="p-4 sm:p-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Sıra</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Kullanıcı</th>
                  <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Kâr Oranı</th>
                  <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Portföy Değeri</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((row) => (
                  <tr key={row.rank} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{row.rank}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.username}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                      <span className="inline-flex items-center text-green-600 font-medium">
                        <ArrowUpIcon className="h-4 w-4 mr-1" />
                        {row.profitPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">₺{row.portfolioValue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
