'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Breadcrumb from '@/components/common/Breadcrumb';
import ArenaHero from '@/components/arena/ArenaHero';
import QuickRoundCard from '@/components/arena/QuickRoundCard';
import Challenges from '@/components/arena/Challenges';
import ArenaLeaders from '@/components/arena/ArenaLeaders';
import ArenaHistory from '@/components/arena/ArenaHistory';

export default function ArenaPage() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Arena"
        description="Birkaç dakikalık turlarda tek dokunuşla al-sat yap, canlı meydan okumalarda diğer oyuncularla yarış."
        actions={<Breadcrumb items="Arena" />}
      />

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <ArenaHero className="xl:col-span-7" />
        <QuickRoundCard className="order-first xl:order-none xl:col-span-5" />
      </div>

      <Challenges />

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <ArenaHistory className="xl:col-span-8" />
        <ArenaLeaders className="xl:col-span-4" />
      </div>
    </div>
  );
}
