'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowPathIcon, ListBulletIcon, TrophyIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { leaderboardApi } from '@/lib/api';
import { cn } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Tabs from '@/components/ui/Tabs';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { PageLoader } from '@/components/ui/Spinner';
import Podium, { PodiumSkeleton } from '@/components/leaderboard/Podium';
import RankList, { RankListSkeleton } from '@/components/leaderboard/RankList';
import MyRankCard from '@/components/leaderboard/MyRankCard';
import { BOARD_COPY, normalizeLeaders, type Board } from '@/components/leaderboard/model';

const LIMIT = 50;

const BOARDS: { value: Board; label: string }[] = [
  { value: 'alltime', label: 'Tüm zamanlar' },
  { value: 'week', label: 'Bu hafta' },
];

export default function LeaderboardPage() {
  const { user, ready } = useRequireAuth();
  const [board, setBoard] = useState<Board>('alltime');

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ready ? `leaderboard:${board}:${LIMIT}` : null,
    () => leaderboardApi.list(LIMIT, board),
    { refreshInterval: 60_000 },
  );

  const leaders = useMemo(() => normalizeLeaders(data, board), [data, board]);

  if (!ready || !user) return <PageLoader />;

  const copy = BOARD_COPY[board];
  const rest = leaders.slice(3);
  const showSkeleton = isLoading && leaders.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Liderlik"
        title="Liderlik tablosu"
        description="En başarılı sanal yatırımcılar. Tablo her dakika otomatik güncellenir."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void mutate()}
            disabled={isValidating}
            icon={<ArrowPathIcon className={cn('h-4 w-4', isValidating && 'animate-spin')} aria-hidden="true" />}
          >
            Yenile
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs label="Sıralama türü" items={BOARDS} value={board} onChange={setBoard} className="self-start" />
        <p className="max-w-xl text-xs leading-relaxed text-muted sm:text-right">{copy.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
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
                icon={<ListBulletIcon />}
                title={copy.title}
                description={showSkeleton ? 'Yükleniyor' : `4–${leaders.length}. sıralar`}
              />
              {showSkeleton ? (
                <RankListSkeleton />
              ) : (
                <RankList leaders={rest} currentUsername={user.username} plLabel={board === 'week' ? 'Hafta K/Z' : 'K/Z'} />
              )}
            </Card>
          )}
        </div>

        <aside className="order-first lg:order-none">
          <div className="lg:sticky lg:top-24">
            <MyRankCard board={board} verified={user.email_verified} leaders={leaders} username={user.username} />
          </div>
        </aside>
      </div>
    </div>
  );
}
