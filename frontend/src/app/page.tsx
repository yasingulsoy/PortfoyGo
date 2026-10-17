'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import Landing from '@/components/landing/Landing';
import OnboardingGuide from '@/components/onboarding/OnboardingGuide';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import PageTitle from '@/components/dashboard/PageTitle';
import PortfolioPerformanceCard from '@/components/dashboard/PortfolioPerformanceCard';
import AllocationDonutCard from '@/components/dashboard/AllocationDonutCard';
import LeadersCard from '@/components/dashboard/LeadersCard';
import RecentTransactionsCard from '@/components/dashboard/RecentTransactionsCard';
import LatestNewsCard from '@/components/dashboard/LatestNewsCard';
import MarketTicker from '@/components/market/MarketTicker';
import TrendingAssets from '@/components/market/TrendingAssets';
import WatchlistPanel from '@/components/market/WatchlistPanel';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  // Oturum yoksa yönlendirme yerine herkese açık tanıtım sayfası
  if (!user) return <Landing />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageTitle title={`${greeting()}, ${user.username}`} description="Portföyünün ve piyasaların özeti" />

      {!user.email_verified && (
        <Alert tone="info">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            E-posta adresinizi doğrulayın; liderlik tablosunda yer almak için gerekli.
            <Link href="/verify-email" className="font-semibold underline underline-offset-2">
              Şimdi doğrula
            </Link>
          </span>
        </Alert>
      )}

      <OnboardingGuide />

      {/* 1. satır: kayan piyasa şeridi (ABD hisseleri / kripto / döviz / emtia / izleme listesi) */}
      <MarketTicker />

      {/* 2. satır: performans grafiği + dağılım ve izleme listesi */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <PortfolioPerformanceCard className="xl:col-span-8" />
        <div className="flex min-w-0 flex-col gap-4 md:gap-6 xl:col-span-4">
          <AllocationDonutCard />
          <WatchlistPanel compact className="xl:flex-1" />
        </div>
      </div>

      {/* 3. satır: trend varlıklar + liderler */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <TrendingAssets className="xl:col-span-8" />
        <LeadersCard className="xl:col-span-4" />
      </div>

      {/* 4. satır: son işlemler + haberler */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <RecentTransactionsCard className="xl:col-span-8" />
        <LatestNewsCard className="xl:col-span-4" />
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}
