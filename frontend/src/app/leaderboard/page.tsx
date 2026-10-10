'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ArrowPathIcon, TrophyIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { leaderboardApi } from '@/lib/api';
import { cn } from '@portfoygo/shared/format';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Breadcrumb from '@/components/common/Breadcrumb';
import { ToolbarButton } from '@/components/common/controls';
import Tabs from '@portfoygo/shared/ui/Tabs';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Podium, { PodiumSkeleton } from '@/components/leaderboard/Podium';
import RankList, { RankListSkeleton } from '@/components/leaderboard/RankList';
import MyRankCard from '@/components/leaderboard/MyRankCard';
import { BOARD_COPY, normalizeLeaders, type Board } from '@/components/leaderboard/model';
import SeasonBoard from '@/components/season/SeasonBoard';
import type { User } from '@/types';

const LIMIT = 50;

type View = 'season' | Board;

const VIEWS: { value: View; label: string }[] = [
  { value: 'season', label: 'Sezon' },
  { value: 'alltime', label: 'Tüm zamanlar' },
  { value: 'week', label: 'Bu hafta' },
];

const SEASON_DESCRIPTION =
  'Sezon sıralaması her ay yeniden başlar; yeni ve eski oyuncular aynı ay penceresinde yüzde getiriyle kıyaslanır.';

/** Yenile düğmesi bu sayfadaki tüm sıralama verilerini (sezon dahil) tazeler. */
const isRankingKey = (key: unknown) => {
  const k = Array.isArray(key) ? key[0] : key;
  return typeof k === 'string' && (k.startsWith('leaderboard:') || k.startsWith('seasons:'));
};

export default function LeaderboardPage() {
  const { user, ready } = useRequireAuth();
  const [view, setView] = useState<View>('season');
  const { mutate } = useSWRConfig();
  const [refreshing, setRefreshing] = useState(false);

  if (!ready || !user) return <PageLoader />;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await mutate(isRankingKey);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Liderlik tablosu"
        description={view === 'season' ? SEASON_DESCRIPTION : BOARD_COPY[view].description}
        actions={
          <>
            <Tabs label="Sıralama türü" items={VIEWS} value={view} onChange={setView} />
            <ToolbarButton
              iconOnly
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Sıralamayı yenile"
              title="Yenile"
              icon={<ArrowPathIcon className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />}
            />
            <Breadcrumb items="Liderlik" className="ml-2 hidden xl:block" />
          </>
        }
      />

      {view === 'season' ? <SeasonBoard user={user} /> : <ClassicBoard board={view} user={user} />}
    </div>
  );
}

/** Tüm zamanlar / bu hafta sıralaması. */
function ClassicBoard({ board, user }: { board: Board; user: User }) {
  const { data, error, isLoading, mutate } = useSWR(`leaderboard:${board}:${LIMIT}`, () => leaderboardApi.list(LIMIT, board), {
    refreshInterval: 60_000,
  });

  const leaders = useMemo(() => normalizeLeaders(data, board), [data, board]);

  const copy = BOARD_COPY[board];
  const rest = leaders.slice(3);
  const showSkeleton = isLoading && leaders.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4 md:space-y-6">
        {error && leaders.length > 0 && <Alert tone="error">Tablo güncellenemedi; son alınan sıralama gösteriliyor.</Alert>}

        {showSkeleton ? (
          <PodiumSkeleton />
        ) : error && leaders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<TrophyIcon />}
              title="Liderlik tablosu yüklenemedi"
              description={error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.'}
              action={<Button variant="secondary" size="sm" onClick={() => void mutate()}>Tekrar dene</Button>}
            />
          </Card>
        ) : leaders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<TrophyIcon />}
              title="Henüz sıralama yok"
              description={board === 'week' ? 'Bu hafta henüz işlem yapan doğrulanmış oyuncu yok.' : 'İlk işlemi yapan oyuncular burada görünecek.'}
            />
          </Card>
        ) : (
          <Podium leaders={leaders} currentUsername={user.username} />
        )}

        {(showSkeleton || rest.length > 0) && (
          <Card className="overflow-hidden">
            <CardHeader
              title={copy.title}
              description={showSkeleton ? 'Yükleniyor' : `4–${leaders.length}. sıralar`}
            />
            {showSkeleton ? (
              <RankListSkeleton />
            ) : (
              <div className="pb-2">
                <RankList leaders={rest} currentUsername={user.username} plLabel={board === 'week' ? 'Hafta K/Z' : 'K/Z'} />
              </div>
            )}
          </Card>
        )}
      </div>

      <aside className="order-first xl:order-none">
        <div className="xl:sticky xl:top-24">
          <MyRankCard board={board} verified={user.email_verified} leaders={leaders} username={user.username} />
        </div>
      </aside>
    </div>
  );
}
