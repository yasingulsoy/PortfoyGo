'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { newsApi } from '@/services/backendApi';
import { NewspaperIcon, ClockIcon, TagIcon, ArrowTopRightOnSquareIcon, ChartBarSquareIcon } from '@heroicons/react/24/outline';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  creator: string;
  categories: string[];
  description: string;
  image?: string | null;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Az önce';
  if (diffMin < 60) return `${diffMin} dakika önce`;
  if (diffHour < 24) return `${diffHour} saat önce`;
  if (diffDay < 7) return `${diffDay} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function NewsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setNewsLoading(true);
        const result = await newsApi.getNews(20);
        if (result.success) {
          setNews(result.data);
        }
      } catch (err: any) {
        setError(err.message || 'Haberler yüklenirken bir hata oluştu');
      } finally {
        setNewsLoading(false);
      }
    };

    if (user) {
      fetchNews();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-2 border-[#2b3139] border-t-[#0ecb81] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <ChartBarSquareIcon className="h-6 w-6 text-[#0ecb81]" />
            </div>
          </div>
          <p className="mt-4 text-[#848e9c] text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0b0e11]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <section className="relative overflow-hidden rounded-2xl border border-[#2b3139]/60 p-6 sm:p-8 bg-gradient-to-br from-[#141720] via-[#1a1e28] to-[#1a1418]">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-[#f0b90b]/[0.06] rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#0ecb81]/[0.04] rounded-full blur-[80px] pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-[#f0b90b]/10 rounded-xl flex items-center justify-center border border-[#f0b90b]/20">
                <NewspaperIcon className="h-5 w-5 text-[#f0b90b]" />
              </div>
              <div>
                <p className="text-[#848e9c] text-xs uppercase tracking-widest">Ekonomi & Finans</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Haberler</h1>
              </div>
            </div>
            <p className="text-[#5a6270] text-sm mt-2">
              BS Ekonomi&apos;den güncel ekonomi, finans ve piyasa haberleri
            </p>
          </div>
        </section>

        {/* News List */}
        {newsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 p-5 animate-pulse">
                <div className="h-4 bg-[#2b3139] rounded w-3/4 mb-3" />
                <div className="h-3 bg-[#2b3139] rounded w-full mb-2" />
                <div className="h-3 bg-[#2b3139] rounded w-2/3 mb-4" />
                <div className="flex gap-2">
                  <div className="h-5 bg-[#2b3139] rounded-full w-16" />
                  <div className="h-5 bg-[#2b3139] rounded-full w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-[#1a1d24] rounded-2xl border border-[#f6465d]/30 p-8 text-center">
            <NewspaperIcon className="h-12 w-12 text-[#f6465d] mx-auto mb-3" />
            <p className="text-[#f6465d] font-semibold mb-1">Haberler Yüklenemedi</p>
            <p className="text-[#5a6270] text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Featured (first item) */}
            {news.length > 0 && (
              <a
                href={news[0].link}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 hover:border-[#f0b90b]/40 transition-all p-6 sm:p-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2.5 py-1 bg-[#f0b90b]/10 text-[#f0b90b] text-[10px] font-bold uppercase tracking-wider rounded-md">
                      Son Dakika
                    </span>
                    <span className="text-[#5a6270] text-xs flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {timeAgo(news[0].pubDate)}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white group-hover:text-[#f0b90b] transition-colors mb-3 leading-tight">
                    {news[0].title}
                  </h2>
                  <p className="text-[#848e9c] text-sm leading-relaxed line-clamp-3 mb-4">
                    {news[0].description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {news[0].categories.slice(0, 3).map((cat) => (
                        <span key={cat} className="px-2 py-0.5 bg-[#2b3139] text-[#848e9c] text-[10px] rounded-md font-medium">
                          {cat}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-[#0ecb81] text-xs font-semibold flex-shrink-0">
                      <span>Devamını Oku</span>
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </a>
            )}

            {/* Other news */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {news.slice(1).map((item, idx) => (
                <a
                  key={idx}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 hover:border-[#0ecb81]/30 transition-all p-5 h-full flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[#5a6270] text-[11px] flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {timeAgo(item.pubDate)}
                      </span>
                      {item.creator && (
                        <span className="text-[#5a6270] text-[11px]">• {item.creator}</span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#eaecef] group-hover:text-[#0ecb81] transition-colors mb-2 leading-snug line-clamp-2 flex-shrink-0">
                      {item.title}
                    </h3>
                    <p className="text-[#5a6270] text-xs leading-relaxed line-clamp-3 mb-4 flex-1">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <TagIcon className="h-3 w-3 text-[#5a6270]" />
                        {item.categories.slice(0, 2).map((cat) => (
                          <span key={cat} className="px-1.5 py-0.5 bg-[#2b3139] text-[#848e9c] text-[9px] rounded font-medium">
                            {cat}
                          </span>
                        ))}
                      </div>
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-[#5a6270] group-hover:text-[#0ecb81] transition-colors flex-shrink-0" />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Source Attribution */}
        <div className="text-center py-4">
          <p className="text-[#5a6270] text-xs">
            Haber kaynağı:{' '}
            <a href="https://bsekonomi.com" target="_blank" rel="noopener noreferrer" className="text-[#0ecb81] hover:underline">
              BS Ekonomi
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
